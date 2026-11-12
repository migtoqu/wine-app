-- Fuente: OpenStreetMap (Nominatim + Overpass), ODbL. Geocodifica las bodegas sin coordenadas
-- y aporta horario, web y teléfono de los POI craft=winery / shop=wine emparejados.
-- Origen 'otra': cualquier consejo, web de bodega o el admin le gana en todos los campos.
--
-- Precisión de la ubicación: no hay columna nueva. La precisión de un punto de OSM vive en el
-- registro de la fuente (registros_fuente.datos->>'precision': exacta | portal | calle | municipio)
-- y se lee siguiendo procedencia_campos(ubicacion). Así nunca queda desfasada: si otra fuente
-- (o el admin) pasa a dar la ubicación, la procedencia deja de apuntar a OSM y el punto es «oficial».
insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, activa, notas_robots) values
  (
    'OpenStreetMap',
    'openstreetmap',
    'otra',
    'https://www.openstreetmap.org',
    'mensual',
    true,
    'APIs públicas con política de uso propia (no se rastrea HTML): Nominatim '
    '(operations.osmfoundation.org/policies/nominatim: ≤ 1 petición/s, User-Agent identificable, '
    'caché de resultados, nada de cargas masivas) y Overpass (overpass-api.de, una consulta por '
    'ejecución). Su robots.txt excluye /search y /api/ para rastreadores web, no para clientes de la '
    'API. Datos ODbL 1.0: atribución «© OpenStreetMap contributors» allí donde se muestren.'
  )
on conflict (slug) do nothing;

-- Google Places API (New): solo se guarda place_id (permitido indefinidamente por sus términos).
-- El scraper no hace nada sin GOOGLE_PLACES_API_KEY (ver docs/SOURCES.md).
insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, activa, notas_robots) values
  (
    'Google Places',
    'google-places',
    'otra',
    'https://places.googleapis.com',
    'manual',
    true,
    'API de pago con clave (GOOGLE_PLACES_API_KEY). Términos: place_id se puede guardar sin límite; '
    'lat/lng como mucho 30 días; el resto (valoración, horario, teléfono, web, fotos) no se guarda: se '
    'pide al mostrarlo con atribución «Google Maps». Nunca se rastrea Google Maps.'
  )
on conflict (slug) do nothing;

-- Ubicación de una bodega con su precisión y su origen.
--   origen: 'oficial' (consejo, web, admin…) | 'osm'
--   precision: 'exacta' para los puntos oficiales; para OSM, la que guardó el scraper.
create or replace function public.ubicacion_bodega_detalle(p_bodega uuid)
returns table (origen text, precision text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when f.slug = 'openstreetmap' then 'osm' else 'oficial' end,
    case when f.slug = 'openstreetmap' then coalesce(r.datos ->> 'precision', 'municipio') else 'exacta' end
  from public.bodegas b
  left join public.procedencia_campos p
    on p.entidad_tipo = 'bodega' and p.entidad_id = b.id and p.campo = 'ubicacion'
  left join public.fuentes f on f.id = p.fuente_id
  left join public.registros_fuente r on r.id = p.registro_id
  where b.id = p_bodega and b.ubicacion is not null;
$$;

revoke execute on function public.ubicacion_bodega_detalle(uuid) from public;
grant execute on function public.ubicacion_bodega_detalle(uuid) to anon, authenticated;

-- Todas las bodegas con ubicación, para el mapa (≈ 900 puntos: una sola respuesta).
create or replace function public.mapa_bodegas()
returns table (
  id uuid, slug text, nombre text, municipio text, provincia text,
  lat double precision, lng double precision, precision text, origen text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, b.slug, b.nombre, b.municipio, b.provincia,
    extensions.st_y(b.ubicacion::extensions.geometry),
    extensions.st_x(b.ubicacion::extensions.geometry),
    case when f.slug = 'openstreetmap' then coalesce(r.datos ->> 'precision', 'municipio') else 'exacta' end,
    case when f.slug = 'openstreetmap' then 'osm' else 'oficial' end
  from public.bodegas b
  left join public.procedencia_campos p
    on p.entidad_tipo = 'bodega' and p.entidad_id = b.id and p.campo = 'ubicacion'
  left join public.fuentes f on f.id = p.fuente_id
  left join public.registros_fuente r on r.id = p.registro_id
  where b.ubicacion is not null and b.estado = 'activa';
$$;

revoke execute on function public.mapa_bodegas() from public;
grant execute on function public.mapa_bodegas() to anon, authenticated;

-- Bodegas más cercanas a un punto («cerca de mí»). Usa el índice GiST de bodegas.ubicacion.
create or replace function public.bodegas_cerca(
  p_lat double precision,
  p_lng double precision,
  p_radio_km double precision default 50,
  p_limite integer default 20
)
returns table (
  id uuid, slug text, nombre text, municipio text, provincia text,
  lat double precision, lng double precision, precision text, origen text, distancia_km double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with punto as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    b.id, b.slug, b.nombre, b.municipio, b.provincia,
    extensions.st_y(b.ubicacion::extensions.geometry),
    extensions.st_x(b.ubicacion::extensions.geometry),
    case when f.slug = 'openstreetmap' then coalesce(r.datos ->> 'precision', 'municipio') else 'exacta' end,
    case when f.slug = 'openstreetmap' then 'osm' else 'oficial' end,
    extensions.st_distance(b.ubicacion, punto.g) / 1000
  from public.bodegas b
  cross join punto
  left join public.procedencia_campos p
    on p.entidad_tipo = 'bodega' and p.entidad_id = b.id and p.campo = 'ubicacion'
  left join public.fuentes f on f.id = p.fuente_id
  left join public.registros_fuente r on r.id = p.registro_id
  where b.ubicacion is not null
    and b.estado = 'activa'
    and p_lat between -90 and 90 and p_lng between -180 and 180
    and extensions.st_dwithin(b.ubicacion, punto.g, least(greatest(p_radio_km, 1), 300) * 1000)
  order by b.ubicacion operator(extensions.<->) punto.g
  limit least(greatest(p_limite, 1), 100);
$$;

revoke execute on function public.bodegas_cerca(double precision, double precision, double precision, integer) from public;
grant execute on function public.bodegas_cerca(double precision, double precision, double precision, integer)
  to anon, authenticated;
