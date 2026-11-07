-- Comprobación de las políticas RLS base (migración 20261107170000_catalogo_inicial).
--
-- Autocontenido: crea usuarios y datos de prueba, comprueba qué pueden hacer
-- anon, un usuario normal y un admin, y lo deshace todo con rollback.
-- Cualquier fallo lanza una excepción con el prefijo "FALLO".
--
-- Ejecutar como `postgres` (necesita insertar en auth.users y hacer
-- `set role anon/authenticated`).

begin;

-- =====================================================================
-- 0. RLS activada en todas las tablas de public
-- =====================================================================

do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  loop
    raise exception 'FALLO: RLS desactivada en public.%', r.relname;
  end loop;
end
$$;

-- =====================================================================
-- 1. Datos de prueba (como postgres)
-- =====================================================================
-- Usuarios:
--   …0001 usuario normal   …0002 otro usuario normal   …0003 admin

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'rls-usuario@example.test',
   '{"nombre": " Usuaria ", "mayor_de_edad_confirmado": true, "idioma": "en"}'),
  -- Metadatos inválidos o maliciosos: no deben romper el registro ni dar rol.
  ('00000000-0000-4000-8000-000000000002', 'rls-otro@example.test',
   '{"idioma": "xx", "mayor_de_edad_confirmado": "si", "rol": "admin"}'),
  ('00000000-0000-4000-8000-000000000003', 'rls-admin@example.test', null);

do $$
declare
  p public.perfiles;
begin
  select * into p from public.perfiles where id = '00000000-0000-4000-8000-000000000001';
  if not found then
    raise exception 'FALLO: el trigger no creó el perfil al registrarse';
  end if;
  if p.nombre is distinct from 'Usuaria' or not p.mayor_de_edad_confirmado
     or p.idioma <> 'en' or p.rol <> 'user' or p.tema <> 'sistema' then
    raise exception 'FALLO: perfil 1 mal inicializado: %', row_to_json(p);
  end if;

  select * into p from public.perfiles where id = '00000000-0000-4000-8000-000000000002';
  if p.nombre is not null or p.mayor_de_edad_confirmado or p.idioma <> 'es' or p.rol <> 'user' then
    raise exception 'FALLO: perfil 2 mal inicializado (metadatos inválidos): %', row_to_json(p);
  end if;

  if not exists (select 1 from public.perfiles where id = '00000000-0000-4000-8000-000000000003') then
    raise exception 'FALLO: perfil 3 no creado con metadatos nulos';
  end if;
end
$$;

update public.perfiles set rol = 'admin' where id = '00000000-0000-4000-8000-000000000003';

insert into public.fuentes (id, nombre, slug, tipo, url_base) values
  ('10000000-0000-4000-8000-000000000001', 'Fuente RLS', 'rls-fuente', 'tienda',
   'https://example.test');

insert into public.denominaciones (id, nombre, slug, tipo) values
  ('20000000-0000-4000-8000-000000000001', 'D.O. RLS', 'rls-do', 'do');

insert into public.variedades_uva (id, nombre, slug, color) values
  ('30000000-0000-4000-8000-000000000001', 'Uva RLS', 'rls-uva', 'tinta');

insert into public.bodegas (id, nombre, slug, ubicacion, fuente_id) values
  ('40000000-0000-4000-8000-000000000001', 'Bodega RLS', 'rls-bodega',
   'SRID=4326;POINT(-3.69 41.63)'::extensions.geography,
   '10000000-0000-4000-8000-000000000001');

insert into public.bodega_denominaciones (bodega_id, denominacion_id, principal) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true);

insert into public.servicios_bodega (id, bodega_id, tipo, titulo) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   'visita', 'Visita RLS');

insert into public.vinos (id, bodega_id, nombre, slug, tipo, crianza, denominacion_id) values
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   'Vino RLS', 'rls-vino', 'tinto', 'crianza', '20000000-0000-4000-8000-000000000001');

insert into public.anadas (id, vino_id, anio) values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 2020),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', null);

