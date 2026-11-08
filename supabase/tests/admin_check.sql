-- Comprobación del panel de admin (migración 20261109100000_admin): guardián
-- del último admin, listado de usuarios y guardado atómico de relaciones.
--
-- Autocontenido: crea usuarios y datos de prueba y lo deshace todo con
-- rollback. Cualquier fallo lanza una excepción con el prefijo "FALLO".
--
-- Ejecutar como `postgres` (necesita insertar en auth.users y hacer
-- `set role authenticated`).

begin;

-- =====================================================================
-- 1. Datos de prueba (como postgres)
-- =====================================================================
-- Usuarios: …0021 admin A, …0022 admin B, …0023 usuario normal.

insert into public.invitaciones (email, rol) values
  ('admin-a@example.test', 'admin'),
  ('admin-b@example.test', 'admin'),
  ('admin-usuario@example.test', 'user');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000021', 'admin-a@example.test'),
  ('00000000-0000-4000-8000-000000000022', 'admin-b@example.test'),
  ('00000000-0000-4000-8000-000000000023', 'admin-usuario@example.test');

-- Independiente de la base: los admins que ya hubiera pasan a user (se deshace
-- con el rollback). Quedan exactamente A y B.
update public.perfiles set rol = 'user'
where rol = 'admin'
  and id not in ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000022');

insert into public.denominaciones (id, nombre, slug, tipo) values
  ('d0000000-0000-4000-8000-000000000001', 'D.O. Admin Uno', 'admin-check-uno', 'do'),
  ('d0000000-0000-4000-8000-000000000002', 'D.O. Admin Dos', 'admin-check-dos', 'do');
insert into public.variedades_uva (id, nombre, slug) values
  ('e0000000-0000-4000-8000-000000000001', 'Uva Admin Uno', 'admin-check-uva-uno'),
  ('e0000000-0000-4000-8000-000000000002', 'Uva Admin Dos', 'admin-check-uva-dos');
insert into public.bodegas (id, nombre, slug) values
  ('b0000000-0000-4000-8000-000000000021', 'Bodega Admin', 'admin-check-bodega');
insert into public.vinos (id, bodega_id, nombre, slug, tipo) values
  ('c0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000021',
   'Vino Admin', 'admin-check-vino', 'tinto');
insert into public.anadas (id, vino_id, anio) values
  ('f0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000021', 2020);

-- =====================================================================
-- 2. Permisos de las funciones
-- =====================================================================

do $$
begin
  if has_function_privilege('anon', 'public.admin_listar_usuarios()', 'execute')
     or has_function_privilege('anon', 'public.admin_guardar_denominaciones_bodega(uuid, uuid[], uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_guardar_variedades_anada(uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.proteger_ultimo_admin()', 'execute') then
    raise exception 'FALLO: anon puede ejecutar funciones de admin';
  end if;
end
$$;

-- =====================================================================
-- 3. Usuario normal: ni lista usuarios ni guarda relaciones
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000023", "role": "authenticated"}';

do $$
begin
  begin
    perform * from public.admin_listar_usuarios();
    raise exception 'FALLO (usuario): ha podido listar usuarios';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_guardar_denominaciones_bodega(
      'b0000000-0000-4000-8000-000000000021',
      array['d0000000-0000-4000-8000-000000000001']::uuid[]);
    raise exception 'FALLO (usuario): ha podido guardar D.O. de una bodega';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_guardar_variedades_anada(
      'f0000000-0000-4000-8000-000000000021',
      '[{"variedad_id": "e0000000-0000-4000-8000-000000000001", "porcentaje": 100}]');
    raise exception 'FALLO (usuario): ha podido guardar uvas de una añada';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- =====================================================================
-- 4. Admin A: listado y relaciones
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000021", "role": "authenticated"}';

do $$
declare
  n integer;
