-- Comprobación del registro por invitación y de las tablas de usuario
-- (migración 20261107190000_auth_invitaciones).
--
-- Autocontenido: crea invitaciones y usuarios de prueba, comprueba el alta,
-- el hook y el aislamiento entre usuarios, y lo deshace todo con rollback.
-- Cualquier fallo lanza una excepción con el prefijo "FALLO".
--
-- Ejecutar como `postgres` (necesita insertar en auth.users y hacer
-- `set role anon/authenticated`).

begin;

-- =====================================================================
-- 1. Invitaciones de prueba (como postgres)
-- =====================================================================
-- Usuarios:
--   …0011 usuario A (invitación user, email con mayúsculas y espacios)
--   …0012 usuario B (invitación user)
--   …0013 admin     (invitación admin)

insert into public.invitaciones (id, email, rol, caduca, created_at) values
  ('a0000000-0000-4000-8000-000000000001', '  Auth-A@Example.TEST ', 'user', null, now()),
  ('a0000000-0000-4000-8000-000000000002', 'auth-b@example.test', 'user', now() + interval '1 day', now()),
  ('a0000000-0000-4000-8000-000000000003', 'auth-admin@example.test', 'admin', null, now()),
  ('a0000000-0000-4000-8000-000000000004', 'auth-caducada@example.test', 'admin',
   now() - interval '1 minute', now() - interval '2 days');

do $$
begin
  if (select email from public.invitaciones where id = 'a0000000-0000-4000-8000-000000000001')
     <> 'auth-a@example.test' then
    raise exception 'FALLO: el email de la invitación no se normaliza';
  end if;

  -- Una sola invitación activa por email (también con otra grafía).
  begin
    insert into public.invitaciones (email) values ('AUTH-B@example.test');
    raise exception 'FALLO: se permitieron dos invitaciones activas para el mismo email';
  exception when unique_violation then null;
  end;

  begin
    insert into public.invitaciones (email) values ('no-es-un-email');
    raise exception 'FALLO: se aceptó un email inválido';
  exception when check_violation then null;
  end;
end
$$;

-- =====================================================================
-- 2. Alta sin invitación válida: rechazada
-- =====================================================================

do $$
declare
  e text;
begin
  foreach e in array array[
    'auth-sin-invitacion@example.test',  -- no invitado
    'auth-caducada@example.test'         -- invitación caducada
  ] loop
    begin
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), e, '{"rol": "admin"}');
      raise exception 'FALLO: se permitió el alta de % sin invitación válida', e;
    exception when raise_exception then
      if sqlerrm not like 'invitacion_requerida%' then
        raise exception 'FALLO: error inesperado al rechazar %: %', e, sqlerrm;
      end if;
    end;
  end loop;

  if exists (select 1 from auth.users where email in
             ('auth-sin-invitacion@example.test', 'auth-caducada@example.test'))
     or exists (select 1 from public.invitaciones
                where id = 'a0000000-0000-4000-8000-000000000004' and usada_en is not null) then
    raise exception 'FALLO: un alta rechazada dejó rastro';
  end if;
end
$$;

-- =====================================================================
-- 3. Alta con invitación: perfil con el rol de la invitación
-- =====================================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000011', 'Auth-A@example.test',
   '{"nombre": "A", "mayor_de_edad_confirmado": true, "idioma": "en", "rol": "admin"}'),
  ('00000000-0000-4000-8000-000000000012', 'auth-b@example.test', null),
  ('00000000-0000-4000-8000-000000000013', 'auth-admin@example.test', null);

do $$
declare
  p public.perfiles;
begin
  select * into p from public.perfiles where id = '00000000-0000-4000-8000-000000000011';
  if not found or p.rol <> 'user' or p.nombre is distinct from 'A'
     or not p.mayor_de_edad_confirmado or p.idioma <> 'en' then
    raise exception 'FALLO: perfil A mal creado (o la metadata dio rol): %', row_to_json(p);
  end if;

  if (select rol from public.perfiles where id = '00000000-0000-4000-8000-000000000013')
     is distinct from 'admin' then
    raise exception 'FALLO: la invitación admin no dio rol admin';
  end if;

  if (select count(*) from public.invitaciones
      where id in ('a0000000-0000-4000-8000-000000000001',
                   'a0000000-0000-4000-8000-000000000002',
                   'a0000000-0000-4000-8000-000000000003')
        and usada_en is not null
        and usada_por in ('00000000-0000-4000-8000-000000000011',
                          '00000000-0000-4000-8000-000000000012',
                          '00000000-0000-4000-8000-000000000013')) <> 3 then
    raise exception 'FALLO: las invitaciones no quedaron marcadas como usadas';
  end if;

  -- La invitación ya usada no sirve para otra alta con el mismo email.
  begin
    insert into auth.users (id, email) values (gen_random_uuid(), 'auth-b@example.test');
    raise exception 'FALLO: una invitación usada permitió otra alta';
  exception
    when raise_exception then
      if sqlerrm not like 'invitacion_requerida%' then
        raise exception 'FALLO: error inesperado con invitación usada: %', sqlerrm;
      end if;
    -- auth.users puede tener su propia restricción de email único.
    when unique_violation then null;
  end;

  -- Usada, se puede volver a invitar al mismo email (el índice solo cubre las activas).
  insert into public.invitaciones (email) values ('auth-b@example.test');
end
$$;

-- =====================================================================
-- 4. Hook "Before User Created"
-- =====================================================================

do $$
declare
  r jsonb;
