-- Comprobador de enlaces semanal (§8) y su gestión en el admin.
--
-- comprobaciones_enlace ya existe (catalogo_inicial): una fila por URL de una
-- entidad. Aquí se completa:
--   * modo: 'auto' (lo decide el comprobador), 'oculto' (el admin lo oculta a
--     mano) o 'ignorado' (falso positivo: no se oculta ni se comprueba).
--   * oculto se calcula con un trigger: modo 'oculto', o modo 'auto' con 2 o
--     más fallos seguidos. Un OK pone los fallos a 0 y lo reactiva.
--   * Las imágenes reflejan el estado en imagenes.estado_enlace (la interfaz
--     ya filtra 'oculto'). El resto de enlaces (web, enoturismo_web,
--     url_reserva, URL de procedencia) se filtra con las funciones
--     enlaces_ocultos(<fila>), que PostgREST expone como campo calculado: la
--     ficha las pide en la misma consulta.
--   * sincronizar_comprobaciones_enlace() recoge las URLs vigentes y
--     registrar_comprobacion_enlace() guarda cada resultado.
--   * admin_editar_url_enlace() corrige la URL en la entidad.
-- Las ejecuciones se registran en ejecuciones_scraper con la fuente
-- 'comprobador-enlaces'.

-- =====================================================================
-- Columnas nuevas
-- =====================================================================

alter table public.comprobaciones_enlace
  add column modo text not null default 'auto',
  -- Campos de la entidad que usan esta URL: web, enoturismo_web, url_reserva,
  -- imagen, procedencia:<campo>. Informativo (lo rellena la sincronización).
  add column campos text[] not null default '{}',
  -- ok | fallo | inconcluso (robots.txt, 401/403/429: no cuenta como fallo).
  add column ultimo_resultado text,
  add column ultimo_ok timestamptz,
  add column url_final text,  -- destino tras redirecciones
  add column metodo text,     -- HEAD o GET
  add constraint comprobaciones_enlace_modo_check
    check (modo in ('auto', 'oculto', 'ignorado')),
  add constraint comprobaciones_enlace_resultado_check
    check (ultimo_resultado in ('ok', 'fallo', 'inconcluso')),
  add constraint comprobaciones_enlace_metodo_check check (metodo in ('HEAD', 'GET')),
  add constraint comprobaciones_enlace_url_check check (url ~* '^https?://');

-- Cola del comprobador (lo más antiguo primero) y listados del admin.
create index comprobaciones_enlace_fallando_idx
  on public.comprobaciones_enlace (ultima_comprobacion desc)
  where fallos_consecutivos > 0 or modo <> 'auto';

-- =====================================================================
-- oculto y propagación a imagenes
-- =====================================================================

create or replace function public.calcular_oculto_enlace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.oculto := new.modo = 'oculto' or (new.modo = 'auto' and new.fallos_consecutivos >= 2);
  return new;
end
$$;

revoke execute on function public.calcular_oculto_enlace() from public, anon, authenticated;

create trigger calcular_oculto before insert or update on public.comprobaciones_enlace
  for each row execute function public.calcular_oculto_enlace();

-- imagenes.estado_enlace sigue a su comprobación (misma URL).
create or replace function public.propagar_estado_imagen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  estado public.estado_enlace;
begin
  if new.entidad_tipo <> 'imagen' then
    return null;
  end if;
  estado := case
    when new.oculto then 'oculto'
    when new.fallos_consecutivos > 0 then 'fallando'
    when new.ultimo_resultado = 'ok' then 'ok'
    else 'sin_comprobar'
  end;
  update public.imagenes
     set estado_enlace = estado
   where id = new.entidad_id and url = new.url and estado_enlace is distinct from estado;
  return null;
end
$$;

revoke execute on function public.propagar_estado_imagen() from public, anon, authenticated;

-- Sin lista de columnas: `update of oculto` no saltaría cuando oculto lo
-- cambia el trigger before (p. ej. el admin solo toca modo).
create trigger propagar_estado_imagen
  after insert or update on public.comprobaciones_enlace
  for each row execute function public.propagar_estado_imagen();

-- Una imagen que cambia de URL vuelve a 'sin_comprobar'.
create or replace function public.reiniciar_estado_imagen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.url is distinct from old.url then
    new.estado_enlace := 'sin_comprobar';
  end if;
  return new;
end
$$;

revoke execute on function public.reiniciar_estado_imagen() from public, anon, authenticated;

create trigger reiniciar_estado_enlace before update of url on public.imagenes
  for each row execute function public.reiniciar_estado_imagen();

-- =====================================================================
-- Sincronización y registro (comprobador)
-- =====================================================================

