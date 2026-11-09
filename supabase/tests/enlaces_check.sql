-- Comprobación del comprobador de enlaces (migración 20261112090000):
-- ocultación tras 2 fallos, reactivación, modos del admin, propagación a
-- imagenes, sincronización, edición de URL y permisos (anon / user / admin).
--
-- Autocontenido: crea sus datos y lo deshace todo con rollback. Cualquier
-- fallo lanza una excepción con el prefijo "FALLO". Ejecutar como postgres.

begin;

-- =====================================================================
-- 1. Datos de prueba (como postgres)
-- =====================================================================
-- Usuarios: …0031 admin, …0032 usuario normal.

insert into public.invitaciones (email, rol) values
  ('enlaces-admin@example.test', 'admin'),
  ('enlaces-user@example.test', 'user');
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000031', 'enlaces-admin@example.test'),
  ('00000000-0000-4000-8000-000000000032', 'enlaces-user@example.test');
update public.perfiles set rol = 'admin' where id = '00000000-0000-4000-8000-000000000031';
update public.perfiles set rol = 'user' where id = '00000000-0000-4000-8000-000000000032';

insert into public.bodegas (id, nombre, slug, web, enoturismo_web) values
  ('b0000000-0000-4000-8000-000000000031', 'Bodega Enlaces', 'enlaces-check-bodega',
   'https://bodega-enlaces.example.test/', 'https://bodega-enlaces.example.test/visitas');
insert into public.servicios_bodega (id, bodega_id, tipo, titulo, url_reserva) values
  ('a0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000031', 'visita',
   'Visita', 'https://reservas.example.test/visita');
insert into public.vinos (id, bodega_id, nombre, slug, tipo) values
  ('c0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000031',
   'Vino Enlaces', 'enlaces-check-vino', 'tinto');
insert into public.imagenes (id, vino_id, url, tipo) values
  ('e1000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000031',
   'https://img.example.test/botella.jpg', 'botella');
insert into public.procedencia_campos (entidad_tipo, entidad_id, campo, origen, url) values
  ('vino', 'c0000000-0000-4000-8000-000000000031', 'descripcion', 'tienda',
   'https://tienda.example.test/vino-enlaces');

-- =====================================================================
-- 2. Permisos
-- =====================================================================

do $$
begin
  if has_function_privilege('anon', 'public.sincronizar_comprobaciones_enlace()', 'execute')
     or has_function_privilege('authenticated', 'public.sincronizar_comprobaciones_enlace()', 'execute') then
    raise exception 'FALLO: la sincronización no es solo de service_role';
  end if;
  if has_function_privilege('anon',
       'public.registrar_comprobacion_enlace(uuid, text, integer, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.admin_editar_url_enlace(uuid, text)', 'execute') then
    raise exception 'FALLO: anon puede registrar o editar enlaces';
  end if;
  if not has_function_privilege('anon', 'public.enlaces_ocultos(public.bodegas)', 'execute') then
    raise exception 'FALLO: anon no puede leer los enlaces ocultos de una bodega';
  end if;
  if has_table_privilege('anon', 'public.comprobaciones_enlace', 'select') then
    raise exception 'FALLO: anon tiene select en comprobaciones_enlace';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.enlaces_ocultos(public.bodegas)'::regprocedure)
       is not true
     or not exists (
       select 1 from pg_proc
        where oid = 'public.enlaces_ocultos(public.bodegas)'::regprocedure
          and proconfig @> array['search_path=""'])
  then
    raise exception 'FALLO: enlaces_ocultos no es security definer con search_path fijo';
  end if;
end
$$;

-- =====================================================================
-- 3. Sincronización (como service_role)
-- =====================================================================

set local role service_role;

do $$
declare
  r record;
  n integer;
begin
  select * into r from public.sincronizar_comprobaciones_enlace();
  select count(*) into n from public.comprobaciones_enlace
   where entidad_id in ('b0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000031',
                        'c0000000-0000-4000-8000-000000000031', 'e1000000-0000-4000-8000-000000000031');
  if n <> 5 then
    raise exception 'FALLO (sync): esperaba 5 enlaces de prueba, hay %', n;
  end if;
  if not exists (select 1 from public.comprobaciones_enlace
                  where entidad_tipo = 'vino' and campos = array['procedencia:descripcion']) then
    raise exception 'FALLO (sync): falta el enlace de procedencia';
  end if;

  -- Idempotente.
  select * into r from public.sincronizar_comprobaciones_enlace();
  if r.nuevos <> 0 or r.borrados <> 0 then
    raise exception 'FALLO (sync): la segunda pasada no es idempotente (% nuevos, % borrados)',
      r.nuevos, r.borrados;
  end if;

  -- La URL que deja de usarse se borra.
  update public.bodegas set enoturismo_web = null where id = 'b0000000-0000-4000-8000-000000000031';
  select * into r from public.sincronizar_comprobaciones_enlace();
  if r.borrados <> 1 then
    raise exception 'FALLO (sync): esperaba 1 borrado, hay %', r.borrados;
  end if;
