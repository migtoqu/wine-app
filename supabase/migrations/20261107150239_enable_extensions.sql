-- Extensiones base (ver docs/SCOPE.md §3 y §5.3).
-- Se instalan en el esquema `extensions`, como recomienda Supabase.

-- Búsqueda tolerante a erratas (índices de trigramas).
create extension if not exists pg_trgm with schema extensions;

-- Búsqueda tolerante a tildes.
create extension if not exists unaccent with schema extensions;

-- Geolocalización de bodegas ("cerca de mí").
create extension if not exists postgis with schema extensions;

-- unaccent() no es IMMUTABLE y no puede usarse en índices.
-- Este envoltorio fija el diccionario y sí puede indexarse:
--   create index ... using gin (public.f_unaccent(nombre) extensions.gin_trgm_ops);
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;