-- URLs vigentes de cada entidad: alta de las nuevas, campos al día y baja de
-- las que ya no usa nadie (con su historial y su modo).
create or replace function public.sincronizar_comprobaciones_enlace()
returns table (nuevos integer, borrados integer, total integer)
language sql
set search_path = ''
as $$
  with fuentes_url as (
    select 'imagen'::public.entidad_catalogo as entidad_tipo, i.id as entidad_id, i.url,
           'imagen' as campo
      from public.imagenes i
    union all
    select 'bodega', b.id, b.web, 'web' from public.bodegas b where b.web is not null
    union all
    select 'bodega', b.id, b.enoturismo_web, 'enoturismo_web'
      from public.bodegas b where b.enoturismo_web is not null
    union all
    select 'servicio_bodega', s.id, s.url_reserva, 'url_reserva'
      from public.servicios_bodega s where s.url_reserva is not null and s.activo
    union all
    select p.entidad_tipo, p.entidad_id, p.url, 'procedencia:' || p.campo
      from public.procedencia_campos p
     where p.url is not null and p.entidad_tipo in ('bodega', 'vino', 'anada')
  ),
  actuales as (
    select entidad_tipo, entidad_id, url, array_agg(distinct campo order by campo) as campos
      from fuentes_url
     where url ~* '^https?://'
     group by entidad_tipo, entidad_id, url
  ),
  borrados as (
    delete from public.comprobaciones_enlace c
     where not exists (
       select 1 from actuales a
        where a.entidad_tipo = c.entidad_tipo and a.entidad_id = c.entidad_id and a.url = c.url)
    returning 1
  ),
  altas as (
    insert into public.comprobaciones_enlace as c (entidad_tipo, entidad_id, url, campos)
    select entidad_tipo, entidad_id, url, campos from actuales
    on conflict (entidad_tipo, entidad_id, url) do update
      set campos = excluded.campos
      where c.campos is distinct from excluded.campos
    returning (xmax = 0) as nuevo
  )
  select (select count(*) from altas where nuevo)::integer,
         (select count(*) from borrados)::integer,
         (select count(*) from actuales)::integer;
$$;

revoke execute on function public.sincronizar_comprobaciones_enlace() from public, anon, authenticated;
grant execute on function public.sincronizar_comprobaciones_enlace() to service_role;

-- Resultado de una comprobación. 'ok' reactiva (fallos = 0); 'fallo' suma
-- uno; 'inconcluso' solo deja constancia. security invoker: la RLS de admin
-- aplica al botón "Reintentar"; el comprobador usa service_role.
create or replace function public.registrar_comprobacion_enlace(
  p_id uuid,
  p_resultado text,
  p_http integer default null,
  p_error text default null,
  p_url_final text default null,
  p_metodo text default null
)
returns setof public.comprobaciones_enlace
language sql
set search_path = ''
as $$
  update public.comprobaciones_enlace
     set ultima_comprobacion = now(),
         ultimo_resultado = p_resultado,
         ultimo_estado_http = case when p_http between 100 and 599 then p_http end,
         ultimo_error = case when p_resultado = 'ok' then null else left(p_error, 500) end,
         url_final = case when p_url_final is distinct from url then p_url_final end,
         metodo = p_metodo,
         ultimo_ok = case when p_resultado = 'ok' then now() else ultimo_ok end,
         fallos_consecutivos = case p_resultado
           when 'ok' then 0
           when 'fallo' then least(fallos_consecutivos + 1, 1000)
           else fallos_consecutivos
         end
   where id = p_id
  returning *;
$$;

revoke execute on function
  public.registrar_comprobacion_enlace(uuid, text, integer, text, text, text)
from public, anon;
grant execute on function
  public.registrar_comprobacion_enlace(uuid, text, integer, text, text, text)
to authenticated, service_role;

-- =====================================================================
-- Enlaces ocultos para las fichas públicas
-- =====================================================================
-- Campos calculados de PostgREST (select=…,enlaces_ocultos): solo devuelven
-- las URLs ocultas de esa fila, sin contadores ni errores. security definer
-- porque comprobaciones_enlace es solo de admin.

create or replace function public.enlaces_ocultos(public.bodegas)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.url order by c.url), '{}')
    from public.comprobaciones_enlace c
   where c.entidad_tipo = 'bodega' and c.entidad_id = $1.id and c.oculto;
$$;

create or replace function public.enlaces_ocultos(public.vinos)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.url order by c.url), '{}')
    from public.comprobaciones_enlace c
   where c.entidad_tipo = 'vino' and c.entidad_id = $1.id and c.oculto;
$$;

