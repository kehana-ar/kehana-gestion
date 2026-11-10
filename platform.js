/* KEHANA · capa de plataforma
   Conecta la herramienta con Supabase (datos + inicio de sesión), descargas,
   fotos de comprobantes e instalación como app (service worker). */
(function () {
  'use strict';
  var CFG = window.KEHANA_CONFIG || {};
  var configurado = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && !/PEGAR/.test(CFG.supabaseUrl + CFG.supabaseAnonKey));
  var libOk = !!(window.supabase && window.supabase.createClient);
  var sb = configurado && libOk ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  }) : null;
  var EMAIL = '';

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mapErr(e) {
    var code = (e && e.code === '42501') ? 'invalid_argument' : 'unavailable';
    var err = new Error((e && e.message) || 'Error de base de datos'); err.code = code; return err;
  }
  function newId() { var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = ''; for (var i = 0; i < 20; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

  /* ---------------- pantalla de ingreso ---------------- */
  var CSS = '#kh-gate{position:fixed;inset:0;z-index:200;background:var(--bg,#EEF0F3);color:var(--ink,#18202D);display:flex;align-items:center;justify-content:center;padding:24px max(16px,env(safe-area-inset-right,0px)) 24px max(16px,env(safe-area-inset-left,0px));overflow:auto}' +
    '#kh-gate .box{width:100%;max-width:380px;background:var(--surface,#fff);border:1px solid var(--line,#D8DCE3);border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:14px}' +
    '#kh-gate .kh-word{width:190px;height:35px;margin:4px 0 6px;background:var(--brand,#1F3D2B);-webkit-mask:url(icons/logo-kehana.png) left center/contain no-repeat;mask:url(icons/logo-kehana.png) left center/contain no-repeat}' +
    '#kh-gate h1{font:700 26px var(--f-display,system-ui);letter-spacing:.28em;margin:0}' +
    '#kh-gate p{margin:0;color:var(--muted,#5A6373);font-size:14px;line-height:1.45}' +
    '#kh-gate label{font-size:13px;font-weight:500;display:flex;flex-direction:column;gap:4px}' +
    '#kh-gate input{font:16px var(--f-body,system-ui);color:var(--ink,#18202D);background:var(--surface2,#F5F6F8);border:1px solid var(--line,#D8DCE3);border-radius:8px;padding:10px;min-height:44px}' +
    '#kh-gate button{font:600 15px var(--f-body,system-ui);border-radius:8px;padding:11px 14px;min-height:44px;cursor:pointer;border:1px solid var(--accent,#2B4870);background:var(--accent,#2B4870);color:var(--accent-ink,#fff)}' +
    '#kh-gate button.sec{background:transparent;color:var(--accent,#2B4870)}' +
    '#kh-gate .err{color:var(--bad,#B0261E);font-size:13.5px;min-height:1em}' +
    '#kh-gate code{font-size:12.5px;background:var(--surface2,#F5F6F8);padding:1px 4px;border-radius:4px}';
  function gate(html) {
    var g = document.getElementById('kh-gate');
    if (!g) {
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      g = document.createElement('div'); g.id = 'kh-gate'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true');
      document.body.appendChild(g);
    }
    g.innerHTML = '<div class="box"><div class="kh-word" role="img" aria-label="KEHANA"></div>' + html + '</div>';
    return g;
  }
  function cerrarGate() { var g = document.getElementById('kh-gate'); if (g) g.remove(); }
  function domListo() { return new Promise(function (r) { if (document.body) r(); else document.addEventListener('DOMContentLoaded', r, { once: true }); }); }

  function pedirIngreso() {
    return new Promise(function (resolve) {
      var g = gate('<p>Gestión de ventas, gastos, proveedores y personal.</p>' +
        '<form id="kh-login" novalidate><div style="display:flex;flex-direction:column;gap:12px">' +
        '<label>Mail<input id="kh-email" type="email" autocomplete="username" inputmode="email" required></label>' +
        '<label>Contraseña<input id="kh-pass" type="password" autocomplete="current-password" required></label>' +
        '<span class="err" id="kh-err"></span><button type="submit" id="kh-go">Entrar</button></div></form>');
      var f = g.querySelector('#kh-login');
      f.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var email = g.querySelector('#kh-email').value.trim(), pass = g.querySelector('#kh-pass').value, err = g.querySelector('#kh-err'), btn = g.querySelector('#kh-go');
        if (!email || !pass) { err.textContent = 'Completá el mail y la contraseña.'; return; }
        btn.disabled = true; btn.textContent = 'Entrando…'; err.textContent = '';
        try {
          var r = await sb.auth.signInWithPassword({ email: email, password: pass });
          if (r.error) { err.textContent = /invalid/i.test(r.error.message) ? 'Mail o contraseña incorrectos.' : 'No se pudo entrar: ' + r.error.message; return; }
          resolve(r.data.session);
        } catch (e) { err.textContent = 'Sin conexión. Revisá internet y probá de nuevo.'; }
        finally { btn.disabled = false; btn.textContent = 'Entrar'; }
      });
      setTimeout(function () { var i = g.querySelector('#kh-email'); if (i) i.focus(); }, 50);
    });
  }

  async function obtenerSesion() {
    await domListo();
    if (!libOk) { gate('<p>No se pudo cargar la conexión con la base de datos. Revisá internet y volvé a abrir la app.</p><button onclick="location.reload()">Reintentar</button>'); return null; }
    if (!configurado) { gate('<p>Falta configurar la conexión con Supabase. Completá <code>config.js</code> con la URL y la clave pública del proyecto (paso 2 de la guía).</p>'); return null; }
    var s = (await sb.auth.getSession()).data.session;
    if (!s) s = await pedirIngreso();
    EMAIL = (s && s.user && s.user.email) || '';
    var m = await sb.from('miembros').select('user_id').eq('user_id', s.user.id).maybeSingle();
    if (m.error || !m.data) {
      gate('<p>Entraste como <b>' + esc(EMAIL) + '</b>, pero este usuario todavía no está habilitado para ver los datos de KEHANA.</p>' +
        '<p>Habilitalo en Supabase con el paso 3.3 de la guía y volvé a abrir la app.</p>' +
        '<button type="button" id="kh-retry">Ya lo habilité</button><button type="button" class="sec" id="kh-out">Usar otro usuario</button>');
      document.getElementById('kh-retry').onclick = function () { location.reload(); };
      document.getElementById('kh-out').onclick = salir;
      return null;
    }
    cerrarGate();
    return s;
  }
  var sesionP = obtenerSesion().catch(function () {
    gate('<p>No se pudo conectar con la base de datos. Revisá internet y volvé a abrir la app.</p><button onclick="location.reload()">Reintentar</button>');
    return null;
  });
  async function salir() { try { await sb.auth.signOut(); } catch (e) { } location.reload(); }

  /* ---------------- base de datos (misma forma que usa la herramienta) ---------------- */
  var cache = new Map(), colSubs = new Map(), docSubs = new Map(), cargado = false, fallo = null, ultimaCarga = 0, pendientes = new Set(), programado = false;
  function k(c, id) { return c + '/' + id; }
  function snapCol(c) {
    var docs = []; cache.forEach(function (v, kk) { var i = kk.indexOf('/'); if (kk.slice(0, i) === c) docs.push({ id: kk.slice(i + 1), exists: true, data: (function (x) { return function () { return clone(x); }; })(v) }); });
    return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: {} };
  }
  function snapDoc(path) { var v = cache.get(path); return { id: path.slice(path.indexOf('/') + 1), exists: v !== undefined, data: function () { return v === undefined ? undefined : clone(v); }, metadata: {} }; }
  function avisar(c) {
    pendientes.add(c);
    if (programado) return; programado = true;
    setTimeout(function () {
      programado = false; var cols = Array.from(pendientes); pendientes.clear(); if (!cargado) return;
      cols.forEach(function (cc) {
        (colSubs.get(cc) || []).forEach(function (s) { try { s.next(snapCol(cc)); } catch (e) { console.error(e); } });
        docSubs.forEach(function (arr, path) { if (path.indexOf(cc + '/') === 0) arr.forEach(function (s) { try { s.next(snapDoc(path)); } catch (e) { console.error(e); } }); });
      });
    }, 0);
  }
  function avisarTodo() { colSubs.forEach(function (_, c) { avisar(c); }); docSubs.forEach(function (_, p) { avisar(p.slice(0, p.indexOf('/'))); }); }
  function avisarError(e) { colSubs.forEach(function (a) { a.forEach(function (s) { s.error && s.error(e); }); }); docSubs.forEach(function (a) { a.forEach(function (s) { s.error && s.error(e); }); }); }

  async function cargarTodo() {
    var todos = [], desde = 0;
    for (;;) {
      var r = await sb.from('docs').select('col,id,data').order('col').order('id').range(desde, desde + 999);
      if (r.error) throw mapErr(r.error);
      todos = todos.concat(r.data); if (r.data.length < 1000) break; desde += 1000;
    }
    cache.clear(); todos.forEach(function (row) { cache.set(k(row.col, row.id), row.data); });
    cargado = true; fallo = null; ultimaCarga = Date.now(); avisarTodo();
  }
  function tiempoReal() {
    sb.channel('kehana-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, function (p) {
        if (p.eventType === 'DELETE') { var o = p.old || {}; if (o.col && o.id) { cache.delete(k(o.col, o.id)); avisar(o.col); } }
        else if (p.new && p.new.col) { cache.set(k(p.new.col, p.new.id), p.new.data); avisar(p.new.col); }
      })
      .subscribe(function (status) { if (status === 'SUBSCRIBED' && cargado) cargarTodo().catch(function () { }); });
  }
  /* Refresco de respaldo: al volver a la app, al recuperar internet y cada 30 s mientras está abierta.
     Así los datos se ponen al día aunque la sincronización en vivo se corte (pasa en iPhone al bloquear la pantalla). */
  var refrescando = false;
  function refrescar(minimo) {
    if (refrescando || !sb || ultimaCarga === 0 && !fallo) return;
    if (Date.now() - ultimaCarga < (minimo || 0)) return;
    refrescando = true;
    cargarTodo().catch(function () { }).then(function () { refrescando = false; });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refrescar(3000); });
  window.addEventListener('pageshow', function () { refrescar(3000); });
  window.addEventListener('focus', function () { refrescar(3000); });
  window.addEventListener('online', function () { refrescar(0); });
  setInterval(function () { if (document.visibilityState === 'visible') refrescar(25000); }, 30000);

  function docRef(c, id) {
    var path = k(c, id);
    return {
      id: id, path: path,
      set: async function (d) {
        var data = clone(d), r = await sb.from('docs').upsert({ col: c, id: id, data: data });
        if (r.error) throw mapErr(r.error);
        cache.set(path, data); avisar(c);
      },
      update: async function (d) { return this.set(Object.assign({}, cache.get(path) || {}, clone(d))); },
      delete: async function () {
        var r = await sb.from('docs').delete().match({ col: c, id: id });
        if (r.error) throw mapErr(r.error);
        cache.delete(path); avisar(c);
      },
      get: async function () { return snapDoc(path); },
      onSnapshot: function (next, error) {
        var s = { next: next, error: error }, a = docSubs.get(path) || []; a.push(s); docSubs.set(path, a);
        if (cargado) setTimeout(function () { next(snapDoc(path)); }, 0); else if (fallo && error) setTimeout(function () { error(fallo); }, 0);
        return function () { var b = docSubs.get(path) || []; docSubs.set(path, b.filter(function (x) { return x !== s; })); };
      }
    };
  }
  var DB = {
    collection: function (c) {
      return {
        path: c,
        doc: function (id) { return docRef(c, id || newId()); },
        onSnapshot: function (next, error) {
          var s = { next: next, error: error }, a = colSubs.get(c) || []; a.push(s); colSubs.set(c, a);
          if (cargado) setTimeout(function () { next(snapCol(c)); }, 0); else if (fallo && error) setTimeout(function () { error(fallo); }, 0);
          return function () { var b = colSubs.get(c) || []; colSubs.set(c, b.filter(function (x) { return x !== s; })); };
        }
      };
    },
    doc: function (path) { var i = path.indexOf('/'); return docRef(path.slice(0, i), path.slice(i + 1)); }
  };
  var dbP = sesionP.then(function (s) {
    if (!s) return new Promise(function () { }); // queda esperando: la pantalla de ingreso explica qué falta
    cargarTodo().catch(function (e) { fallo = e; avisarError(e); });
    tiempoReal();
    return DB;
  });

  /* ---------------- descargas (PDF, respaldo, CSV) ---------------- */
  var DESCARGAS = {
    save: async function (o) {
      var data = o.data, nombre = o.filename || 'kehana.txt';
      var tipo = /\.pdf$/i.test(nombre) ? 'application/pdf' : /\.json$/i.test(nombre) ? 'application/json' : /\.csv$/i.test(nombre) ? 'text/csv' : 'text/plain';
      var blob = data instanceof Blob ? data : new Blob([data], { type: tipo + ';charset=utf-8' });
      var tactil = window.matchMedia && matchMedia('(pointer:coarse)').matches;
      if (tactil && navigator.canShare) {
        try {
          var file = new File([blob], nombre, { type: blob.type || tipo });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: nombre });
            return { status: 'saved' };
          }
        } catch (e) { if (e && e.name === 'AbortError') { var d = new Error('cancelado'); d.code = 'declined'; throw d; } }
      }
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = nombre; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return { status: 'saved' };
    }
  };

  /* ---------------- fotos de comprobantes (Supabase Storage) ---------------- */
  var BUCKET = 'comprobantes';
  var ASSETS = {
    upload: async function (file) {
      var ext = ((file.name || '').match(/\.[a-z0-9]{2,5}$/i) || [''])[0].toLowerCase();
      var path = new Date().toISOString().slice(0, 10) + '/' + newId() + ext;
      var r = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (r.error) { var e = new Error(r.error.message); e.code = 'upload_failed'; throw e; }
      return { id: path, url: null, sizeBytes: file.size, contentType: file.type };
    }
  };
  async function assetUrl(id) {
    var r = await sb.storage.from(BUCKET).createSignedUrl(id, 600);
    return r.error ? null : r.data.signedUrl;
  }

  /* ---------------- importar respaldo + cuenta (en Ajustes) ---------------- */
  var COLS = ['ventas', 'compras', 'movprov', 'recepciones', 'empleados', 'movpers', 'gastos', 'asistencia'];
  var IMPORT = null;
  function filasDe(j) {
    var filas = [];
    if (j.config) filas.push({ col: 'config', id: 'general', data: j.config });
    COLS.forEach(function (c) { (j[c] || []).forEach(function (r) { if (!r || !r.id) return; var d = Object.assign({}, r); delete d.id; filas.push({ col: c, id: String(r.id), data: d }); }); });
    return filas;
  }
  function tarjetaCuenta() {
    var aj = document.getElementById('v-ajustes'); if (!aj || document.getElementById('kh-cuenta')) return;
    var c = document.createElement('div'); c.className = 'card'; c.id = 'kh-cuenta';
    c.innerHTML = '<h2>Cuenta y app</h2><p class="small" id="kh-quien"></p>' +
      '<div class="actions"><button class="btn sm" type="button" id="kh-salir">Cerrar sesión</button></div>' +
      '<h3>Importar respaldo</h3><p class="small muted" style="max-width:62ch">Elegí un archivo de respaldo completo (.json) exportado desde KEHANA. Los registros con el mismo identificador se reemplazan; los demás no se tocan.</p>' +
      '<input type="file" id="kh-imp" accept="application/json,.json"><div id="kh-imp-fb"></div>';
    aj.appendChild(c);
    c.querySelector('#kh-salir').addEventListener('click', salir);
    c.querySelector('#kh-imp').addEventListener('change', async function (ev) {
      var fb = c.querySelector('#kh-imp-fb'), f = ev.target.files[0]; IMPORT = null; fb.innerHTML = ''; if (!f) return;
      try {
        var j = JSON.parse(await f.text());
        if (j.negocio !== 'KEHANA') { fb.innerHTML = '<div class="alert bad">Este archivo no es un respaldo de KEHANA.</div>'; return; }
        IMPORT = filasDe(j);
        var cuenta = {}; IMPORT.forEach(function (r) { cuenta[r.col] = (cuenta[r.col] || 0) + 1; });
        fb.innerHTML = '<div class="alert info">Respaldo del ' + esc(String(j.exportado || '').slice(0, 10).split('-').reverse().join('/')) + ': ' +
          Object.keys(cuenta).map(function (x) { return x + ' ' + cuenta[x]; }).join(' · ') +
          '<div class="actions" style="margin-top:8px"><button class="btn sm pri" type="button" id="kh-imp-go">Importar ' + IMPORT.length + ' registros</button></div></div>';
        fb.querySelector('#kh-imp-go').addEventListener('click', importar);
      } catch (e) { fb.innerHTML = '<div class="alert bad">No se pudo leer el archivo. Tiene que ser el .json del respaldo completo.</div>'; }
    });
    pintarQuien();
  }
  function pintarQuien() { var q = document.getElementById('kh-quien'); if (q) q.textContent = EMAIL ? 'Entraste como ' + EMAIL + '. Los datos se guardan en tu base de Supabase y se sincronizan entre el teléfono y la computadora.' : ''; }
  async function importar() {
    var fb = document.getElementById('kh-imp-fb'), b = document.getElementById('kh-imp-go'); if (!IMPORT || !sb) return;
    b.disabled = true; b.textContent = 'Importando…';
    try {
      for (var i = 0; i < IMPORT.length; i += 500) {
        var r = await sb.from('docs').upsert(IMPORT.slice(i, i + 500));
        if (r.error) throw r.error;
      }
      await cargarTodo();
      fb.innerHTML = '<div class="alert ok">Listo: se importaron ' + IMPORT.length + ' registros.</div>'; IMPORT = null;
    } catch (e) { b.disabled = false; b.textContent = 'Reintentar importación'; fb.insertAdjacentHTML('beforeend', '<div class="alert bad">No se pudo importar: ' + esc(e.message || e) + '</div>'); }
  }
  sesionP.then(function () { domListo().then(function () { tarjetaCuenta(); pintarQuien(); }); });
  domListo().then(tarjetaCuenta);

  /* ---------------- puente con la herramienta ---------------- */
  window.KEHANA_APP = { assetUrl: assetUrl, salir: salir };
  window.claude = {
    use: function (name) {
      if (name === 'db') return dbP;
      if (name === 'downloads') return Promise.resolve(DESCARGAS);
      if (name === 'assets') return sesionP.then(function (s) { return s ? ASSETS : null; });
      return Promise.resolve(null);
    }
  };

  /* ---------------- app instalable ---------------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  }
})();
