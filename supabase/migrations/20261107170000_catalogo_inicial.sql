-- Esquema inicial: catálogo (§6.1), medios y fuentes (§6.4), perfiles (§6.5, mínima)
-- y políticas RLS base (§10). Ver docs/SCOPE.md.
--
-- Va todo en un solo fichero para que se aplique en una única transacción:
-- ninguna tabla queda expuesta sin RLS a mitad de despliegue.
--
-- Convención de nombres (aplica a todas las migraciones):
--   * snake_case en español, sin tildes ni ñ: ñ → n, á → a… (anadas, vinedo).
--     Excepción: "año" se escribe `anio` (anio, anio_fundacion).
--   * Tablas en plural; tablas puente `<a>_<b>` (bodega_denominaciones, anada_variedades).
--   * PK `id uuid` (gen_random_uuid()); FKs `<entidad_en_singular>_id`;
--     las tablas puente usan PK compuesta.
--   * Enums con nombre en singular (tipo_vino) y valores en minúscula snake_case.
--   * `created_at` y `updated_at` (timestamptz); `updated_at` lo mantiene el
--     trigger public.set_updated_at().
--   * Índices `<tabla>_<columnas>_idx`, únicos `<tabla>_<columnas>_key`.
--   * Políticas RLS con nombre descriptivo en español.

-- =====================================================================
-- Enums
-- =====================================================================

create type public.tipo_denominacion as enum ('doca', 'do', 'do_pago', 'vc', 'igp');
create type public.color_uva as enum ('tinta', 'blanca', 'rosada');
create type public.estado_bodega as enum ('activa', 'cerrada');
create type public.tipo_servicio as enum (
  'cata', 'visita', 'restaurante', 'alojamiento', 'evento', 'tienda', 'otra'
);
create type public.tipo_vino as enum (
  'tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja'
);
create type public.crianza_vino as enum (
  'joven', 'roble', 'crianza', 'reserva', 'gran_reserva', 'otra'
);
create type public.tipo_imagen as enum ('botella', 'etiqueta', 'bodega', 'vinedo', 'otra');
create type public.estado_enlace as enum ('sin_comprobar', 'ok', 'fallando', 'oculto');
create type public.tipo_fuente as enum (
  'tienda', 'bodega', 'consejo_regulador', 'guia', 'otra'
);
create type public.estado_ejecucion as enum ('en_curso', 'ok', 'parcial', 'error');
-- Entidades a las que apuntan registros_fuente y comprobaciones_enlace.
-- Se ampliará (alter type … add value) con tiendas, ofertas, premios…
create type public.entidad_catalogo as enum (
  'denominacion', 'variedad_uva', 'bodega', 'servicio_bodega', 'vino', 'anada', 'imagen'
);
create type public.estado_emparejamiento as enum (
  'pendiente', 'emparejado', 'revision', 'descartado'
);
create type public.rol_usuario as enum ('user', 'admin');
create type public.idioma as enum ('es', 'en');
create type public.tema as enum ('claro', 'oscuro', 'sistema');

-- =====================================================================
-- Funciones comunes
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- =====================================================================
-- Fuentes (antes que el catálogo: bodegas y vinos la referencian)
-- =====================================================================

create table public.fuentes (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  slug          text not null,
  tipo          public.tipo_fuente not null,
  url_base      text not null,
  frecuencia    text not null default 'semanal',
  activa        boolean not null default true,
  notas_robots  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fuentes_slug_key unique (slug),
  constraint fuentes_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint fuentes_url_base_check check (url_base ~* '^https?://')
);

-- =====================================================================
-- Catálogo (§6.1)
-- =====================================================================

create table public.denominaciones (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  slug         text not null,
  tipo         public.tipo_denominacion not null,
  comunidad    text,
  web          text,
  descripcion  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint denominaciones_slug_key unique (slug),
  constraint denominaciones_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint denominaciones_web_check check (web ~* '^https?://')
);

