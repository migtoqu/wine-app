-- Comparador de precios (SCOPE §6.2, ROADMAP Fase 2): tiendas, ofertas e
-- historial de precios. Ver scrapers/lib/ofertas.ts y scrapers/README.md.
--
-- Idea general:
--   * Una tienda es un comercio con precios; puede ser la tienda online de una
--     bodega (bodega_id) y estar alimentada por una fuente (fuente_id).
--   * Una oferta es un producto de una tienda (clave tienda + id_externo), y
--     cuelga de una añada o, si la tienda no indica la añada, solo del vino.
--     vino_id va siempre relleno (se deriva de la añada) para consultar por vino.
--   * historial_precios guarda tramos [desde, hasta) y solo crece cuando cambia
--     el precio: lo mantiene un trigger, valga quien valga el escritor.
--   * Los scrapers escriben con service_role; el admin puede corregir, ocultar
--     (oculta_admin, que ningún scraper toca) o borrar.
--   * Lectura pública como el resto del catálogo (la app ya exige sesión en el
--     proxy): la ficha lee las ofertas dentro de 'use cache' con el cliente anon.

-- =====================================================================
-- Tablas
-- =====================================================================

create type public.tipo_tienda as enum ('online', 'supermercado', 'especializada', 'bodega');

create table public.tiendas (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  slug                  text not null,
  tipo                  public.tipo_tienda not null default 'online',
  web                   text not null,
  dominio               text generated always as (public.dominio_web(web)) stored,
  logo_url              text,
  info_envio            text,
  envio_gratis_desde    numeric(8, 2),
  -- Afiliación (nullable hasta que haya programas): plantilla con {url}.
  afiliacion_programa   text,
  afiliacion_plantilla  text,
  -- Tienda online de una bodega del catálogo.
  bodega_id             uuid references public.bodegas (id) on delete set null,
  -- Fuente (scraper) que trae sus precios.
  fuente_id             uuid references public.fuentes (id) on delete set null,
  activa                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint tiendas_slug_key unique (slug),
  constraint tiendas_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tiendas_web_check check (web ~* '^https?://'),
  constraint tiendas_logo_url_check check (logo_url ~* '^https?://'),
  constraint tiendas_envio_gratis_desde_check check (envio_gratis_desde >= 0),
  constraint tiendas_afiliacion_plantilla_check
    check (afiliacion_plantilla ~* '^https?://' and position('{url}' in afiliacion_plantilla) > 0)
);

create unique index tiendas_bodega_id_key on public.tiendas (bodega_id) where bodega_id is not null;
create unique index tiendas_fuente_id_key on public.tiendas (fuente_id) where fuente_id is not null;

create table public.ofertas (
  id                    uuid primary key default gen_random_uuid(),
  tienda_id             uuid not null references public.tiendas (id) on delete cascade,
  vino_id               uuid not null references public.vinos (id) on delete cascade,
  anada_id              uuid references public.anadas (id) on delete cascade,  -- null = sin añada en la tienda
  -- Identificador estable del producto en la tienda (SKU, id o ruta).
  id_externo            text not null,
  registro_id           uuid references public.registros_fuente (id) on delete set null,
  url                   text not null,
  precio                numeric(10, 2) not null,
  moneda                text not null default 'EUR',
  formato_ml            integer not null default 750,
  disponible            boolean not null default true,
  ean                   text,
  visto_por_ultima_vez  timestamptz not null default now(),
  -- Ejecuciones completas seguidas en las que la tienda no listó la oferta.
  ejecuciones_sin_ver   smallint not null default 0,
  -- Lo actualiza el comprobador de enlaces; la interfaz oculta 'oculto'.
  estado_enlace         public.estado_enlace not null default 'sin_comprobar',
  -- Decisión del admin: la oferta no se muestra. Ningún scraper la cambia.
  oculta_admin          boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ofertas_tienda_id_id_externo_key unique (tienda_id, id_externo),
  constraint ofertas_url_check check (url ~* '^https?://'),
  constraint ofertas_precio_check check (precio > 0 and precio < 100000),
  constraint ofertas_moneda_check check (moneda ~ '^[A-Z]{3}$'),
  constraint ofertas_formato_ml_check check (formato_ml between 50 and 30000),
  constraint ofertas_ean_check check (ean ~ '^([0-9]{8}|[0-9]{12,14})$'),
  constraint ofertas_ejecuciones_sin_ver_check check (ejecuciones_sin_ver >= 0)
);

