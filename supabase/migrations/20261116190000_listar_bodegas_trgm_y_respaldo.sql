-- Reconcilia listar_bodegas en producción: 20261116163420 (índices trigram) se aplicó antes que
-- 20261112170100 (imagen_tipo y botella de respaldo), y esta última volvió a crear la función sin
-- usar el índice. Esta versión une las dos: filtro por `<%` (trigram) + imagen_tipo + respaldo.
-- En una base nueva 20261116163420 ya deja esta misma definición; volver a crearla es inocuo.

drop function if exists public.listar_bodegas(text, text, integer, integer);

create function public.listar_bodegas(
  q text default null,
  denominacion text default null,
  limite integer default 24,
  desplazamiento integer default 0
)
returns table (
  id uuid, slug text, nombre text, municipio text, provincia text,
  denominacion_nombre text, num_vinos bigint, imagen_url text, imagen_alt text,
  imagen_tipo text, relevancia real, total bigint
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
    coalesce(img.url, bot.url), coalesce(img.alt, bot.alt),
    case when img.url is not null then img.tipo::text when bot.url is not null then 'botella' end,
    p.rel, p.total
  from pagina p
  left join lateral (
    select i.url, i.alt, i.tipo
    from public.imagenes i
    where i.bodega_id = p.id and i.estado_enlace <> 'oculto'
    order by i.principal desc, (i.tipo = 'bodega') desc, i.orden
    limit 1
  ) img on true
  -- Respaldo: botella de un vino de la bodega (del vino o de su añada más reciente).
  left join lateral (
    select x.url, x.alt
    from (
      select i.url, i.alt, a.anio, i.principal, i.orden
      from public.vinos v
      join public.anadas a on a.vino_id = v.id
      join public.imagenes i on i.anada_id = a.id
      where v.bodega_id = p.id and i.tipo = 'botella' and i.estado_enlace <> 'oculto'
      union all
      select i.url, i.alt, null::smallint, i.principal, i.orden
      from public.vinos v
      join public.imagenes i on i.vino_id = v.id
      where v.bodega_id = p.id and i.tipo = 'botella' and i.estado_enlace <> 'oculto'
    ) x
    where img.url is null
    order by x.anio desc nulls last, x.principal desc, x.orden
    limit 1
  ) bot on true
  order by p.rel desc nulls last, public.f_unaccent(p.nombre), p.id;
end;
$$;

revoke execute on function public.listar_bodegas(text, text, integer, integer) from public;
grant execute on function public.listar_bodegas(text, text, integer, integer) to anon, authenticated, service_role;
