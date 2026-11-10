-- KEHANA · estructura de la base de datos en Supabase
-- Pegá TODO este archivo en Supabase → SQL Editor → New query → Run.

-- 1) Tabla única de registros (ventas, gastos, personal, etc.)
create table if not exists public.docs (
  col        text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  updated_by uuid        default auth.uid(),
  primary key (col, id)
);

create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- 2) Personas habilitadas para ver y cargar datos
create table if not exists public.miembros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre  text,
  creado  timestamptz not null default now()
);

create or replace function public.es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where user_id = auth.uid());
$$;

-- 3) Seguridad: solo los miembros ven y modifican los datos
alter table public.docs     enable row level security;
alter table public.miembros enable row level security;

-- (lectura con política directa: así la sincronización en vivo avisa también las cargas nuevas)
drop policy if exists docs_miembros on public.docs;
drop policy if exists docs_leer on public.docs;
drop policy if exists docs_escribir on public.docs;
drop policy if exists docs_editar on public.docs;
drop policy if exists docs_borrar on public.docs;
create policy docs_leer on public.docs for select to authenticated
  using (exists (select 1 from public.miembros m where m.user_id = auth.uid()));
create policy docs_escribir on public.docs for insert to authenticated
  with check (exists (select 1 from public.miembros m where m.user_id = auth.uid()));
create policy docs_editar on public.docs for update to authenticated
  using (exists (select 1 from public.miembros m where m.user_id = auth.uid()))
  with check (exists (select 1 from public.miembros m where m.user_id = auth.uid()));
create policy docs_borrar on public.docs for delete to authenticated
  using (exists (select 1 from public.miembros m where m.user_id = auth.uid()));
alter table public.docs replica identity full;

drop policy if exists miembros_ver_propio on public.miembros;
create policy miembros_ver_propio on public.miembros for select to authenticated
  using (user_id = auth.uid());

-- Permisos de la API de datos (solo usuarios con sesión; las políticas de arriba filtran)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.docs to authenticated;
grant select on public.miembros to authenticated;
grant execute on function public.es_miembro() to authenticated;
revoke all on public.docs from anon;
revoke all on public.miembros from anon;

-- 4) Sincronización en vivo entre el teléfono y la computadora
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 5) Fotos de remitos y comprobantes (privadas)
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

drop policy if exists comprobantes_ver on storage.objects;
create policy comprobantes_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and public.es_miembro());
drop policy if exists comprobantes_subir on storage.objects;
create policy comprobantes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and public.es_miembro());
drop policy if exists comprobantes_borrar on storage.objects;
create policy comprobantes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'comprobantes' and public.es_miembro());

-- =====================================================================
-- DESPUÉS de crear tu usuario (Authentication → Users → Add user),
-- ejecutá SOLO esta línea, cambiando el mail por el tuyo:
--
--   insert into public.miembros (user_id, nombre)
--   select id, 'Kevin' from auth.users where email = 'TU_MAIL@ejemplo.com';
-- =====================================================================