begin
  r := public.hook_antes_de_crear_usuario('{"user": {"email": "AUTH-B@example.test"}}');
  if r <> '{}'::jsonb then
    raise exception 'FALLO (hook): rechazó un email invitado: %', r;
  end if;

  foreach r in array array[
    public.hook_antes_de_crear_usuario('{"user": {"email": "auth-sin-invitacion@example.test"}}'),
    public.hook_antes_de_crear_usuario('{"user": {"email": "auth-caducada@example.test"}}'),
    public.hook_antes_de_crear_usuario('{"user": {}}')
  ] loop
    if r #>> '{error,message}' is distinct from 'invitation_required'
       or (r #>> '{error,http_code}')::int <> 403 then
      raise exception 'FALLO (hook): no rechazó un email sin invitación: %', r;
    end if;
  end loop;
end
$$;

-- Ni anon ni authenticated pueden llamar al hook ni consultar invitaciones por email.
do $$
declare
  rol text;
begin
  foreach rol in array array['anon', 'authenticated'] loop
    if has_function_privilege(rol, 'public.hook_antes_de_crear_usuario(jsonb)', 'execute')
       or has_function_privilege(rol, 'public.invitacion_valida(text)', 'execute')
       or has_function_privilege(rol, 'public.handle_new_user()', 'execute') then
      raise exception 'FALLO: % puede ejecutar funciones internas de registro', rol;
    end if;
  end loop;
end
$$;

-- =====================================================================
-- 5. anon: sin acceso
-- =====================================================================

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

do $$
declare
  s text;
begin
  foreach s in array array[
    'select 1 from public.invitaciones',
    'select 1 from public.preferencias_vino',
    $q$insert into public.invitaciones (email) values ('anon@example.test')$q$
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
-- 6. Usuario A: solo sus preferencias, ninguna invitación
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000011", "role": "authenticated"}';

do $$
declare
  n int;
begin
  insert into public.preferencias_vino (usuario_id, tipos, crianzas, precio_min, precio_max)
  values ('00000000-0000-4000-8000-000000000011', '{tinto,blanco}', '{crianza}', 10, 30);

  begin
    insert into public.preferencias_vino (usuario_id, tipos)
    values ('00000000-0000-4000-8000-000000000012', '{rosado}');
    raise exception 'FALLO (A): ha creado preferencias de otro usuario';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.preferencias_vino set precio_min = 50, precio_max = 20
    where usuario_id = '00000000-0000-4000-8000-000000000011';
    raise exception 'FALLO (A): se aceptó precio_min > precio_max';
  exception when check_violation then null;
  end;

  if (select count(*) from public.invitaciones) <> 0 then
    raise exception 'FALLO (A): ve invitaciones';
  end if;

  begin
    insert into public.invitaciones (email) values ('colado@example.test');
    raise exception 'FALLO (A): ha creado una invitación';
  exception when insufficient_privilege then null;
  end;

  update public.invitaciones set rol = 'admin';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO (A): ha modificado invitaciones';
  end if;
end
$$;

reset role;

-- B crea las suyas (como B).
set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000012", "role": "authenticated"}';

do $$
declare
  n int;
begin
  if (select count(*) from public.preferencias_vino) <> 0 then
    raise exception 'FALLO (B): ve las preferencias de A';
  end if;

  insert into public.preferencias_vino (usuario_id, tipos)
  values ('00000000-0000-4000-8000-000000000012', '{rosado}');

  update public.preferencias_vino set tipos = '{dulce}'
  where usuario_id = '00000000-0000-4000-8000-000000000011';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO (B): ha modificado las preferencias de A';
  end if;

  delete from public.preferencias_vino where usuario_id = '00000000-0000-4000-8000-000000000011';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO (B): ha borrado las preferencias de A';
  end if;

  if (select count(*) from public.preferencias_vino) <> 1 then
    raise exception 'FALLO (B): no ve exactamente las suyas';
  end if;
end
$$;

reset role;

-- =====================================================================
-- 7. Admin: gestiona invitaciones, pero no ve preferencias ajenas
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000013", "role": "authenticated"}';

do $$
declare
  n int;
begin
  if (select count(*) from public.invitaciones where email like 'auth-%') < 4 then
    raise exception 'FALLO (admin): no ve las invitaciones';
  end if;

  insert into public.invitaciones (id, email) values
    ('a0000000-0000-4000-8000-000000000009', 'Nueva@Example.test');
  if (select creada_por from public.invitaciones where id = 'a0000000-0000-4000-8000-000000000009')
     is distinct from '00000000-0000-4000-8000-000000000013' then
    raise exception 'FALLO (admin): creada_por no se rellena con auth.uid()';
  end if;

  update public.invitaciones set caduca = now() + interval '7 days'
  where id = 'a0000000-0000-4000-8000-000000000009';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALLO (admin): no puede actualizar invitaciones';
  end if;

  delete from public.invitaciones where id = 'a0000000-0000-4000-8000-000000000009';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALLO (admin): no puede borrar invitaciones';
  end if;

  if (select count(*) from public.preferencias_vino) <> 0 then
    raise exception 'FALLO (admin): ve preferencias de otros usuarios';
  end if;
end
$$;

reset role;

do $$
begin
  if (select tipos from public.preferencias_vino
      where usuario_id = '00000000-0000-4000-8000-000000000011') <> '{tinto,blanco}'
     or (select count(*) from public.preferencias_vino) <> 2 then
    raise exception 'FALLO: estado de preferencias inesperado al final';
  end if;
end
$$;

select 'auth_check OK' as resultado;

rollback;
