-- Mi cava: buscador general para añadir botellas.
--
-- El usuario escribe lo que pone la etiqueta («Dehesa de los Canónigos 15
-- meses cosecha roble») y la app propone los vinos del catálogo que mejor
-- encajan. La frase entera no suele coincidir con ningún nombre, así que se
-- puntúa palabra por palabra contra «bodega + vino + crianza + tipo + D.O.».
--
-- La app ya separa la añada, los meses de crianza, el formato y la cantidad
-- (src/lib/personal/cava-busqueda.ts) y manda el resto como `palabras`
-- normalizadas (minúsculas, sin tildes ni palabras vacías).
--
-- Puntuación (0..~1,5):
--   cobertura   parte de las palabras (ponderadas por longitud) que aparecen
--               en el documento del vino; con una errata leve (similitud de
--               palabra ≥ 0,7) cuenta 0,8.
--   nombre      parte de las palabras del nombre del vino que el usuario ha
--               escrito: distingue «Crianza» de «Solideo Reserva» de la misma
--               bodega. Peso 0,3.
--   añada       +0,15 si alguna añada es la del año escrito; +0,1 si alguna
--               tiene los meses de crianza escritos.
--
-- Los candidatos salen de los índices trigram de nombres de vino y bodega
-- (cualquier palabra con ≥ 3 letras), y solo esos se puntúan.

create or replace function public.buscar_vinos_cava(
  palabras text[],
  anio smallint default null,
  meses smallint default null,
  limite integer default 6
)
returns table (
  id uuid, slug text, nombre text, tipo public.tipo_vino, crianza public.crianza_vino,
  bodega_id uuid, bodega_nombre text, denominacion_nombre text,
  imagen_url text, precio_desde numeric, anadas jsonb, relevancia real
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  _p text[];
  _lim integer := least(greatest(coalesce(buscar_vinos_cava.limite, 6), 1), 20);
begin
  -- Palabras útiles: normalizadas, sin repetir y con 2+ caracteres.
  select coalesce(array_agg(distinct w), '{}') into _p
  from (
    select public.normalizar_busqueda(x) as w
    from unnest(coalesce(buscar_vinos_cava.palabras, '{}')) x
  ) s
  where length(w) >= 2 and length(w) <= 40;
  _p := _p[1:12];
  if cardinality(_p) = 0 then
    return;
  end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.6', true);

  return query
  with largas as (
    select t from unnest(_p) t where length(t) >= 3
  ),
  candidatos as (
    select v.id
    from public.vinos v, largas l
    where l.t operator(extensions.<%) public.f_unaccent(v.nombre)
       or public.f_unaccent(v.nombre) ilike '%' || l.t || '%'
    union
    select v.id
    from public.bodegas b
    join public.vinos v on v.bodega_id = b.id, largas l
    where l.t operator(extensions.<%) public.f_unaccent(b.nombre)
       or public.f_unaccent(b.nombre) ilike '%' || l.t || '%'
  ),
  docs as (
    select v.id, v.slug, v.nombre, v.tipo, v.crianza, v.bodega_id, b.nombre as bodega_nombre,
           d.nombre as denominacion_nombre,
           lower(public.f_unaccent(concat_ws(' ', b.nombre, v.nombre,
             replace(v.crianza::text, '_', ' '), v.tipo::text, d.nombre))) as doc,
           lower(public.f_unaccent(v.nombre)) as nom
    from candidatos c
    join public.vinos v on v.id = c.id
    join public.bodegas b on b.id = v.bodega_id
    left join public.denominaciones d on d.id = v.denominacion_id
  ),
  puntos as (
    select dc.*,
      (select sum(case
                    when strpos(dc.doc, t) > 0 then 1.0
                    when length(t) >= 4 and extensions.word_similarity(t, dc.doc) >= 0.7 then 0.8
                    else 0
                  end * length(t)) / sum(length(t))
         from unnest(_p) t) as cobertura,
      (select coalesce(avg(case when w = any(_p) then 1.0 else 0 end), 0)
         from regexp_split_to_table(dc.nom, '[^a-z0-9]+') w
        where length(w) >= 3 and w not in ('los', 'las', 'del', 'con', 'the')) as cob_nombre,
      exists (select 1 from public.anadas a
               where a.vino_id = dc.id and a.anio = buscar_vinos_cava.anio) as con_anio,
      exists (select 1 from public.anadas a
               where a.vino_id = dc.id and a.meses_crianza = buscar_vinos_cava.meses) as con_meses
    from docs dc
  ),
  mejores as (
    select p.*,
      (p.cobertura + 0.3 * p.cob_nombre
        + case when p.con_anio then 0.15 else 0 end
        + case when p.con_meses then 0.1 else 0 end)::real as rel
    from puntos p
    where p.cobertura >= 0.3
    order by rel desc, length(p.nombre), p.nombre, p.id
    limit _lim
  )
  select m.id, m.slug, m.nombre, m.tipo, m.crianza, m.bodega_id, m.bodega_nombre,
    m.denominacion_nombre, img.url, public.precio_desde_vino(m.id),
    (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'anio', a.anio, 'meses', a.meses_crianza)
                               order by a.anio desc nulls last), '[]')
       from public.anadas a where a.vino_id = m.id),
    m.rel
  from mejores m
  -- Imagen como en listar_vinos: la del vino o la de su añada más reciente.
  left join lateral (
    select i.url
    from (
      select i.url, 0 as grupo, null::smallint as anio, i.tipo, i.principal, i.orden
      from public.imagenes i
      where i.vino_id = m.id and i.estado_enlace <> 'oculto'
      union all
      select i.url, 1, a.anio, i.tipo, i.principal, i.orden
      from public.anadas a
      join public.imagenes i on i.anada_id = a.id
      where a.vino_id = m.id and i.estado_enlace <> 'oculto'
    ) i
    order by i.grupo, (i.tipo = 'botella') desc, i.anio desc nulls last, i.principal desc, i.orden
    limit 1
  ) img on true
  order by m.rel desc, length(m.nombre), m.nombre, m.id;
end;
$$;

-- Como el resto del catálogo: solo usuarios con sesión.
revoke execute on function public.buscar_vinos_cava(text[], smallint, smallint, integer) from public, anon;
grant execute on function public.buscar_vinos_cava(text[], smallint, smallint, integer) to authenticated;
