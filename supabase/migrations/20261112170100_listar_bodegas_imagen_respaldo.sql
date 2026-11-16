-- Listado de bodegas: si la bodega no tiene foto propia (bodega o viñedo), la tarjeta usa la
-- botella de uno de sus vinos (la añada más reciente con imagen). Nueva columna `imagen_tipo`
-- ('bodega' | 'vinedo' | 'botella') para que la tarjeta la muestre entera (contain) y no recortada.
-- Cambia el tipo de retorno: hay que borrar y volver a crear la función (y sus permisos).
--
-- Limpieza de URLs de imagen de bodega que nunca cargan (vistas el 2026-11-12):
-- plantillas de Shopify sin rellenar ({width}), marcadores de Revolution Slider y la miniatura
-- difuminada de Wix. El crawler ya no las genera.

update public.imagenes
   set url = replace(replace(url, '%7Bwidth%7D', '1600'), '{width}', '1600')
 where bodega_id is not null and (url like '%\%7Bwidth\%7D%' or url like '%{width}%');

delete from public.imagenes
 where bodega_id is not null and url ~* '/revslider/.*/dummy\.png$';

update public.imagenes
   set url = regexp_replace(url, '^(https://static\.wixstatic\.com/media/[^/]+)/v1/.*$', '\1')
 where bodega_id is not null and url ~ '^https://static\.wixstatic\.com/media/[^/]+/v1/fill/w_[0-9]{1,3},.*blur_';

drop function if exists public.listar_bodegas(text, text, integer, integer);

create function public.listar_bodegas(
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
  imagen_tipo          text,  -- 'bodega' | 'vinedo' | 'botella' (respaldo)
  relevancia           real,
  total                bigint
)
language sql
stable
set search_path = ''
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
        or extensions.word_similarity(public.normalizar_busqueda(listar_bodegas.q), public.f_unaccent(b.nombre)) >= 0.4
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
  order by p.rel desc nulls last, public.f_unaccent(p.nombre), p.id
$$;

revoke execute on function public.listar_bodegas(text, text, integer, integer) from public;
grant execute on function public.listar_bodegas(text, text, integer, integer) to anon, authenticated, service_role;
