-- Premios y puntuaciones (SCOPE §6.3, ROADMAP Fase 2): certámenes (guías y
-- concursos) y los premios que dan a cada vino. Ver scrapers/lib/premios.ts.
--
-- Idea general:
--   * Un certamen es una guía (puntos) o un concurso (medallas, a veces también
--     puntos). Lo alimenta una fuente (scraper) o lo da de alta el admin.
--   * Un premio cuelga de un vino y lleva la añada premiada (anio, null = sin
--     añada) y la edición del certamen. No apunta a `anadas`: el catálogo no
--     siempre tiene esa añada y la ficha la casa por año.
--   * La clave es (certamen, id_externo): volver a ejecutar el scraper no duplica.
--   * Solo hechos: medalla o puntos, nombre de la distinción tal cual y enlace a
--     la ficha del certamen. Nunca notas de cata ni textos del certamen.
--   * Lectura pública como el resto del catálogo; escriben los scrapers
--     (service_role) y el admin, que puede ocultar (`oculto_admin`, que ningún
--     scraper toca) o borrar.

create type public.tipo_certamen as enum ('guia', 'concurso');
create type public.medalla_premio as enum ('gran_oro', 'oro', 'plata', 'bronce');

create table public.certamenes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null,
  tipo        public.tipo_certamen not null,
  -- Puntuación máxima si el certamen puntúa (100 en casi todas las guías).
  escala_max  smallint,
  web         text,
  pais        text,  -- ISO 3166-1 alfa-2 de la organización
  fuente_id   uuid references public.fuentes (id) on delete set null,
  -- Orden de importancia en la ficha (menor = antes).
  orden       smallint not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint certamenes_slug_key unique (slug),
  constraint certamenes_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint certamenes_web_check check (web ~* '^https?://'),
  constraint certamenes_escala_max_check check (escala_max between 5 and 1000),
  constraint certamenes_pais_check check (pais ~ '^[A-Z]{2}$')
);

create table public.premios (
  id               uuid primary key default gen_random_uuid(),
  certamen_id      uuid not null references public.certamenes (id) on delete cascade,
  vino_id          uuid not null references public.vinos (id) on delete cascade,
  anio             smallint,           -- añada premiada; null = sin añada
  edicion          smallint not null,  -- año de la edición del certamen
  medalla          public.medalla_premio,
  puntos           numeric(5, 1),
  -- Nombre de la distinción tal como lo publica el certamen («Gran Medalla de Oro»).
  distincion       text,
  -- Trofeo o mención aparte de la medalla («Revelación vino rosado España»).
  mencion          text,
  url              text,
  id_externo       text not null,
  fuente_id        uuid references public.fuentes (id) on delete set null,
  registro_id      uuid references public.registros_fuente (id) on delete set null,
  visto_por_ultima_vez timestamptz not null default now(),
  -- Decisión del admin: el premio no se muestra. Ningún scraper lo cambia.
  oculto_admin     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint premios_certamen_id_id_externo_key unique (certamen_id, id_externo),
  constraint premios_algo_check check (medalla is not null or puntos is not null or distincion is not null),
  constraint premios_anio_check check (anio between 1800 and 2100),
  constraint premios_edicion_check check (edicion between 1900 and 2100),
  constraint premios_puntos_check check (puntos > 0 and puntos <= 1000),
  constraint premios_url_check check (url ~* '^https?://')
);

create index premios_vino_id_idx on public.premios (vino_id);
create index premios_registro_id_idx on public.premios (registro_id) where registro_id is not null;

create trigger set_updated_at before update on public.certamenes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.premios
  for each row execute function public.set_updated_at();

-- Fusión de vinos: admin_fusionar deja la supresión 'fusion' antes de borrar el
-- origen, así que los premios se pasan al superviviente aquí en vez de caer en cascada.
create or replace function public.vinos_mover_premios()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  destino uuid;
begin
  select s.fusionada_en into destino
  from public.supresiones s
  where s.entidad_tipo = 'vino' and s.entidad_id = old.id and s.motivo = 'fusion';
  if destino is not null then
    update public.premios set vino_id = destino where vino_id = old.id;
  end if;
  return old;
end
$$;

revoke execute on function public.vinos_mover_premios() from public, anon, authenticated;

create trigger mover_premios before delete on public.vinos
  for each row execute function public.vinos_mover_premios();

-- =====================================================================
-- Semillas: Concours Mondial de Bruxelles
-- =====================================================================
-- Auditoría (2026-11-27) en docs/SOURCES.md §9.1.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Concours Mondial de Bruxelles (resultados)',
    'concours-mondial-bruxelles',
    'guia',
    'https://results.concoursmondial.com',
    'mensual',
    'robots.txt (2026-11-27): results.concoursmondial.com con Disallow vacío; concoursmondial.com pide '
    'Crawl-delay 10, que se respeta también aquí. Se lee solo el listado /es/resultados/<año>?search[country]=Spain '
    '(24 vinos por página, ~37 páginas por edición): nombre y añada, productor, D.O., medalla y trofeo. No se leen '
    'las fichas (notas de cata) ni se copian imágenes. Sin aviso legal publicado; solo hechos con enlace.'
  )
on conflict (slug) do nothing;

insert into public.certamenes (nombre, slug, tipo, escala_max, web, pais, fuente_id, orden)
select 'Concours Mondial de Bruxelles', 'concours-mondial-bruxelles', 'concurso', null,
       'https://concoursmondial.com', 'BE', f.id, 20
from public.fuentes f where f.slug = 'concours-mondial-bruxelles'
on conflict (slug) do nothing;

-- =====================================================================
-- Permisos y RLS
-- =====================================================================

alter table public.certamenes enable row level security;
alter table public.premios    enable row level security;

revoke all on public.certamenes, public.premios from anon, authenticated;
grant select, insert, update, delete on public.certamenes, public.premios to service_role;
grant select on public.certamenes, public.premios to anon, authenticated;
grant insert, update, delete on public.certamenes, public.premios to authenticated;

create policy "lectura publica" on public.certamenes for select to anon, authenticated using (true);
-- Los ocultos por el admin solo los ve el admin.
create policy "lectura publica" on public.premios for select to anon, authenticated
  using (not oculto_admin);
create policy "admin lee" on public.premios for select to authenticated
  using ((select public.is_admin()));

do $$
declare
  t text;
begin
  foreach t in array array['certamenes', 'premios'] loop
    execute format(
      'create policy "admin inserta" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format(
      'create policy "admin actualiza" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format(
      'create policy "admin borra" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end
$$;