create table public.variedades_uva (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null,
  sinonimos   text[] not null default '{}',
  color       public.color_uva,  -- null = desconocido
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint variedades_uva_slug_key unique (slug),
  constraint variedades_uva_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.bodegas (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  slug            text not null,
  descripcion     text,
  direccion       text,
  codigo_postal   text,
  municipio       text,
  provincia       text,
  comunidad       text,
  ubicacion       extensions.geography(Point, 4326),
  web             text,
  telefono        text,
  email           text,
  -- {"instagram": "https://…", "facebook": "https://…"}
  redes           jsonb not null default '{}',
  anio_fundacion  smallint,
  hectareas       numeric(8, 2),
  estado          public.estado_bodega not null default 'activa',
  -- Fuente principal de la ficha (atribución); la fecha es updated_at.
  fuente_id       uuid references public.fuentes (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint bodegas_slug_key unique (slug),
  constraint bodegas_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint bodegas_web_check check (web ~* '^https?://'),
  constraint bodegas_email_check check (email ~* '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint bodegas_redes_check check (jsonb_typeof(redes) = 'object'),
  constraint bodegas_anio_fundacion_check check (anio_fundacion between 800 and 2100),
  constraint bodegas_hectareas_check check (hectareas >= 0)
);

-- Una bodega puede elaborar en varias D.O. (N:M).
create table public.bodega_denominaciones (
  bodega_id        uuid not null references public.bodegas (id) on delete cascade,
  denominacion_id  uuid not null references public.denominaciones (id) on delete restrict,
  principal        boolean not null default false,
  created_at       timestamptz not null default now(),
  primary key (bodega_id, denominacion_id)
);

create table public.servicios_bodega (
  id                uuid primary key default gen_random_uuid(),
  bodega_id         uuid not null references public.bodegas (id) on delete cascade,
  tipo              public.tipo_servicio not null,
  titulo            text not null,
  descripcion       text,
  precio_desde      numeric(8, 2),
  duracion_minutos  integer,
  idiomas           text[] not null default '{}',  -- códigos ISO 639-1
  horario           text,                          -- horario / temporada, texto libre
  url_reserva       text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint servicios_bodega_precio_desde_check check (precio_desde >= 0),
  constraint servicios_bodega_duracion_minutos_check check (duracion_minutos > 0),
  constraint servicios_bodega_url_reserva_check check (url_reserva ~* '^https?://')
);

create table public.vinos (
  id               uuid primary key default gen_random_uuid(),
  -- restrict: borrar una bodega con vinos debe ser una decisión explícita.
  bodega_id        uuid not null references public.bodegas (id) on delete restrict,
  nombre           text not null,
  slug             text not null,  -- único global: /vino/[slug]
  tipo             public.tipo_vino not null,
  crianza          public.crianza_vino,
  denominacion_id  uuid references public.denominaciones (id) on delete restrict,
  descripcion      text,
  fuente_id        uuid references public.fuentes (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint vinos_slug_key unique (slug),
  constraint vinos_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.anadas (
  id                   uuid primary key default gen_random_uuid(),
  vino_id              uuid not null references public.vinos (id) on delete cascade,
  anio                 smallint,  -- null = sin añada
  grado                numeric(4, 2),
  meses_crianza        smallint,
  notas_cata           text,
  maridaje             text,
  temp_servicio_min    numeric(3, 1),
  temp_servicio_max    numeric(3, 1),
  produccion_botellas  integer,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- nulls not distinct: como mucho una fila "sin añada" por vino.
  constraint anadas_vino_id_anio_key unique nulls not distinct (vino_id, anio),
  constraint anadas_anio_check check (anio between 1800 and 2100),
  constraint anadas_grado_check check (grado between 0 and 25),
  constraint anadas_meses_crianza_check check (meses_crianza >= 0),
  constraint anadas_temp_servicio_check check (temp_servicio_min <= temp_servicio_max),
  constraint anadas_produccion_botellas_check check (produccion_botellas > 0)
);

-- Composición por añada (puede variar cada año). La suma ≤ 100 % la valida
-- la aplicación o el scraper, no la base de datos.
create table public.anada_variedades (
  anada_id     uuid not null references public.anadas (id) on delete cascade,
  variedad_id  uuid not null references public.variedades_uva (id) on delete restrict,
  porcentaje   numeric(5, 2),  -- null = se desconoce
  created_at   timestamptz not null default now(),
  primary key (anada_id, variedad_id),
  constraint anada_variedades_porcentaje_check check (porcentaje > 0 and porcentaje <= 100)
);

-- =====================================================================
-- Medios y fuentes (§6.4)
-- =====================================================================

-- Imágenes enlazadas (no se copian, §9). Una FK por tipo de entidad, con
-- exactamente una rellena: así hay integridad referencial y borrado en cascada.
create table public.imagenes (
  id             uuid primary key default gen_random_uuid(),
  bodega_id      uuid references public.bodegas (id) on delete cascade,
  vino_id        uuid references public.vinos (id) on delete cascade,
  anada_id       uuid references public.anadas (id) on delete cascade,
  servicio_id    uuid references public.servicios_bodega (id) on delete cascade,
  url            text not null,
  tipo           public.tipo_imagen not null,
  fuente_id      uuid references public.fuentes (id) on delete set null,
  atribucion     text,
  alt            text,
  principal      boolean not null default false,
  orden          smallint not null default 0,
  -- Lo actualiza el comprobador de enlaces; la interfaz oculta 'oculto'.
  estado_enlace  public.estado_enlace not null default 'sin_comprobar',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint imagenes_entidad_check
    check (num_nonnulls(bodega_id, vino_id, anada_id, servicio_id) = 1),
  constraint imagenes_url_check check (url ~* '^https?://')
);

create table public.ejecuciones_scraper (
  id           uuid primary key default gen_random_uuid(),
  fuente_id    uuid not null references public.fuentes (id) on delete cascade,
  inicio       timestamptz not null default now(),
  fin          timestamptz,
  estado       public.estado_ejecucion not null default 'en_curso',
  nuevos       integer not null default 0,
  actualizados integer not null default 0,
  errores      integer not null default 0,
  log          text,
  run_url      text,  -- enlace a la ejecución de GitHub Actions
  constraint ejecuciones_scraper_contadores_check
    check (nuevos >= 0 and actualizados >= 0 and errores >= 0),
  constraint ejecuciones_scraper_fin_check check (fin >= inicio)
);

-- Lo leído de cada fuente, separado del catálogo "limpio" para poder
-- reprocesar, auditar y deduplicar. La entidad asociada es polimórfica
-- (sin FK) porque también apuntará a ofertas, premios…
create table public.registros_fuente (
  id                        uuid primary key default gen_random_uuid(),
  fuente_id                 uuid not null references public.fuentes (id) on delete cascade,
  id_externo                text not null,
  url                       text,
  datos                     jsonb not null,
  entidad_tipo              public.entidad_catalogo,
  entidad_id                uuid,
  confianza_emparejamiento  numeric(4, 3),
  estado_emparejamiento     public.estado_emparejamiento not null default 'pendiente',
  visto_por_ultima_vez      timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  -- Upsert idempotente por fuente + id externo.
  constraint registros_fuente_fuente_id_id_externo_key unique (fuente_id, id_externo),
  constraint registros_fuente_entidad_check
    check ((entidad_tipo is null) = (entidad_id is null)),
  constraint registros_fuente_confianza_check
    check (confianza_emparejamiento between 0 and 1)
);

-- Estado de cada URL referenciada por una entidad (§8). Solo admin: el
-- comprobador propaga el resultado visible a la entidad (imagenes.estado_enlace…).
create table public.comprobaciones_enlace (
  id                   uuid primary key default gen_random_uuid(),
  url                  text not null,
  entidad_tipo         public.entidad_catalogo not null,
  entidad_id           uuid not null,
  ultimo_estado_http   smallint,
  ultimo_error         text,
  ultima_comprobacion  timestamptz,
  fallos_consecutivos  smallint not null default 0,
  oculto               boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint comprobaciones_enlace_entidad_url_key unique (entidad_tipo, entidad_id, url),
  constraint comprobaciones_enlace_fallos_check check (fallos_consecutivos >= 0)
);

-- =====================================================================
-- Perfiles (§6.5, mínima; el resto de tablas de usuario llegará después)
-- =====================================================================

create table public.perfiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  nombre                    text,
  rol                       public.rol_usuario not null default 'user',
  mayor_de_edad_confirmado  boolean not null default false,
  idioma                    public.idioma not null default 'es',
  tema                      public.tema not null default 'sistema',
  prefs_email               jsonb not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint perfiles_prefs_email_check check (jsonb_typeof(prefs_email) = 'object')
);

-- ¿El usuario de la petición es admin? security definer para poder leer
-- perfiles sin pasar por su RLS (y sin recursión en sus políticas).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles
    where id = (select auth.uid())
      and rol = 'admin'
  )
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Crea el perfil al registrarse. Los metadatos los controla el usuario, así
-- que se leen de forma tolerante (nunca rompen el registro) y el rol es
-- siempre 'user'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfiles (id, nombre, mayor_de_edad_confirmado, idioma)
  values (
    new.id,
    nullif(btrim(meta ->> 'nombre'), ''),
    coalesce(meta ->> 'mayor_de_edad_confirmado', '') = 'true',
    case when meta ->> 'idioma' = 'en' then 'en'::public.idioma else 'es'::public.idioma end
  );
  return new;
end
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un usuario puede editar su perfil, pero no cambiarse el rol ni el id.
-- service_role y postgres no pasan por aquí (current_user distinto).
create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id then
      raise exception 'No se puede cambiar el id de un perfil'
        using errcode = '42501';
    end if;
    if new.rol is distinct from old.rol and not public.is_admin() then
      raise exception 'Solo un admin puede cambiar el rol de un perfil'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create trigger proteger_rol
  before update on public.perfiles
  for each row execute function public.proteger_rol_perfil();

-- =====================================================================
-- Triggers updated_at
-- =====================================================================

create trigger set_updated_at before update on public.fuentes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.denominaciones
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.variedades_uva
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.bodegas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.servicios_bodega
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.vinos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.anadas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.imagenes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.registros_fuente
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.comprobaciones_enlace
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.perfiles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Índices (los slugs y PKs compuestas ya tienen el suyo por la restricción)
-- =====================================================================

-- FKs
create index bodegas_fuente_id_idx on public.bodegas (fuente_id);
create index bodega_denominaciones_denominacion_id_idx
  on public.bodega_denominaciones (denominacion_id);
create index servicios_bodega_bodega_id_idx on public.servicios_bodega (bodega_id);
create index vinos_bodega_id_idx on public.vinos (bodega_id);
create index vinos_denominacion_id_idx on public.vinos (denominacion_id);
create index vinos_fuente_id_idx on public.vinos (fuente_id);
-- anadas.vino_id: cubierto por anadas_vino_id_anio_key.
create index anada_variedades_variedad_id_idx on public.anada_variedades (variedad_id);
create index imagenes_bodega_id_idx on public.imagenes (bodega_id) where bodega_id is not null;
create index imagenes_vino_id_idx on public.imagenes (vino_id) where vino_id is not null;
create index imagenes_anada_id_idx on public.imagenes (anada_id) where anada_id is not null;
create index imagenes_servicio_id_idx on public.imagenes (servicio_id)
  where servicio_id is not null;
create index imagenes_fuente_id_idx on public.imagenes (fuente_id);
create index ejecuciones_scraper_fuente_id_inicio_idx
  on public.ejecuciones_scraper (fuente_id, inicio desc);
-- registros_fuente.fuente_id: cubierto por registros_fuente_fuente_id_id_externo_key.

-- Una sola D.O. principal por bodega y una sola imagen principal por entidad.
create unique index bodega_denominaciones_principal_key
  on public.bodega_denominaciones (bodega_id) where principal;
create unique index imagenes_bodega_principal_key on public.imagenes (bodega_id)
  where principal and bodega_id is not null;
create unique index imagenes_vino_principal_key on public.imagenes (vino_id)
  where principal and vino_id is not null;
create unique index imagenes_anada_principal_key on public.imagenes (anada_id)
  where principal and anada_id is not null;
create unique index imagenes_servicio_principal_key on public.imagenes (servicio_id)
  where principal and servicio_id is not null;

-- Búsqueda tolerante a tildes y erratas (pg_trgm ya ignora mayúsculas).
create index bodegas_nombre_trgm_idx
  on public.bodegas using gin (public.f_unaccent(nombre) extensions.gin_trgm_ops);
create index vinos_nombre_trgm_idx
  on public.vinos using gin (public.f_unaccent(nombre) extensions.gin_trgm_ops);

-- "Cerca de mí" (§5.3).
create index bodegas_ubicacion_idx on public.bodegas using gist (ubicacion);

-- Filtros y paneles de admin.
create index vinos_tipo_idx on public.vinos (tipo);
create index registros_fuente_entidad_idx
  on public.registros_fuente (entidad_tipo, entidad_id);
create index registros_fuente_pendientes_idx
  on public.registros_fuente (estado_emparejamiento)
  where estado_emparejamiento in ('pendiente', 'revision');
create index comprobaciones_enlace_ultima_comprobacion_idx
  on public.comprobaciones_enlace (ultima_comprobacion);
create index comprobaciones_enlace_ocultos_idx
  on public.comprobaciones_enlace (entidad_tipo, entidad_id) where oculto;

-- =====================================================================
-- Permisos y RLS (§10: RLS en todas las tablas)
-- =====================================================================
-- Los permisos se fijan explícitamente en vez de fiarse de los default
-- privileges de Supabase (que incluyen TRUNCATE, que se salta la RLS).
-- service_role se salta la RLS: la usan scrapers y comprobador de enlaces.
-- Una política por comando (sin `for all`) para no duplicar políticas SELECT,
-- y `(select …)` para evaluar auth.uid() / is_admin() una vez por consulta.

alter table public.fuentes                enable row level security;
alter table public.denominaciones         enable row level security;
alter table public.variedades_uva         enable row level security;
alter table public.bodegas                enable row level security;
alter table public.bodega_denominaciones  enable row level security;
alter table public.servicios_bodega       enable row level security;
alter table public.vinos                  enable row level security;
alter table public.anadas                 enable row level security;
alter table public.anada_variedades       enable row level security;
alter table public.imagenes               enable row level security;
alter table public.ejecuciones_scraper    enable row level security;
alter table public.registros_fuente       enable row level security;
alter table public.comprobaciones_enlace  enable row level security;
alter table public.perfiles               enable row level security;

revoke all on
  public.fuentes, public.denominaciones, public.variedades_uva, public.bodegas,
  public.bodega_denominaciones, public.servicios_bodega, public.vinos, public.anadas,
  public.anada_variedades, public.imagenes, public.ejecuciones_scraper,
  public.registros_fuente, public.comprobaciones_enlace, public.perfiles
from anon, authenticated;

grant select, insert, update, delete on
  public.fuentes, public.denominaciones, public.variedades_uva, public.bodegas,
  public.bodega_denominaciones, public.servicios_bodega, public.vinos, public.anadas,
  public.anada_variedades, public.imagenes, public.ejecuciones_scraper,
  public.registros_fuente, public.comprobaciones_enlace, public.perfiles
to service_role;

-- --- Catálogo público: lectura para todos, escritura solo admin ------------

grant select on
  public.fuentes, public.denominaciones, public.variedades_uva, public.bodegas,
  public.bodega_denominaciones, public.servicios_bodega, public.vinos, public.anadas,
  public.anada_variedades, public.imagenes
to anon, authenticated;

grant insert, update, delete on
  public.fuentes, public.denominaciones, public.variedades_uva, public.bodegas,
  public.bodega_denominaciones, public.servicios_bodega, public.vinos, public.anadas,
  public.anada_variedades, public.imagenes
to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'fuentes', 'denominaciones', 'variedades_uva', 'bodegas', 'bodega_denominaciones',
    'servicios_bodega', 'vinos', 'anadas', 'anada_variedades', 'imagenes'
  ] loop
    execute format(
      'create policy "lectura publica" on public.%I for select to anon, authenticated using (true)',
      t);
    execute format(
      'create policy "admin inserta" on public.%I for insert to authenticated with check ((select public.is_admin()))',
      t);
    execute format(
      'create policy "admin actualiza" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t);
    execute format(
      'create policy "admin borra" on public.%I for delete to authenticated using ((select public.is_admin()))',
      t);
  end loop;
end
$$;

-- --- Operación de scrapers y enlaces: solo admin -------------------------

grant select, insert, update, delete on
  public.ejecuciones_scraper, public.registros_fuente, public.comprobaciones_enlace
to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ejecuciones_scraper', 'registros_fuente', 'comprobaciones_enlace'
  ] loop
    execute format(
      'create policy "admin lee" on public.%I for select to authenticated using ((select public.is_admin()))',
      t);
    execute format(
      'create policy "admin inserta" on public.%I for insert to authenticated with check ((select public.is_admin()))',
      t);
    execute format(
      'create policy "admin actualiza" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t);
    execute format(
      'create policy "admin borra" on public.%I for delete to authenticated using ((select public.is_admin()))',
      t);
  end loop;
end
$$;

-- --- Perfiles: cada usuario el suyo; admin todos ---------------------------
-- Sin INSERT ni DELETE: los hacen el trigger al registrarse y el cascade de
-- auth.users. El cambio de rol lo bloquea public.proteger_rol_perfil().

grant select, update on public.perfiles to authenticated;

create policy "propio o admin lee" on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "propio o admin actualiza" on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
