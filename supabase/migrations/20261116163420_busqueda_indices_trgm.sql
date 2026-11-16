-- Búsqueda por nombre: que buscar_catalogo, listar_vinos y listar_bodegas usen
-- los índices trigram (vinos_nombre_trgm_idx, bodegas_nombre_trgm_idx), que
-- hasta ahora nunca se usaban.
--
-- Por qué eran lentas (medido en prod, 4.000 vinos / 864 bodegas):
--   * `word_similarity(q, nombre) >= 0.4` no es indexable: recorría las tablas
--     enteras. El operador equivalente `q <% nombre` sí lo es, pero compara con
--     el umbral pg_trgm.word_similarity_threshold (0.6 por defecto).
--   * Las funciones SQL con `SET search_path` no se expanden en línea, así que
--     normalizar_busqueda(q) y patron_contiene(q) se recalculaban por fila.
--   * listar_vinos recorría vinos y bodegas buscando coincidencias aunque no
--     hubiera texto de búsqueda.
--
-- Cambio: las tres pasan a plpgsql. Calculan q normalizado y el patrón una vez,
-- fijan el umbral a 0.4 solo para la transacción (set_config local: cada
-- llamada RPC de PostgREST es una transacción) y usan `<%`, que con ese umbral
-- da exactamente lo mismo que `word_similarity(...) >= 0.4`. Mismas firmas,
-- mismos resultados (comparados fila a fila en prod con varias búsquedas,
-- filtros, órdenes y páginas antes de aplicar) y mismos permisos.
--
-- Tiempos en prod (ms, antes → después):
--   buscar_catalogo('rioja')           425 → 24
--   listar_vinos() sin filtros          174 → 32
--   listar_vinos(q => 'rioja')          564 → 18
--   listar_vinos(bodega => …)            46 → 3
--   listar_bodegas(q => 'vega')         144 → 21