begin
  select count(*) into n from public.admin_listar_usuarios()
  where email in ('admin-a@example.test', 'admin-b@example.test', 'admin-usuario@example.test');
  if n <> 3 then
    raise exception 'FALLO (admin): el listado de usuarios no trae los 3 de prueba (%)', n;
  end if;
  if (select rol from public.admin_listar_usuarios() where email = 'admin-usuario@example.test') <> 'user' then
    raise exception 'FALLO (admin): rol incorrecto en el listado';
  end if;

  -- D.O.: alta con principal, cambio de principal y baja.
  perform public.admin_guardar_denominaciones_bodega(
    'b0000000-0000-4000-8000-000000000021',
    array['d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002']::uuid[],
    'd0000000-0000-4000-8000-000000000001');
  if (select count(*) from public.bodega_denominaciones
      where bodega_id = 'b0000000-0000-4000-8000-000000000021') <> 2
     or (select denominacion_id from public.bodega_denominaciones
         where bodega_id = 'b0000000-0000-4000-8000-000000000021' and principal)
        <> 'd0000000-0000-4000-8000-000000000001' then
    raise exception 'FALLO (admin): D.O. de la bodega mal guardadas';
  end if;

  perform public.admin_guardar_denominaciones_bodega(
    'b0000000-0000-4000-8000-000000000021',
    array['d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002']::uuid[],
    'd0000000-0000-4000-8000-000000000002');
  if (select denominacion_id from public.bodega_denominaciones
      where bodega_id = 'b0000000-0000-4000-8000-000000000021' and principal)
     <> 'd0000000-0000-4000-8000-000000000002' then
    raise exception 'FALLO (admin): no se cambió la D.O. principal';
  end if;

  perform public.admin_guardar_denominaciones_bodega(
    'b0000000-0000-4000-8000-000000000021',
    array['d0000000-0000-4000-8000-000000000001']::uuid[]);
  if (select count(*) from public.bodega_denominaciones
      where bodega_id = 'b0000000-0000-4000-8000-000000000021') <> 1
     or exists (select 1 from public.bodega_denominaciones
                where bodega_id = 'b0000000-0000-4000-8000-000000000021' and principal) then
    raise exception 'FALLO (admin): no se quitaron la D.O. sobrante o la principal';
  end if;

  begin
    perform public.admin_guardar_denominaciones_bodega(
      'b0000000-0000-4000-8000-000000000021',
      array['d0000000-0000-4000-8000-000000000001']::uuid[],
      'd0000000-0000-4000-8000-000000000002');
    raise exception 'FALLO (admin): se aceptó una principal que no está en la lista';
  exception when invalid_parameter_value then null;
  end;

  -- Uvas: alta, suma > 100 rechazada sin tocar nada, y baja.
  perform public.admin_guardar_variedades_anada(
    'f0000000-0000-4000-8000-000000000021',
    '[{"variedad_id": "e0000000-0000-4000-8000-000000000001", "porcentaje": 80},
      {"variedad_id": "e0000000-0000-4000-8000-000000000002", "porcentaje": null}]');
  if (select count(*) from public.anada_variedades
      where anada_id = 'f0000000-0000-4000-8000-000000000021') <> 2 then
    raise exception 'FALLO (admin): uvas de la añada mal guardadas';
  end if;

  begin
    perform public.admin_guardar_variedades_anada(
      'f0000000-0000-4000-8000-000000000021',
      '[{"variedad_id": "e0000000-0000-4000-8000-000000000001", "porcentaje": 80},
        {"variedad_id": "e0000000-0000-4000-8000-000000000002", "porcentaje": 40}]');
    raise exception 'FALLO (admin): se aceptó una composición de más del 100 %%';
  exception when invalid_parameter_value then null;
  end;

  perform public.admin_guardar_variedades_anada(
    'f0000000-0000-4000-8000-000000000021',
    '[{"variedad_id": "e0000000-0000-4000-8000-000000000002", "porcentaje": 100}]');
  if (select count(*) from public.anada_variedades
      where anada_id = 'f0000000-0000-4000-8000-000000000021') <> 1
     or (select porcentaje from public.anada_variedades
         where anada_id = 'f0000000-0000-4000-8000-000000000021') <> 100 then
    raise exception 'FALLO (admin): no se reemplazaron las uvas de la añada';
  end if;

  -- Último admin: A quita el rol a B (quedan admins) y luego no puede quitárselo a sí mismo.
  update public.perfiles set rol = 'user' where id = '00000000-0000-4000-8000-000000000022';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALLO (admin): no ha podido quitar el rol a otro admin';
  end if;

  begin
    update public.perfiles set rol = 'user' where id = '00000000-0000-4000-8000-000000000021';
    raise exception 'FALLO (admin): el último admin se ha quitado el rol';
  exception when raise_exception then
    if sqlerrm not like 'ultimo_admin%' then raise; end if;
  end;

  -- Editar otros campos del último admin sí se puede.
  update public.perfiles set nombre = 'Admin A' where id = '00000000-0000-4000-8000-000000000021';
end
$$;

reset role;

-- =====================================================================
-- 5. Borrado en cascada desde auth.users (como postgres)
-- =====================================================================

do $$
begin
  begin
    delete from auth.users where id = '00000000-0000-4000-8000-000000000021';
    raise exception 'FALLO: se ha borrado el usuario del último admin';
  exception when raise_exception then
    if sqlerrm not like 'ultimo_admin%' then raise; end if;
  end;

  update public.perfiles set rol = 'admin' where id = '00000000-0000-4000-8000-000000000022';
  delete from auth.users where id = '00000000-0000-4000-8000-000000000021';
  if exists (select 1 from public.perfiles where id = '00000000-0000-4000-8000-000000000021') then
    raise exception 'FALLO: el perfil no se borró en cascada';
  end if;

  -- Un usuario normal se borra sin problema.
  delete from auth.users where id = '00000000-0000-4000-8000-000000000023';
  if (select count(*) from public.perfiles where rol = 'admin') <> 1 then
    raise exception 'FALLO: número de admins inesperado al final';
  end if;
end
$$;

rollback;
