-- Auth y usuarios (ROADMAP Fase 1): registro solo por invitación (§5.1) y
-- preferencias de vino (§5.2, §6.5). Ver docs/SCOPE.md.
--
-- * invitaciones: lista de emails permitidos, con el rol que recibirá cada uno.
-- * handle_new_user() se redefine: sin invitación válida se rechaza el alta en
--   auth.users; con ella, se marca usada y el perfil recibe su rol.
-- * hook_antes_de_crear_usuario(): mismo filtro como hook "Before User Created"
--   de Supabase Auth, para que la API devuelva un 403 claro en vez de un 500.
-- * preferencias_vino: gustos de cada usuario; solo los ve y edita él.

-- =====================================================================
-- Invitaciones
-- =====================================================================

create table public.invitaciones (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  rol         public.rol_usuario not null default 'user',
  creada_por  uuid default auth.uid() references auth.users (id) on delete set null,
  usada_por   uuid references auth.users (id) on delete set null,
  usada_en    timestamptz,
  caduca      timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint invitaciones_email_check
    check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- usada_por puede quedar a null si se borra el usuario, pero sigue usada.
  constraint invitaciones_usada_check check (usada_por is null or usada_en is not null)
);

comment on table public.invitaciones is
  'Emails autorizados a registrarse (fase privada). Usada = usada_en no nulo.';

-- Una sola invitación sin usar por email. now() no puede ir en un índice, así
-- que una caducada sin usar también cuenta: el admin la borra o la renueva.
create unique index invitaciones_email_activa_key
  on public.invitaciones (email) where usada_en is null;
create index invitaciones_creada_por_idx on public.invitaciones (creada_por)
  where creada_por is not null;
create index invitaciones_usada_por_idx on public.invitaciones (usada_por)
  where usada_por is not null;

-- El email se guarda siempre normalizado (minúsculas, sin espacios).
create or replace function public.normalizar_email_invitacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email = lower(btrim(new.email));
  return new;
end
$$;

create trigger normalizar_email before insert or update of email on public.invitaciones
  for each row execute function public.normalizar_email_invitacion();
create trigger set_updated_at before update on public.invitaciones
  for each row execute function public.set_updated_at();

-- Invitación válida (no usada, no caducada) más reciente para un email.
-- security definer: la usan el trigger de alta y el hook, que no pasan por RLS.
create or replace function public.invitacion_valida(p_email text)
returns public.invitaciones
language sql
stable
security definer
set search_path = ''
as $$
  select i.*
  from public.invitaciones i
  where i.email = lower(btrim(p_email))
    and i.usada_en is null
    and (i.caduca is null or i.caduca > now())
  order by i.created_at desc
  limit 1
$$;

revoke execute on function public.invitacion_valida(text) from public, anon, authenticated;

-- =====================================================================
-- Alta de usuarios: solo con invitación
-- =====================================================================

-- Redefine la de la migración inicial. Los metadatos los controla el usuario,
-- así que se leen de forma tolerante; el rol sale siempre de la invitación.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  inv_id uuid;
  inv_rol public.rol_usuario;
begin
  select i.id, i.rol into inv_id, inv_rol
  from public.invitaciones i
  where i.email = lower(btrim(coalesce(new.email, '')))
    and i.usada_en is null
    and (i.caduca is null or i.caduca > now())
  order by i.created_at desc
  limit 1
  for update;

  if inv_id is null then
    raise exception 'invitacion_requerida: el registro es solo por invitación'
      using errcode = 'P0001',
            hint = 'Pide a un admin que cree una invitación para este email.';
  end if;

  update public.invitaciones
  set usada_por = new.id, usada_en = now()
  where id = inv_id;

  insert into public.perfiles (id, nombre, mayor_de_edad_confirmado, idioma, rol)
  values (
    new.id,
    nullif(btrim(meta ->> 'nombre'), ''),
    coalesce(meta ->> 'mayor_de_edad_confirmado', '') = 'true',
    case when meta ->> 'idioma' = 'en' then 'en'::public.idioma else 'es'::public.idioma end,
    inv_rol
  );
  return new;
end
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Hook "Before User Created" de Supabase Auth (se activa en el dashboard:
-- Authentication → Hooks). Rechaza el alta con un 403 legible antes de tocar
-- auth.users; el trigger de arriba sigue siendo la garantía si no está activo.
create or replace function public.hook_antes_de_crear_usuario(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (public.invitacion_valida(coalesce(event -> 'user' ->> 'email', ''))).id is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'invitation_required'
      )
    );
  end if;
  return '{}'::jsonb;
end
$$;

revoke execute on function public.hook_antes_de_crear_usuario(jsonb) from public, anon, authenticated;
grant execute on function public.hook_antes_de_crear_usuario(jsonb) to supabase_auth_admin;

-- =====================================================================
-- Preferencias de vino (§6.5)
-- =====================================================================

create table public.preferencias_vino (
  usuario_id        uuid primary key references auth.users (id) on delete cascade,
  tipos             public.tipo_vino[] not null default '{}',
  crianzas          public.crianza_vino[] not null default '{}',
  -- Arrays de ids sin FK (Postgres no la admite en arrays): la app filtra los
  -- que ya no existan.
  variedad_uva_ids  uuid[] not null default '{}',
  denominacion_ids  uuid[] not null default '{}',
  precio_min        numeric(10, 2),
  precio_max        numeric(10, 2),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint preferencias_vino_precio_min_check check (precio_min >= 0),
  constraint preferencias_vino_precio_max_check check (precio_max >= 0),
  constraint preferencias_vino_precio_check
    check (precio_min is null or precio_max is null or precio_min <= precio_max)
);

create trigger set_updated_at before update on public.preferencias_vino
  for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.invitaciones      enable row level security;
alter table public.preferencias_vino enable row level security;

revoke all on public.invitaciones, public.preferencias_vino from anon, authenticated;

-- --- Invitaciones: solo admin ------------------------------------------

grant select, insert, update, delete on public.invitaciones to authenticated;

create policy "admin lee" on public.invitaciones
  for select to authenticated using ((select public.is_admin()));
create policy "admin inserta" on public.invitaciones
  for insert to authenticated with check ((select public.is_admin()));
create policy "admin actualiza" on public.invitaciones
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin borra" on public.invitaciones
  for delete to authenticated using ((select public.is_admin()));

-- --- Preferencias de vino: cada usuario la suya (ni siquiera el admin) --

grant select, insert, update, delete on public.preferencias_vino to authenticated;

create policy "propia lee" on public.preferencias_vino
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "propia inserta" on public.preferencias_vino
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "propia actualiza" on public.preferencias_vino
  for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "propia borra" on public.preferencias_vino
  for delete to authenticated using (usuario_id = (select auth.uid()));

-- =====================================================================
-- Semilla: admins iniciales
-- =====================================================================

-- Los emails de los admins iniciales no se guardan en el repositorio (es
-- público). En producción se sembraron al aplicar esta migración y ahora se
-- gestionan desde /admin/invitaciones y /admin/usuarios. En una base nueva,
-- el primer admin se crea a mano con el SQL de abajo, cambiando el email:
--
--   insert into public.invitaciones (email, rol, creada_por)
--   values ('admin@example.com', 'admin', null)
--   on conflict do nothing;
--
-- y, si ya se había registrado:
--
--   update public.perfiles p set rol = 'admin'
--   from auth.users u
--   where p.id = u.id and lower(u.email) = 'admin@example.com';