create or replace function public.buscar_catalogo(q text, limite integer default 5)
returns table (
  entidad text, id uuid, slug text, nombre text, subtitulo text,
  tipo_vino public.tipo_vino, relevancia real
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  _qn text := public.normalizar_busqueda(buscar_catalogo.q);
  _patron text := public.patron_contiene(buscar_catalogo.q);
  _lim integer := least(greatest(coalesce(buscar_catalogo.limite, 5), 1), 20);
begin
  if coalesce(length(_qn), 0) < 2 then
    return;
  end if;
  -- Umbral del operador indexable <% (solo en esta transacción).
  perform set_config('pg_trgm.word_similarity_threshold', '0.4', true);

  return query
  with bodegas_coinciden as (
    select b.id, public.relevancia_nombre(_qn, b.nombre) as rel
    from public.bodegas b
    where _qn operator(extensions.<%) public.f_unaccent(b.nombre)
       or public.f_unaccent(b.nombre) ilike _patron
  ),
  vinos_coinciden as (
    select x.id, max(x.rel) as rel
    from (
      select v.id, public.relevancia_nombre(_qn, v.nombre) as rel
      from public.vinos v
      where _qn operator(extensions.<%) public.f_unaccent(v.nombre)
         or public.f_unaccent(v.nombre) ilike _patron
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
  from resultados r
  where r.n <= _lim
  order by r.entidad desc, r.n;  -- primero vinos, luego bodegas
end;
$$;

create or replace function public.listar_vinos(
  q text default null,
  tipos public.tipo_vino[] default null,
  crianzas public.crianza_vino[] default null,
  denominaciones text[] default null,
  variedades text[] default null,
  anio smallint default null,
  sin_anada boolean default false,
  bodega text default null,
  orden text default 'relevancia',
  limite integer default 24,
  desplazamiento integer default 0,
  precio_min numeric default null,
  precio_max numeric default null
)
returns table (
  id uuid, slug text, nombre text, tipo public.tipo_vino, crianza public.crianza_vino,
  bodega_slug text, bodega_nombre text, denominacion_slug text, denominacion_nombre text,
  anios smallint[], imagen_url text, imagen_alt text, relevancia real, total bigint,
  precio_desde numeric
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  _qn text := public.normalizar_busqueda(listar_vinos.q);
  _patron text := public.patron_contiene(listar_vinos.q);
  _con_q boolean := coalesce(length(public.normalizar_busqueda(listar_vinos.q)), 0) >= 2;
begin
  perform set_config('pg_trgm.word_similarity_threshold', '0.4', true);

  return query
  with coincidencias as (
    -- Sin texto de búsqueda (_con_q falso) el planificador ni recorre las tablas.
    select x.id, max(x.rel) as rel
    from (
      select v.id, public.relevancia_nombre(_qn, v.nombre) as rel
      from public.vinos v
      where _con_q
        and (_qn operator(extensions.<%) public.f_unaccent(v.nombre)
             or public.f_unaccent(v.nombre) ilike _patron)
      union all
      select v.id, (public.relevancia_nombre(_qn, b.nombre) * 0.8)::real
      from public.bodegas b
      join public.vinos v on v.bodega_id = b.id
      where _con_q
        and (_qn operator(extensions.<%) public.f_unaccent(b.nombre)
             or public.f_unaccent(b.nombre) ilike _patron)
    ) x
    group by x.id
  ),
  filtrados as (
    select v.id, v.slug, v.nombre, v.tipo, v.crianza, v.bodega_id, v.denominacion_id,
           v.created_at, c.rel,
           case when listar_vinos.orden = 'precio'
                  or listar_vinos.precio_min is not null or listar_vinos.precio_max is not null
                then public.precio_desde_vino(v.id) end as precio
    from public.vinos v
    left join coincidencias c on c.id = v.id
    where (not _con_q or c.id is not null)
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
  -- Filtro de precio: solo vinos con oferta y precio «desde» en el rango.
  con_precio as (
    select f.* from filtrados f
    where (listar_vinos.precio_min is null or f.precio >= listar_vinos.precio_min)
      and (listar_vinos.precio_max is null or f.precio <= listar_vinos.precio_max)
      and (listar_vinos.precio_min is null and listar_vinos.precio_max is null or f.precio is not null)
  ),
  pagina as (
    select f.*, count(*) over () as total
    from con_precio f
    order by
      case when listar_vinos.orden = 'precio' then f.precio end asc nulls last,
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
    img.url, img.alt, p.rel, p.total,
    coalesce(p.precio, public.precio_desde_vino(p.id))
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
    case when listar_vinos.orden = 'precio' then p.precio end asc nulls last,
    case when listar_vinos.orden = 'novedad' then p.created_at end desc nulls last,
    case when listar_vinos.orden = 'relevancia' then p.rel end desc nulls last,
    public.f_unaccent(p.nombre), p.id;
end;
$$;

create or replace function public.listar_bodegas(
  q text default null,
  denominacion text default null,
  limite integer default 24,
  desplazamiento integer default 0
)
returns table (
  id uuid, slug text, nombre text, municipio text, provincia text,
  denominacion_nombre text, num_vinos bigint, imagen_url text, imagen_alt text,
  relevancia real, total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  _qn text := public.normalizar_busqueda(listar_bodegas.q);
  _patron text := public.patron_contiene(listar_bodegas.q);
  _con_q boolean := coalesce(length(public.normalizar_busqueda(listar_bodegas.q)), 0) >= 2;
begin
  perform set_config('pg_trgm.word_similarity_threshold', '0.4', true);

  return query
  with filtradas as (
    select
      b.id, b.slug, b.nombre, b.municipio, b.provincia,
      case when _con_q then public.relevancia_nombre(_qn, b.nombre) end as rel
    from public.bodegas b
    where (
        not _con_q
        or _qn operator(extensions.<%) public.f_unaccent(b.nombre)
        or public.f_unaccent(b.nombre) ilike _patron
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
  order by p.rel desc nulls last, public.f_unaccent(p.nombre), p.id;
end;
$$;
