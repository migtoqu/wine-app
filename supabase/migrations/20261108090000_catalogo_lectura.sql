-- Funciones de lectura del catálogo: buscador global, listados con filtros y
-- opciones de filtro (§5.3). Ver docs/SCOPE.md y el esquema en
-- 20261107170000_catalogo_inicial.sql.
--
-- Todas son security invoker (se aplica la RLS de lectura pública del
-- catálogo), stable y con search_path vacío: todo va cualificado, también los
-- operadores de pg_trgm (operator(extensions.<%)).
--
-- Tolerancia a tildes y erratas: se compara la consulta normalizada contra
-- public.f_unaccent(nombre), la misma expresión que indexan
-- bodegas_nombre_trgm_idx y vinos_nombre_trgm_idx, con:
--   * `q <% nombre` (word_similarity ≥ umbral): erratas y palabras sueltas;
--   * `nombre ilike '%q%'`: subcadenas exactas (también usa el índice GIN).
-- El umbral se fija por función (0,4; el de pg_trgm por defecto es 0,6).
--
-- Los parámetros se referencian cualificados con el nombre de la función
-- (listar_vinos.anio…): en funciones SQL las columnas tienen prioridad sobre
-- los parámetros del mismo nombre.

-- =====================================================================
-- Índices
-- =====================================================================

-- Filtro por crianza y orden "novedad". El filtro por añada usa
-- anadas_vino_id_anio_key (vino_id, anio).
create index vinos_crianza_idx on public.vinos (crianza);
create index vinos_created_at_idx on public.vinos (created_at desc, id);

-- =====================================================================
-- Utilidades de búsqueda
-- =====================================================================