create or replace function public.enlaces_ocultos(public.anadas)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.url order by c.url), '{}')
    from public.comprobaciones_enlace c
   where c.entidad_tipo = 'anada' and c.entidad_id = $1.id and c.oculto;
$$;

create or replace function public.enlaces_ocultos(public.servicios_bodega)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.url order by c.url), '{}')
    from public.comprobaciones_enlace c
   where c.entidad_tipo = 'servicio_bodega' and c.entidad_id = $1.id and c.oculto;
$$;

revoke execute on function
  public.enlaces_ocultos(public.bodegas), public.enlaces_ocultos(public.vinos),
  public.enlaces_ocultos(public.anadas), public.enlaces_ocultos(public.servicios_bodega)
from public;
grant execute on function
  public.enlaces_ocultos(public.bodegas), public.enlaces_ocultos(public.vinos),
  public.enlaces_ocultos(public.anadas), public.enlaces_ocultos(public.servicios_bodega)
to anon, authenticated, service_role;

-- =====================================================================
-- Admin: corregir la URL
-- =====================================================================

-- Cambia la URL en la entidad (donde valga la antigua), en su procedencia y en
-- la comprobación, que vuelve a empezar (modo auto, sin fallos). security
-- invoker: la RLS de admin protege cada tabla.
create or replace function public.admin_editar_url_enlace(p_id uuid, p_url text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  c public.comprobaciones_enlace;
  nuevo_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'solo_admin' using errcode = '42501';
  end if;
  p_url := btrim(p_url);
  if p_url is null or p_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'url_invalida' using errcode = '22023';
  end if;
  select * into c from public.comprobaciones_enlace where id = p_id for update;
  if not found then
    raise exception 'no_encontrado' using errcode = 'P0002';
  end if;
  if c.url = p_url then
    return c.id;
  end if;

  case c.entidad_tipo
    when 'imagen' then
      update public.imagenes set url = p_url where id = c.entidad_id and url = c.url;
    when 'bodega' then
      update public.bodegas
         set web = case when web = c.url then p_url else web end,
             enoturismo_web = case when enoturismo_web = c.url then p_url else enoturismo_web end
       where id = c.entidad_id and (web = c.url or enoturismo_web = c.url);
    when 'servicio_bodega' then
      update public.servicios_bodega set url_reserva = p_url
       where id = c.entidad_id and url_reserva = c.url;
    else
      null;
  end case;
  update public.procedencia_campos set url = p_url
   where entidad_tipo = c.entidad_tipo and entidad_id = c.entidad_id and url = c.url;

  delete from public.comprobaciones_enlace where id = c.id;
  insert into public.comprobaciones_enlace as x (entidad_tipo, entidad_id, url, campos)
  values (c.entidad_tipo, c.entidad_id, p_url, c.campos)
  on conflict (entidad_tipo, entidad_id, url) do update
    set modo = 'auto', fallos_consecutivos = 0, ultima_comprobacion = null,
        ultimo_resultado = null, ultimo_error = null, ultimo_estado_http = null,
        campos = (select array_agg(distinct v order by v) from unnest(x.campos || excluded.campos) v)
  returning x.id into nuevo_id;
  return nuevo_id;
end
$$;

revoke execute on function public.admin_editar_url_enlace(uuid, text) from public, anon;
grant execute on function public.admin_editar_url_enlace(uuid, text) to authenticated;

-- =====================================================================
-- Admin: fuentes con ejecuciones (filtro de /admin/ejecuciones)
-- =====================================================================

-- security invoker: la RLS de ejecuciones_scraper (solo admin) deja la lista
-- vacía para cualquier otro.
create or replace function public.admin_fuentes_con_ejecuciones()
returns table (slug text, nombre text)
language sql
stable
set search_path = ''
as $$
  select f.slug, f.nombre
    from public.fuentes f
   where exists (select 1 from public.ejecuciones_scraper e where e.fuente_id = f.id)
   order by f.nombre;
$$;

revoke execute on function public.admin_fuentes_con_ejecuciones() from public, anon;
grant execute on function public.admin_fuentes_con_ejecuciones() to authenticated, service_role;

-- =====================================================================
-- Fuente para registrar las ejecuciones
-- =====================================================================

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, activa, notas_robots)
values (
  'Comprobador de enlaces', 'comprobador-enlaces', 'otra',
  'https://github.com/migtoqu/wine-app', 'semanal', true,
  'No es una fuente de datos: comprueba los enlaces del catálogo. HEAD y, si no, GET; '
  'respeta robots.txt de cada host y espera 2–4 s entre peticiones al mismo host.'
)
on conflict (slug) do nothing;