insert into public.anada_variedades (anada_id, variedad_id, porcentaje) values
  ('70000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 100);

insert into public.imagenes (id, vino_id, url, tipo, principal) values
  ('80000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
   'https://example.test/botella.jpg', 'botella', true);

insert into public.ejecuciones_scraper (fuente_id) values
  ('10000000-0000-4000-8000-000000000001');

insert into public.registros_fuente (fuente_id, id_externo, datos, entidad_tipo, entidad_id) values
  ('10000000-0000-4000-8000-000000000001', 'rls-1', '{"nombre": "Vino RLS"}',
   'vino', '60000000-0000-4000-8000-000000000001');

insert into public.comprobaciones_enlace (url, entidad_tipo, entidad_id) values
  ('https://example.test/botella.jpg', 'imagen', '80000000-0000-4000-8000-000000000001');

-- Restricciones del esquema.
do $$
begin
  begin
    insert into public.anadas (vino_id, anio)
    values ('60000000-0000-4000-8000-000000000001', null);
    raise exception 'FALLO: se permitió una segunda fila "sin añada" para el mismo vino';
  exception when unique_violation then null;
  end;

  begin
    insert into public.imagenes (bodega_id, vino_id, url, tipo)
    values ('40000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
            'https://example.test/x.jpg', 'otra');
    raise exception 'FALLO: se permitió una imagen asociada a dos entidades';
  exception when check_violation then null;
  end;

  begin
    insert into public.bodegas (nombre, slug) values ('Slug malo', 'Slug Malo');
    raise exception 'FALLO: se permitió un slug con mayúsculas y espacios';
  exception when check_violation then null;
  end;
end
$$;

-- =====================================================================
-- 2. anon
-- =====================================================================

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

do $$
declare
  s text;
  n int;
begin
  if public.is_admin() then
    raise exception 'FALLO (anon): is_admin() devuelve true';
  end if;

  if (select count(*) from public.bodegas where slug = 'rls-bodega') <> 1
     or (select count(*) from public.vinos where slug = 'rls-vino') <> 1
     or (select count(*) from public.anadas where vino_id = '60000000-0000-4000-8000-000000000001') <> 2
     or (select count(*) from public.anada_variedades) < 1
     or (select count(*) from public.bodega_denominaciones) < 1
     or (select count(*) from public.servicios_bodega) < 1
     or (select count(*) from public.denominaciones where slug = 'rls-do') <> 1
     or (select count(*) from public.variedades_uva where slug = 'rls-uva') <> 1
     or (select count(*) from public.imagenes where id = '80000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.fuentes where slug = 'rls-fuente') <> 1 then
    raise exception 'FALLO (anon): no puede leer el catálogo';
  end if;

  -- Escrituras en catálogo: denegadas o sin filas afectadas.
  foreach s in array array[
    $q$insert into public.bodegas (nombre, slug) values ('Anon', 'rls-anon')$q$,
    $q$update public.vinos set nombre = 'x' where slug = 'rls-vino'$q$,
    $q$delete from public.anadas where vino_id = '60000000-0000-4000-8000-000000000001'$q$,
    $q$insert into public.fuentes (nombre, slug, tipo, url_base) values ('x', 'rls-x', 'otra', 'https://x.test')$q$,
    $q$delete from public.imagenes$q$
  ] loop
    begin
      execute s;
      get diagnostics n = row_count;
      if n > 0 then
        raise exception 'FALLO (anon): "%" afectó % filas', s, n;
      end if;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- Tablas sin acceso para anon: deben dar permiso denegado.
  foreach s in array array[
    'select 1 from public.perfiles',
    'select 1 from public.ejecuciones_scraper',
    'select 1 from public.registros_fuente',
    'select 1 from public.comprobaciones_enlace'
  ] loop
    begin
      execute s;
      raise exception 'FALLO (anon): "%" no dio permiso denegado', s;
    exception when insufficient_privilege then null;
    end;
  end loop;
end
$$;

reset role;

-- =====================================================================
-- 3. Usuario normal
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';

do $$
declare
  s text;
  n int;
begin
  if public.is_admin() then
    raise exception 'FALLO (usuario): is_admin() devuelve true';
  end if;

  if (select count(*) from public.vinos where slug = 'rls-vino') <> 1
     or (select count(*) from public.fuentes where slug = 'rls-fuente') <> 1 then
    raise exception 'FALLO (usuario): no puede leer el catálogo';
  end if;

  foreach s in array array[
    $q$insert into public.bodegas (nombre, slug) values ('Usuario', 'rls-usuario')$q$,
    $q$update public.vinos set nombre = 'x' where slug = 'rls-vino'$q$,
    $q$delete from public.anada_variedades$q$,
    $q$update public.fuentes set activa = false$q$,
    $q$insert into public.ejecuciones_scraper (fuente_id) values ('10000000-0000-4000-8000-000000000001')$q$,
    $q$update public.registros_fuente set estado_emparejamiento = 'descartado'$q$,
    $q$delete from public.comprobaciones_enlace$q$,
    -- Perfil ajeno.
    $q$update public.perfiles set tema = 'claro' where id = '00000000-0000-4000-8000-000000000002'$q$
  ] loop
    begin
      execute s;
      get diagnostics n = row_count;
      if n > 0 then
        raise exception 'FALLO (usuario): "%" afectó % filas', s, n;
      end if;
    exception when insufficient_privilege then null;
    end;
  end loop;

  if (select count(*) from public.ejecuciones_scraper) <> 0
     or (select count(*) from public.registros_fuente) <> 0
     or (select count(*) from public.comprobaciones_enlace) <> 0 then
    raise exception 'FALLO (usuario): ve tablas de operación de scrapers';
  end if;

  -- Perfiles: solo el suyo.
  if (select count(*) from public.perfiles) <> 1
     or not exists (select 1 from public.perfiles where id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'FALLO (usuario): ve perfiles ajenos o no ve el suyo';
  end if;

  update public.perfiles set tema = 'oscuro', prefs_email = '{"novedades": true}'
  where id = '00000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALLO (usuario): no puede editar su perfil';
  end if;

  begin
    update public.perfiles set rol = 'admin' where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'FALLO (usuario): ha podido cambiarse el rol';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.perfiles (id) values ('00000000-0000-4000-8000-000000000009');
    raise exception 'FALLO (usuario): ha podido insertar un perfil';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.perfiles where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'FALLO (usuario): ha podido borrar su perfil';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

do $$
begin
  if (select rol from public.perfiles where id = '00000000-0000-4000-8000-000000000001') <> 'user'
     or (select tema from public.perfiles where id = '00000000-0000-4000-8000-000000000001') <> 'oscuro'
     or (select tema from public.perfiles where id = '00000000-0000-4000-8000-000000000002') <> 'sistema' then
    raise exception 'FALLO: estado de perfiles inesperado tras las pruebas de usuario';
  end if;
  if (select count(*) from public.bodegas where slug in ('rls-anon', 'rls-usuario')) <> 0
     or (select nombre from public.vinos where slug = 'rls-vino') <> 'Vino RLS'
     or (select count(*) from public.anadas where vino_id = '60000000-0000-4000-8000-000000000001') <> 2
     or (select count(*) from public.imagenes where id = '80000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.ejecuciones_scraper where fuente_id = '10000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALLO: anon o usuario han modificado datos';
  end if;
end
$$;

-- =====================================================================
-- 4. Admin
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';

do $$
declare
  s text;
  n int;
begin
  if not public.is_admin() then
    raise exception 'FALLO (admin): is_admin() devuelve false';
  end if;

  foreach s in array array[
    $q$insert into public.bodegas (nombre, slug) values ('Admin', 'rls-admin')$q$,
    $q$update public.vinos set descripcion = 'Editado por admin' where slug = 'rls-vino'$q$,
    $q$delete from public.anada_variedades where anada_id = '70000000-0000-4000-8000-000000000001'$q$,
    $q$update public.fuentes set activa = false where slug = 'rls-fuente'$q$,
    $q$insert into public.ejecuciones_scraper (fuente_id) values ('10000000-0000-4000-8000-000000000001')$q$,
    $q$update public.registros_fuente set estado_emparejamiento = 'emparejado' where id_externo = 'rls-1'$q$,
    $q$update public.comprobaciones_enlace set oculto = true where entidad_id = '80000000-0000-4000-8000-000000000001'$q$,
    $q$update public.perfiles set rol = 'admin' where id = '00000000-0000-4000-8000-000000000002'$q$
  ] loop
    execute s;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'FALLO (admin): "%" afectó % filas (se esperaba 1)', s, n;
    end if;
  end loop;

  if (select count(*) from public.ejecuciones_scraper where fuente_id = '10000000-0000-4000-8000-000000000001') <> 2
     or (select count(*) from public.registros_fuente where id_externo = 'rls-1') <> 1 then
    raise exception 'FALLO (admin): no puede leer la operación de scrapers';
  end if;

  if (select count(*) from public.perfiles
      where id in ('00000000-0000-4000-8000-000000000001',
                   '00000000-0000-4000-8000-000000000002',
                   '00000000-0000-4000-8000-000000000003')) <> 3 then
    raise exception 'FALLO (admin): no ve todos los perfiles';
  end if;
end
$$;

reset role;

do $$
begin
  if (select rol from public.perfiles where id = '00000000-0000-4000-8000-000000000002') <> 'admin' then
    raise exception 'FALLO: el admin no pudo cambiar el rol de otro usuario';
  end if;
  if (select descripcion from public.vinos where slug = 'rls-vino') <> 'Editado por admin'
     or (select count(*) from public.anada_variedades
         where anada_id = '70000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALLO: los cambios del admin no se han guardado';
  end if;
end
$$;

select 'rls_check OK' as resultado;

rollback;