create index ofertas_vino_id_formato_ml_idx on public.ofertas (vino_id, formato_ml);
create index ofertas_anada_id_idx on public.ofertas (anada_id) where anada_id is not null;
create index ofertas_registro_id_idx on public.ofertas (registro_id) where registro_id is not null;
create index ofertas_tienda_id_visto_idx on public.ofertas (tienda_id, visto_por_ultima_vez);

-- Tramos de precio de una oferta: [desde, hasta), hasta null = vigente.
create table public.historial_precios (
  id          uuid primary key default gen_random_uuid(),
  oferta_id   uuid not null references public.ofertas (id) on delete cascade,
  precio      numeric(10, 2) not null,
  desde       timestamptz not null default now(),
  hasta       timestamptz,
  constraint historial_precios_precio_check check (precio > 0),
  constraint historial_precios_hasta_check check (hasta >= desde)
);

create unique index historial_precios_vigente_key on public.historial_precios (oferta_id)
  where hasta is null;
create index historial_precios_oferta_id_desde_idx on public.historial_precios (oferta_id, desde);

create trigger set_updated_at before update on public.tiendas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ofertas
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Triggers de ofertas
-- =====================================================================

-- vino_id siempre es el de la añada (si la hay).
create or replace function public.ofertas_vino_de_anada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anada_id is not null then
    select a.vino_id into new.vino_id from public.anadas a where a.id = new.anada_id;
    if new.vino_id is null then
      raise exception 'anada_inexistente: %', new.anada_id using errcode = '23503';
    end if;
  end if;
  return new;
end
$$;

revoke execute on function public.ofertas_vino_de_anada() from public, anon, authenticated;

create trigger vino_de_anada before insert or update of anada_id, vino_id on public.ofertas
  for each row execute function public.ofertas_vino_de_anada();

-- Si una añada cambia de vino (fusión, corrección del admin), sus ofertas la siguen.
create or replace function public.anadas_mover_ofertas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.ofertas set vino_id = new.vino_id
  where anada_id = new.id and vino_id is distinct from new.vino_id;
  return null;
end
$$;

revoke execute on function public.anadas_mover_ofertas() from public, anon, authenticated;

create trigger mover_ofertas after update of vino_id on public.anadas
  for each row when (old.vino_id is distinct from new.vino_id)
  execute function public.anadas_mover_ofertas();

-- Historial: un tramo nuevo al crear la oferta y cada vez que cambia el precio.
create or replace function public.ofertas_historial_precio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.precio = old.precio then
      return null;
    end if;
    update public.historial_precios set hasta = greatest(now(), desde)
    where oferta_id = new.id and hasta is null;
  end if;
  insert into public.historial_precios (oferta_id, precio, desde) values (new.id, new.precio, now());
  return null;
end
$$;

revoke execute on function public.ofertas_historial_precio() from public, anon, authenticated;

create trigger historial_precio after insert or update of precio on public.ofertas
  for each row execute function public.ofertas_historial_precio();

-- =====================================================================
-- Funciones
-- =====================================================================