-- Consulta normalizada: sin tildes, en minúsculas y con espacios colapsados
-- (equivalente a normalizeText en src/lib/text.ts).
create or replace function public.normalizar_busqueda(q text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select public.f_unaccent(lower(btrim(regexp_replace(q, '\s+', ' ', 'g'))))
$$;

-- Patrón ILIKE "contiene" con los comodines de la consulta escapados.
create or replace function public.patron_contiene(q text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select '%' || replace(replace(replace(public.normalizar_busqueda(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- Relevancia de un nombre para una consulta ya normalizada: similitud por
-- palabras más un extra si el nombre empieza por la consulta o la contiene.
create or replace function public.relevancia_nombre(qn text, nombre text)
returns real
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select (
    extensions.word_similarity(qn, public.f_unaccent(nombre))
    + case
        when public.f_unaccent(nombre) ilike replace(replace(replace(qn, '\', '\\'), '%', '\%'), '_', '\_') || '%' then 0.3
        when strpos(lower(public.f_unaccent(nombre)), qn) > 0 then 0.15
        else 0
      end
  )::real
$$;

-- =====================================================================
-- Buscador global (autocompletado y bloque de resultados)
-- =====================================================================

-- Vinos y bodegas que coinciden con q, como mucho `limite` de cada grupo,
-- ordenados por relevancia. Los vinos también se encuentran por el nombre de
-- su bodega ("vega sicilia" → sus vinos), con menos peso.
create or replace function public.buscar_catalogo(q text, limite integer default 5)
returns table (
  entidad     text,               -- 'vino' | 'bodega'
  id          uuid,
  slug        text,
  nombre      text,
  subtitulo   text,               -- bodega del vino | municipio, provincia
  tipo_vino   public.tipo_vino,   -- null en bodegas
  relevancia  real
)
language sql
stable
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.4
as $$
  with consulta as (
    select
      public.normalizar_busqueda(buscar_catalogo.q) as qn,
      least(greatest(coalesce(buscar_catalogo.limite, 5), 1), 20) as lim
  ),
  bodegas_coinciden as (
    select b.id, public.relevancia_nombre(c.qn, b.nombre) as rel
    from public.bodegas b, consulta c
    where length(c.qn) >= 2
      and (
        public.normalizar_busqueda(buscar_catalogo.q) operator(extensions.<%) public.f_unaccent(b.nombre)
        or public.f_unaccent(b.nombre) ilike public.patron_contiene(buscar_catalogo.q)
      )
  ),
  vinos_coinciden as (
    select x.id, max(x.rel) as rel
    from (
      select v.id, public.relevancia_nombre(c.qn, v.nombre) as rel
      from public.vinos v, consulta c
      where length(c.qn) >= 2
        and (
          public.normalizar_busqueda(buscar_catalogo.q) operator(extensions.<%) public.f_unaccent(v.nombre)
          or public.f_unaccent(v.nombre) ilike public.patron_contiene(buscar_catalogo.q)
        )
      union all
      select v.id, (bc.rel * 0.8)::real
      from bodegas_coinciden bc
      join public.vinos v on v.bodega_id = bc.id
    ) x
    group by x.id
  ),
  resultados as (
    select
      'vino'::text as entidad, v.id, v.slug, v.nombre, b.nombre as subtitulo,
      v.tipo as tipo_vino, vc.rel as relevancia,
      row_number() over (order by vc.rel desc, length(v.nombre), v.nombre, v.id) as n
    from vinos_coinciden vc
    join public.vinos v on v.id = vc.id
    join public.bodegas b on b.id = v.bodega_id
    union all
    select
      'bodega'::text, b.id, b.slug, b.nombre,
      nullif(concat_ws(', ', b.municipio, b.provincia), ''),
      null::public.tipo_vino, bc.rel,
      row_number() over (order by bc.rel desc, length(b.nombre), b.nombre, b.id)
    from bodegas_coinciden bc
    join public.bodegas b on b.id = bc.id
  )
  select r.entidad, r.id, r.slug, r.nombre, r.subtitulo, r.tipo_vino, r.relevancia
  from resultados r, consulta c
  where r.n <= c.lim
  order by r.entidad desc, r.n  -- primero vinos, luego bodegas
$$;

-- =====================================================================
-- Listado de vinos con filtros, orden y paginación
-- =====================================================================

-- Paginación por offset con el total en cada fila (count(*) over ()): con
-- ~2.000 vinos es barato y permite URLs con ?pagina=N y varias ordenaciones.
-- Orden: 'relevancia' (sin q equivale a 'nombre'), 'nombre', 'novedad'.
-- Precio y puntuación llegarán en Fase 2 como nuevos valores de `orden`.
create or replace function public.listar_vinos(
  q               text default null,
  tipos           public.tipo_vino[] default null,
  crianzas        public.crianza_vino[] default null,
  denominaciones  text[] default null,  -- slugs
  variedades      text[] default null,  -- slugs: alguna añada del vino la contiene
  anio            smallint default null,
  sin_anada       boolean default false,
  bodega          text default null,    -- slug
  orden           text default 'relevancia',
  limite          integer default 24,
  desplazamiento  integer default 0
)
returns table (
  id                   uuid,
  slug                 text,
  nombre               text,
  tipo                 public.tipo_vino,
  crianza              public.crianza_vino,
  bodega_slug          text,
  bodega_nombre        text,
  denominacion_slug    text,
  denominacion_nombre  text,
  anios                smallint[],  -- desc; null = sin añada, al final
  imagen_url           text,
  imagen_alt           text,
  relevancia           real,
  total                bigint
)
language sql
stable
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.4
as $$
  with coincidencias as (
    select x.id, max(x.rel) as rel
    from (
      select v.id, public.relevancia_nombre(public.normalizar_busqueda(listar_vinos.q), v.nombre) as rel
      from public.vinos v
      where public.normalizar_busqueda(listar_vinos.q) operator(extensions.<%) public.f_unaccent(v.nombre)
         or public.f_unaccent(v.nombre) ilike public.patron_contiene(listar_vinos.q)
      union all
      select v.id, (public.relevancia_nombre(public.normalizar_busqueda(listar_vinos.q), b.nombre) * 0.8)::real
      from public.bodegas b
      join public.vinos v on v.bodega_id = b.id
      where public.normalizar_busqueda(listar_vinos.q) operator(extensions.<%) public.f_unaccent(b.nombre)
         or public.f_unaccent(b.nombre) ilike public.patron_contiene(listar_vinos.q)
    ) x
    group by x.id
  ),
  filtrados as (
    select v.id, v.slug, v.nombre, v.tipo, v.crianza, v.bodega_id, v.denominacion_id,
           v.created_at, c.rel
    from public.vinos v
    left join coincidencias c on c.id = v.id
    where (coalesce(length(public.normalizar_busqueda(listar_vinos.q)), 0) < 2 or c.id is not null)
      and (listar_vinos.tipos is null or v.tipo = any (listar_vinos.tipos))
      and (listar_vinos.crianzas is null or v.crianza = any (listar_vinos.crianzas))
      and (
        listar_vinos.denominaciones is null
        or exists (
          select 1 from public.denominaciones d
          where d.id = v.denominacion_id and d.slug = any (listar_vinos.denominaciones)
        )
      )
      and (
        listar_vinos.variedades is null
        or exists (
          select 1
          from public.anadas a
          join public.anada_variedades av on av.anada_id = a.id
          join public.variedades_uva u on u.id = av.variedad_id
          where a.vino_id = v.id and u.slug = any (listar_vinos.variedades)
        )
      )
      and (
        listar_vinos.anio is null
        or exists (select 1 from public.anadas a where a.vino_id = v.id and a.anio = listar_vinos.anio)
      )
      and (
        not coalesce(listar_vinos.sin_anada, false)
        or exists (select 1 from public.anadas a where a.vino_id = v.id and a.anio is null)
      )
      and (
        listar_vinos.bodega is null
        or exists (select 1 from public.bodegas b where b.id = v.bodega_id and b.slug = listar_vinos.bodega)
      )
  ),
  pagina as (
    select f.*, count(*) over () as total
    from filtrados f
    order by
      case when listar_vinos.orden = 'novedad' then f.created_at end desc nulls last,
      case when listar_vinos.orden = 'relevancia' then f.rel end desc nulls last,
      public.f_unaccent(f.nombre), f.id
    limit least(greatest(coalesce(listar_vinos.limite, 24), 1), 48)
    offset least(greatest(coalesce(listar_vinos.desplazamiento, 0), 0), 10000)
  )
  select
    p.id, p.slug, p.nombre, p.tipo, p.crianza,
    b.slug, b.nombre, d.slug, d.nombre,
    (select array_agg(a.anio order by a.anio desc nulls last)
       from public.anadas a where a.vino_id = p.id),
    img.url, img.alt, p.rel, p.total
  from pagina p
  join public.bodegas b on b.id = p.bodega_id
  left join public.denominaciones d on d.id = p.denominacion_id
  -- Imagen: la del vino si la hay; si no, la de la añada más reciente
  -- (los scrapers cuelgan la botella de la añada). Nunca las ocultas.
  left join lateral (
    select i.url, i.alt
    from (
      select i.url, i.alt, 0 as grupo, null::smallint as anio, i.tipo, i.principal, i.orden
      from public.imagenes i
      where i.vino_id = p.id and i.estado_enlace <> 'oculto'
      union all
      select i.url, i.alt, 1, a.anio, i.tipo, i.principal, i.orden
      from public.anadas a
      join public.imagenes i on i.anada_id = a.id
      where a.vino_id = p.id and i.estado_enlace <> 'oculto'
    ) i
    order by i.grupo, (i.tipo = 'botella') desc, i.anio desc nulls last, i.principal desc, i.orden
    limit 1
  ) img on true
  order by
    case when listar_vinos.orden = 'novedad' then p.created_at end desc nulls last,
    case when listar_vinos.orden = 'relevancia' then p.rel end desc nulls last,
    public.f_unaccent(p.nombre), p.id
$$;

-- =====================================================================
-- Listado de bodegas (pestaña "Bodegas" del buscador)
-- =====================================================================

create or replace function public.listar_bodegas(
  q               text default null,
  denominacion    text default null,  -- slug
  limite          integer default 24,
  desplazamiento  integer default 0
)
returns table (
  id                   uuid,
  slug                 text,
  nombre               text,
  municipio            text,
  provincia            text,
  denominacion_nombre  text,  -- D.O. principal (o la primera por nombre)
  num_vinos            bigint,
  imagen_url           text,
  imagen_alt           text,
  relevancia           real,
  total                bigint
)
language sql
stable
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.4
as $$
  with filtradas as (
    select
      b.id, b.slug, b.nombre, b.municipio, b.provincia,
      case
        when coalesce(length(public.normalizar_busqueda(listar_bodegas.q)), 0) >= 2
          then public.relevancia_nombre(public.normalizar_busqueda(listar_bodegas.q), b.nombre)
      end as rel
    from public.bodegas b
    where (
        coalesce(length(public.normalizar_busqueda(listar_bodegas.q)), 0) < 2
        or public.normalizar_busqueda(listar_bodegas.q) operator(extensions.<%) public.f_unaccent(b.nombre)
        or public.f_unaccent(b.nombre) ilike public.patron_contiene(listar_bodegas.q)
      )
      and (
        listar_bodegas.denominacion is null
        or exists (
          select 1
          from public.bodega_denominaciones bd
          join public.denominaciones d on d.id = bd.denominacion_id
          where bd.bodega_id = b.id and d.slug = listar_bodegas.denominacion
        )
      )
  ),
  pagina as (
    select f.*, count(*) over () as total
    from filtradas f
    order by f.rel desc nulls last, public.f_unaccent(f.nombre), f.id
    limit least(greatest(coalesce(listar_bodegas.limite, 24), 1), 48)
    offset least(greatest(coalesce(listar_bodegas.desplazamiento, 0), 0), 10000)
  )
  select
    p.id, p.slug, p.nombre, p.municipio, p.provincia,
    (select d.nombre
       from public.bodega_denominaciones bd
       join public.denominaciones d on d.id = bd.denominacion_id
      where bd.bodega_id = p.id
      order by bd.principal desc, d.nombre
      limit 1),
    (select count(*) from public.vinos v where v.bodega_id = p.id),
    img.url, img.alt, p.rel, p.total
  from pagina p
  left join lateral (
    select i.url, i.alt
    from public.imagenes i
    where i.bodega_id = p.id and i.estado_enlace <> 'oculto'
    order by i.principal desc, (i.tipo = 'bodega') desc, i.orden
    limit 1
  ) img on true
  order by p.rel desc nulls last, public.f_unaccent(p.nombre), p.id
$$;

-- =====================================================================
-- Opciones de los filtros de vinos
-- =====================================================================

-- Solo valores con algún vino. Tipos y crianzas salen de los enums.
-- grupo: 'denominacion' | 'variedad' | 'anio' | 'bodega'; en 'anio', valor
-- 'sin' = sin añada.
create or replace function public.opciones_filtro_vinos()
returns table (grupo text, valor text, etiqueta text, num bigint)
language sql
stable
set search_path = ''
as $$
  select * from (
    select 'denominacion'::text, d.slug, d.nombre, count(*)
    from public.vinos v
    join public.denominaciones d on d.id = v.denominacion_id
    group by d.slug, d.nombre
    order by d.nombre
  ) denominaciones
  union all
  select * from (
    select 'variedad'::text, u.slug, u.nombre, count(distinct a.vino_id)
    from public.anada_variedades av
    join public.anadas a on a.id = av.anada_id
    join public.variedades_uva u on u.id = av.variedad_id
    group by u.slug, u.nombre
    order by count(distinct a.vino_id) desc, u.nombre
  ) variedades
  union all
  select * from (
    select 'anio'::text, coalesce(a.anio::text, 'sin'), coalesce(a.anio::text, ''),
           count(distinct a.vino_id)
    from public.anadas a
    group by a.anio
    order by a.anio desc nulls last
  ) anios
  union all
  select * from (
    select 'bodega'::text, b.slug, b.nombre, count(*)
    from public.vinos v
    join public.bodegas b on b.id = v.bodega_id
    group by b.slug, b.nombre
    order by b.nombre
  ) bodegas
$$;

-- =====================================================================
-- Permisos
-- =====================================================================

revoke execute on function
  public.normalizar_busqueda(text),
  public.patron_contiene(text),
  public.relevancia_nombre(text, text),
  public.buscar_catalogo(text, integer),
  public.listar_vinos(text, public.tipo_vino[], public.crianza_vino[], text[], text[],
                      smallint, boolean, text, text, integer, integer),
  public.listar_bodegas(text, text, integer, integer),
  public.opciones_filtro_vinos()
from public;

grant execute on function
  public.normalizar_busqueda(text),
  public.patron_contiene(text),
  public.relevancia_nombre(text, text),
  public.buscar_catalogo(text, integer),
  public.listar_vinos(text, public.tipo_vino[], public.crianza_vino[], text[], text[],
                      smallint, boolean, text, text, integer, integer),
  public.listar_bodegas(text, text, integer, integer),
  public.opciones_filtro_vinos()
to anon, authenticated, service_role;