end
$$;

-- =====================================================================
-- 4. Fallos, ocultación y reactivación (como service_role)
-- =====================================================================

do $$
declare
  img uuid := (select id from public.comprobaciones_enlace where entidad_tipo = 'imagen'
                and entidad_id = 'e1000000-0000-4000-8000-000000000031');
  web uuid := (select id from public.comprobaciones_enlace where entidad_tipo = 'bodega'
                and entidad_id = 'b0000000-0000-4000-8000-000000000031');
  c public.comprobaciones_enlace;
begin
  -- Primer fallo: fallando, aún visible.
  perform public.registrar_comprobacion_enlace(img, 'fallo', 404, 'HTTP 404', null, 'HEAD');
  select * into c from public.comprobaciones_enlace where id = img;
  if c.oculto or c.fallos_consecutivos <> 1 then
    raise exception 'FALLO: un fallo no debe ocultar (oculto=%, fallos=%)', c.oculto, c.fallos_consecutivos;
  end if;
  if (select estado_enlace from public.imagenes where id = 'e1000000-0000-4000-8000-000000000031') <> 'fallando' then
    raise exception 'FALLO: la imagen no pasa a fallando';
  end if;

  -- Inconcluso no cuenta.
  perform public.registrar_comprobacion_enlace(img, 'inconcluso', 403, 'HTTP 403', null, 'GET');
  if (select fallos_consecutivos from public.comprobaciones_enlace where id = img) <> 1 then
    raise exception 'FALLO: un resultado inconcluso ha contado como fallo';
  end if;

  -- Segundo fallo: oculto.
  perform public.registrar_comprobacion_enlace(img, 'fallo', 404, 'HTTP 404', null, 'GET');
  if not (select oculto from public.comprobaciones_enlace where id = img) then
    raise exception 'FALLO: dos fallos seguidos no ocultan';
  end if;
  if (select estado_enlace from public.imagenes where id = 'e1000000-0000-4000-8000-000000000031') <> 'oculto' then
    raise exception 'FALLO: la imagen no pasa a oculto';
  end if;

  -- Vuelve: OK reactiva.
  perform public.registrar_comprobacion_enlace(img, 'ok', 200, null, null, 'HEAD');
  select * into c from public.comprobaciones_enlace where id = img;
  if c.oculto or c.fallos_consecutivos <> 0 or c.ultimo_ok is null or c.ultimo_error is not null then
    raise exception 'FALLO: un OK no reactiva el enlace';
  end if;
  if (select estado_enlace from public.imagenes where id = 'e1000000-0000-4000-8000-000000000031') <> 'ok' then
    raise exception 'FALLO: la imagen no vuelve a ok';
  end if;

  -- La web de la bodega se oculta para la ficha pública.
  perform public.registrar_comprobacion_enlace(web, 'fallo', null, 'ENOTFOUND', null, 'HEAD');
  perform public.registrar_comprobacion_enlace(web, 'fallo', null, 'ENOTFOUND', null, 'GET');
end
$$;

reset role;

-- =====================================================================
-- 5. anon: solo las URLs ocultas, a través de enlaces_ocultos
-- =====================================================================

set local role anon;

do $$
declare
  ocultas text[];
begin
  select public.enlaces_ocultos(b) into ocultas from public.bodegas b
   where b.id = 'b0000000-0000-4000-8000-000000000031';
  if ocultas is distinct from array['https://bodega-enlaces.example.test/'] then
    raise exception 'FALLO (anon): enlaces_ocultos(bodega) = %', ocultas;
  end if;
  select public.enlaces_ocultos(s) into ocultas from public.servicios_bodega s
   where s.id = 'a0000000-0000-4000-8000-000000000031';
  if ocultas <> '{}' then
    raise exception 'FALLO (anon): una reserva visible aparece como oculta';
  end if;

  begin
    perform 1 from public.comprobaciones_enlace limit 1;
    raise exception 'FALLO (anon): puede leer comprobaciones_enlace';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- =====================================================================
-- 6. Usuario normal: ni lee ni modifica
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000032", "role": "authenticated"}';

do $$
declare
  n integer;
  c uuid := (select id from public.comprobaciones_enlace limit 1);  -- null por la RLS