-- Fin de una ejecución completa de un scraper: las ofertas de la tienda que no
-- se vieron desde `p_inicio` suman una ejecución sin ver; al llegar a
-- `p_umbral` pasan a no disponibles (no se borran: conservan su historial).
-- Devuelve cuántas pasaron a no disponibles en esta llamada.
create or replace function public.marcar_ofertas_no_vistas(
  p_tienda  uuid,
  p_inicio  timestamptz,
  p_umbral  integer default 3
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  with marcadas as (
    update public.ofertas o set
      ejecuciones_sin_ver = least(o.ejecuciones_sin_ver + 1, 32767),
      disponible = case when o.ejecuciones_sin_ver + 1 >= greatest(coalesce(p_umbral, 3), 1)
                        then false else o.disponible end
    where o.tienda_id = p_tienda and o.visto_por_ultima_vez < p_inicio
    returning o.disponible, o.ejecuciones_sin_ver
  )
  select count(*) into n from marcadas
  where not disponible and ejecuciones_sin_ver = greatest(coalesce(p_umbral, 3), 1);
  return n;
end
$$;

revoke execute on function public.marcar_ofertas_no_vistas(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.marcar_ofertas_no_vistas(uuid, timestamptz, integer) to service_role;

-- Precio "desde" de un vino en un formato: la oferta visible y disponible más
-- barata (visible = tienda activa, sin ocultar por el admin ni por el
-- comprobador de enlaces).
create or replace function public.precio_desde_vino(p_vino uuid, p_formato_ml integer default 750)
returns numeric
language sql
stable
set search_path = ''
as $$
  select min(o.precio)
  from public.ofertas o
  join public.tiendas t on t.id = o.tienda_id
  where o.vino_id = p_vino
    and o.formato_ml = coalesce(p_formato_ml, 750)
    and o.disponible
    and not o.oculta_admin
    and o.estado_enlace <> 'oculto'
    and t.activa
$$;

revoke execute on function public.precio_desde_vino(uuid, integer) from public;
grant execute on function public.precio_desde_vino(uuid, integer) to anon, authenticated, service_role;

-- Fusión: mueve las ofertas de una añada (o las de un vino sin añada) al
-- superviviente. La clave (tienda, id_externo) es única, así que el mismo
-- producto nunca está en los dos lados; sí puede haber dos productos de la
-- misma tienda que son el mismo (misma URL y formato): se queda el visto más
-- recientemente y se le unen los tramos cerrados del otro.
create or replace function public._fusion_mover_ofertas(
  p_nivel    text,  -- 'anada' | 'vino'
  p_origen   uuid,
  p_destino  uuid
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o  record;
  d  record;
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  for o in
    select * from public.ofertas
    where (p_nivel = 'anada' and anada_id = p_origen)
       or (p_nivel = 'vino' and vino_id = p_origen and anada_id is null)
  loop
    select * into d from public.ofertas x
    where x.tienda_id = o.tienda_id and x.url = o.url and x.formato_ml = o.formato_ml
      and ((p_nivel = 'anada' and x.anada_id = p_destino)
           or (p_nivel = 'vino' and x.vino_id = p_destino and x.anada_id is null))
    limit 1;
    if not found then
      if p_nivel = 'anada' then
        update public.ofertas set anada_id = p_destino where id = o.id;
      else
        update public.ofertas set vino_id = p_destino where id = o.id;
      end if;
    elsif d.visto_por_ultima_vez >= o.visto_por_ultima_vez then
      -- Gana la del destino: hereda los tramos cerrados de la absorbida.
      update public.historial_precios set oferta_id = d.id
      where oferta_id = o.id and hasta is not null;
      delete from public.ofertas where id = o.id;
    else
      -- Gana la absorbida (más reciente): hereda los tramos cerrados del destino.
      update public.historial_precios set oferta_id = o.id
      where oferta_id = d.id and hasta is not null;
      update public.ofertas set oculta_admin = o.oculta_admin or d.oculta_admin where id = o.id;
      delete from public.ofertas where id = d.id;
      if p_nivel = 'anada' then
        update public.ofertas set anada_id = p_destino where id = o.id;
      else
        update public.ofertas set vino_id = p_destino where id = o.id;
      end if;
    end if;
  end loop;
end
$$;

revoke execute on function public._fusion_mover_ofertas(text, uuid, uuid) from public, anon;
grant execute on function public._fusion_mover_ofertas(text, uuid, uuid) to authenticated;

-- admin_fusionar (20261110090000_consolidacion) + ofertas y tiendas. Idéntica
-- salvo las llamadas marcadas «Ofertas» y «tienda online».
create or replace function public.admin_fusionar(
  p_tipo     text,  -- 'bodega' | 'vino'
  p_origen   uuid,
  p_destino  uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a   record;
  da  uuid;
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  if p_tipo not in ('bodega', 'vino') then
    raise exception 'tipo_invalido: %', p_tipo using errcode = '22023';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'misma_entidad: origen y destino deben ser distintos' using errcode = '22023';
  end if;

  perform set_config('app.fusionando', 'on', true);

  if p_tipo = 'bodega' then
    perform 1 from public.bodegas where id in (p_origen, p_destino) for update;
    if (select count(*) from public.bodegas where id in (p_origen, p_destino)) <> 2 then
      raise exception 'no_encontrada: bodega inexistente' using errcode = 'P0002';
    end if;

    perform public._fusion_comun('bodegas', 'bodega', p_origen, p_destino, array[
      'descripcion', 'historia', 'direccion', 'codigo_postal', 'municipio', 'provincia',
      'comunidad', 'ubicacion', 'web', 'telefono', 'email', 'anio_fundacion', 'hectareas',
      'enoturismo_web', 'enoturismo_email', 'enoturismo_telefono', 'nif',
      'registro_embotellador', 'fuente_id']);
    update public.bodegas d set redes = o.redes || d.redes
    from public.bodegas o where d.id = p_destino and o.id = p_origen;

    update public.vinos set bodega_id = p_destino where bodega_id = p_origen;

    insert into public.bodega_denominaciones (bodega_id, denominacion_id, principal)
    select p_destino, bd.denominacion_id,
           bd.principal and not exists (
             select 1 from public.bodega_denominaciones x where x.bodega_id = p_destino and x.principal)
    from public.bodega_denominaciones bd
    where bd.bodega_id = p_origen
    on conflict (bodega_id, denominacion_id) do nothing;

    -- Servicios: el del destino gana si es el mismo (tipo + título).
    update public.imagenes i set servicio_id = d.id, principal = false
    from public.servicios_bodega o
    join public.servicios_bodega d on d.bodega_id = p_destino and d.tipo = o.tipo and d.clave = o.clave
    where o.bodega_id = p_origen and i.servicio_id = o.id;
    delete from public.servicios_bodega o
    where o.bodega_id = p_origen
      and exists (select 1 from public.servicios_bodega d
                  where d.bodega_id = p_destino and d.tipo = o.tipo and d.clave = o.clave);
    update public.servicios_bodega set bodega_id = p_destino where bodega_id = p_origen;

    update public.imagenes set
      bodega_id = p_destino,
      principal = principal and not exists (
        select 1 from public.imagenes x where x.bodega_id = p_destino and x.principal)
    where bodega_id = p_origen;

    perform public._fusion_mover_personales('bodega', p_origen, p_destino);
    -- La tienda online de la bodega pasa al destino si este no tiene ya una.
    update public.tiendas set bodega_id = p_destino
    where bodega_id = p_origen
      and not exists (select 1 from public.tiendas t where t.bodega_id = p_destino);
    delete from public.bodegas where id = p_origen;

  else
    perform 1 from public.vinos where id in (p_origen, p_destino) for update;
    if (select count(*) from public.vinos where id in (p_origen, p_destino)) <> 2 then
      raise exception 'no_encontrado: vino inexistente' using errcode = 'P0002';
    end if;

    perform public._fusion_comun('vinos', 'vino', p_origen, p_destino, array[
      'crianza', 'denominacion_id', 'descripcion', 'elaboracion', 'fuente_id']);

    for a in select * from public.anadas where vino_id = p_origen loop
      select id into da from public.anadas
      where vino_id = p_destino and anio is not distinct from a.anio;
      if da is null then
        update public.anadas set vino_id = p_destino where id = a.id;
      else
        perform public._fusion_comun('anadas', 'anada', a.id, da, array[
          'grado', 'meses_crianza', 'notas_cata', 'maridaje', 'temp_servicio_min',
          'temp_servicio_max', 'produccion_botellas', 'elaboracion', 'cata_vista',
          'cata_nariz', 'cata_boca']);
        insert into public.anada_variedades (anada_id, variedad_id, porcentaje)
        select da, av.variedad_id, av.porcentaje
        from public.anada_variedades av
        where av.anada_id = a.id
          and not exists (select 1 from public.anada_variedades x where x.anada_id = da)
        on conflict (anada_id, variedad_id) do nothing;
        update public.imagenes set
          anada_id = da,
          principal = principal and not exists (
            select 1 from public.imagenes x where x.anada_id = da and x.principal)
        where anada_id = a.id;
        update public.codigos_ean set anada_id = da where anada_id = a.id;
        perform public._fusion_mover_personales('anada', a.id, da);
        -- Ofertas (y su historial, que cuelga de la oferta) a la añada superviviente.
        perform public._fusion_mover_ofertas('anada', a.id, da);
        delete from public.anadas where id = a.id;
      end if;
    end loop;

    update public.codigos_ean set vino_id = p_destino where vino_id = p_origen;
    update public.imagenes set
      vino_id = p_destino,
      principal = principal and not exists (
        select 1 from public.imagenes x where x.vino_id = p_destino and x.principal)
    where vino_id = p_origen;

    perform public._fusion_mover_personales('vino', p_origen, p_destino);
    -- Ofertas sin añada (las de añadas movidas ya siguen a su añada).
    perform public._fusion_mover_ofertas('vino', p_origen, p_destino);
    delete from public.vinos where id = p_origen;
  end if;

  perform set_config('app.fusionando', '', true);
end
$$;

-- =====================================================================
-- listar_vinos: filtro y orden por precio
-- =====================================================================
-- Misma función que en 20261108090000_catalogo_lectura, con dos parámetros
-- nuevos al final (precio_min, precio_max), el orden 'precio' (ascendente,
-- sin precio al final) y la columna precio_desde. Sin filtro de precio ni
-- orden 'precio' devuelve exactamente lo mismo que antes. Cambia la firma, así
-- que se borra y se crea de nuevo (con sus permisos).

drop function public.listar_vinos(text, public.tipo_vino[], public.crianza_vino[], text[], text[],
                                  smallint, boolean, text, text, integer, integer);

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
  desplazamiento  integer default 0,
  precio_min      numeric default null,  -- € (75 cl): precio «desde» >= precio_min
  precio_max      numeric default null   -- € (75 cl): precio «desde» <= precio_max
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
  total                bigint,
  precio_desde         numeric      -- oferta visible y disponible más barata en 75 cl
)
language sql
stable
set search_path = ''
as $$
  with coincidencias as (
    select x.id, max(x.rel) as rel
    from (
      select v.id, public.relevancia_nombre(public.normalizar_busqueda(listar_vinos.q), v.nombre) as rel
      from public.vinos v
      where extensions.word_similarity(public.normalizar_busqueda(listar_vinos.q), public.f_unaccent(v.nombre)) >= 0.4
         or public.f_unaccent(v.nombre) ilike public.patron_contiene(listar_vinos.q)
      union all
      select v.id, (public.relevancia_nombre(public.normalizar_busqueda(listar_vinos.q), b.nombre) * 0.8)::real
      from public.bodegas b
      join public.vinos v on v.bodega_id = b.id
      where extensions.word_similarity(public.normalizar_busqueda(listar_vinos.q), public.f_unaccent(b.nombre)) >= 0.4
         or public.f_unaccent(b.nombre) ilike public.patron_contiene(listar_vinos.q)
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
    public.f_unaccent(p.nombre), p.id
$$;

revoke execute on function
  public.listar_vinos(text, public.tipo_vino[], public.crianza_vino[], text[], text[],
                      smallint, boolean, text, text, integer, integer, numeric, numeric)
from public;
grant execute on function
  public.listar_vinos(text, public.tipo_vino[], public.crianza_vino[], text[], text[],
                      smallint, boolean, text, text, integer, integer, numeric, numeric)
to anon, authenticated, service_role;

-- =====================================================================
-- Semillas: tiendas de las fuentes que ya traen precio (idempotente)
-- =====================================================================

insert into public.tiendas (nombre, slug, tipo, web, fuente_id)
select f.nombre, f.slug, 'especializada', f.url_base, f.id
from public.fuentes f
where f.slug in ('vinoseleccion', 'vinopremier')
on conflict do nothing;

-- =====================================================================
-- Permisos y RLS
-- =====================================================================
-- Lectura pública (como el catálogo); escritura de scrapers (service_role) y admin.

alter table public.tiendas            enable row level security;
alter table public.ofertas            enable row level security;
alter table public.historial_precios  enable row level security;

revoke all on public.tiendas, public.ofertas, public.historial_precios from anon, authenticated;

grant select, insert, update, delete on public.tiendas, public.ofertas, public.historial_precios
  to service_role;
grant select on public.tiendas, public.ofertas, public.historial_precios to anon, authenticated;
grant insert, update, delete on public.tiendas, public.ofertas, public.historial_precios
  to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['tiendas', 'ofertas', 'historial_precios'] loop
    execute format(
      'create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format(
      'create policy "admin inserta" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format(
      'create policy "admin actualiza" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format(
      'create policy "admin borra" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end
$$;