begin
  select count(*) into n from public.comprobaciones_enlace;
  if n <> 0 then
    raise exception 'FALLO (usuario): ve % comprobaciones', n;
  end if;
  if (select count(*) from public.ejecuciones_scraper) <> 0 then
    raise exception 'FALLO (usuario): ve ejecuciones de scrapers';
  end if;
  update public.comprobaciones_enlace set modo = 'ignorado' where id is not null;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO (usuario): ha cambiado el modo de % enlaces', n;
  end if;
  begin
    perform public.admin_editar_url_enlace(
      coalesce(c, gen_random_uuid()), 'https://otra.example.test/');
    raise exception 'FALLO (usuario): ha podido editar una URL';
  exception when insufficient_privilege then null;
  end;
  if (select public.enlaces_ocultos(b) from public.bodegas b
       where b.id = 'b0000000-0000-4000-8000-000000000031') <> array['https://bodega-enlaces.example.test/'] then
    raise exception 'FALLO (usuario): enlaces_ocultos no devuelve la web oculta';
  end if;
end
$$;

reset role;

-- =====================================================================
-- 7. Admin: modos, reintento y edición de URL
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000031", "role": "authenticated"}';

do $$
declare
  img uuid := (select id from public.comprobaciones_enlace where entidad_tipo = 'imagen'
                and entidad_id = 'e1000000-0000-4000-8000-000000000031');
  web uuid := (select id from public.comprobaciones_enlace where entidad_tipo = 'bodega'
                and entidad_id = 'b0000000-0000-4000-8000-000000000031');
  nuevo uuid;
begin
  if img is null or web is null then
    raise exception 'FALLO (admin): no ve las comprobaciones';
  end if;

  -- Ocultar a mano: oculto aunque esté OK, y la imagen lo refleja.
  update public.comprobaciones_enlace set modo = 'oculto' where id = img;
  if (select estado_enlace from public.imagenes where id = 'e1000000-0000-4000-8000-000000000031') <> 'oculto' then
    raise exception 'FALLO (admin): ocultar a mano no oculta la imagen';
  end if;
  perform public.registrar_comprobacion_enlace(img, 'ok', 200, null, null, 'HEAD');
  if not (select oculto from public.comprobaciones_enlace where id = img) then
    raise exception 'FALLO (admin): un OK reactiva un enlace oculto a mano';
  end if;
  update public.comprobaciones_enlace set modo = 'auto' where id = img;
  if (select estado_enlace from public.imagenes where id = 'e1000000-0000-4000-8000-000000000031') <> 'ok' then
    raise exception 'FALLO (admin): mostrar no devuelve la imagen a ok';
  end if;

  -- Ignorar: no se oculta aunque falle.
  update public.comprobaciones_enlace set modo = 'ignorado' where id = web;
  if (select oculto from public.comprobaciones_enlace where id = web) then
    raise exception 'FALLO (admin): un enlace ignorado sigue oculto';
  end if;
  perform public.registrar_comprobacion_enlace(web, 'fallo', 404, 'HTTP 404', null, 'GET');
  if (select oculto from public.comprobaciones_enlace where id = web) then
    raise exception 'FALLO (admin): un enlace ignorado se oculta al fallar';
  end if;
  update public.comprobaciones_enlace set modo = 'auto' where id = web;
  if not (select oculto from public.comprobaciones_enlace where id = web) then
    raise exception 'FALLO (admin): al dejar de ignorar no se aplica el recuento de fallos';
  end if;

  -- Editar URL: cambia la entidad y reinicia la comprobación.
  begin
    perform public.admin_editar_url_enlace(web, 'no-es-una-url');
    raise exception 'FALLO (admin): acepta una URL no válida';
  exception when invalid_parameter_value then null;
  end;
  nuevo := public.admin_editar_url_enlace(web, 'https://bodega-enlaces.example.test/nueva');
  if (select b.web from public.bodegas b where b.id = 'b0000000-0000-4000-8000-000000000031')
       <> 'https://bodega-enlaces.example.test/nueva' then
    raise exception 'FALLO (admin): la web de la bodega no cambió';
  end if;
  if exists (select 1 from public.comprobaciones_enlace where id = web)
     or (select oculto or fallos_consecutivos <> 0 from public.comprobaciones_enlace where id = nuevo) then
    raise exception 'FALLO (admin): la comprobación no se reinició con la URL nueva';
  end if;

  nuevo := public.admin_editar_url_enlace(img, 'https://img.example.test/botella-2.jpg');
  if (select url from public.imagenes where id = 'e1000000-0000-4000-8000-000000000031')
       <> 'https://img.example.test/botella-2.jpg'
     or (select estado_enlace from public.imagenes where id = 'e1000000-0000-4000-8000-000000000031')
       <> 'sin_comprobar' then
    raise exception 'FALLO (admin): editar la URL de la imagen no la reinicia';
  end if;
end
$$;

reset role;

rollback;
