-- Comprobación de favoritos y notas (migración 20261109090000_espacio_personal).
--
-- Autocontenido: crea dos usuarios y un vino, una añada y una bodega de
-- prueba, comprueba aislamiento entre usuarios, anon, restricciones y
-- cascadas, y lo deshace todo con rollback.
-- Cualquier fallo lanza una excepción con el prefijo "FALLO".
--
-- Ejecutar como `postgres` (necesita insertar en auth.users y hacer
-- `set role anon/authenticated`).

begin;

-- =====================================================================
-- 1. Datos de prueba (como postgres)
-- =====================================================================
-- Usuarios: …0a1 usuario A, …0a2 usuario B

insert into public.invitaciones (email, rol) values
  ('ep-a@example.test', 'user'),
  ('ep-b@example.test', 'user');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'ep-a@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'ep-b@example.test');

insert into public.bodegas (id, nombre, slug, ubicacion) values
  ('40000000-0000-4000-8000-0000000000e1', 'Bodega EP', 'ep-bodega',
   'SRID=4326;POINT(-3.69 41.63)'::extensions.geography),
  ('40000000-0000-4000-8000-0000000000e2', 'Bodega EP 2', 'ep-bodega-2',
   'SRID=4326;POINT(-3.69 41.63)'::extensions.geography);

insert into public.vinos (id, bodega_id, nombre, slug, tipo) values
  ('60000000-0000-4000-8000-0000000000e1', '40000000-0000-4000-8000-0000000000e1',
   'Vino EP', 'ep-vino', 'tinto');

insert into public.anadas (id, vino_id, anio) values
  ('70000000-0000-4000-8000-0000000000e1', '60000000-0000-4000-8000-0000000000e1', 2020);

-- RLS activada y anon sin privilegios.
do $$
begin
  if exists (select 1 from pg_class where oid in ('public.favoritos'::regclass, 'public.notas'::regclass)
             and not relrowsecurity) then
    raise exception 'FALLO: RLS desactivada en favoritos o notas';
  end if;
  if has_table_privilege('anon', 'public.favoritos', 'select')
     or has_table_privilege('anon', 'public.notas', 'select') then
    raise exception 'FALLO: anon tiene privilegios sobre favoritos o notas';
  end if;
end
$$;

-- =====================================================================
-- 2. Restricciones del esquema (como postgres)
-- =====================================================================

do $$
begin
  -- Exactamente una entidad.
  begin
    insert into public.favoritos (usuario_id) values ('00000000-0000-4000-8000-0000000000a1');
    raise exception 'FALLO: favorito sin entidad';
  exception when check_violation then null;
  end;
  begin
    insert into public.favoritos (usuario_id, vino_id, bodega_id) values
      ('00000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000e1',
       '40000000-0000-4000-8000-0000000000e1');
    raise exception 'FALLO: favorito con dos entidades';
  exception when check_violation then null;
  end;
  begin
    insert into public.notas (usuario_id, texto, vino_id, anada_id) values
      ('00000000-0000-4000-8000-0000000000a1', 'x', '60000000-0000-4000-8000-0000000000e1',
       '70000000-0000-4000-8000-0000000000e1');
    raise exception 'FALLO: nota con dos entidades';
  exception when check_violation then null;
  end;
  begin
    insert into public.notas (usuario_id, texto) values
      ('00000000-0000-4000-8000-0000000000a1', 'x');
    raise exception 'FALLO: nota sin entidad';
  exception when check_violation then null;
  end;

  -- Texto vacío o demasiado largo.
  begin
    insert into public.notas (usuario_id, texto, vino_id) values
      ('00000000-0000-4000-8000-0000000000a1', '   ', '60000000-0000-4000-8000-0000000000e1');
    raise exception 'FALLO: nota con texto en blanco';
  exception when check_violation then null;
  end;
  begin
    insert into public.notas (usuario_id, texto, vino_id) values
      ('00000000-0000-4000-8000-0000000000a1', repeat('x', 5001),
       '60000000-0000-4000-8000-0000000000e1');
    raise exception 'FALLO: nota de más de 5000 caracteres';
  exception when check_violation then null;
  end;

  -- FK: entidad inexistente.
  begin
    insert into public.favoritos (usuario_id, vino_id) values
      ('00000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000ff');
    raise exception 'FALLO: favorito de un vino inexistente';
  exception when foreign_key_violation then null;
  end;
end
$$;

-- Unicidad por usuario y entidad.
insert into public.favoritos (usuario_id, vino_id) values
  ('00000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000e1');
insert into public.notas (usuario_id, texto, anada_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'nota añada',
   '70000000-0000-4000-8000-0000000000e1');

do $$
begin
  begin
    insert into public.favoritos (usuario_id, vino_id) values
      ('00000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000e1');
    raise exception 'FALLO: favorito duplicado';
  exception when unique_violation then null;
  end;
  begin
    insert into public.notas (usuario_id, texto, anada_id) values
      ('00000000-0000-4000-8000-0000000000a1', 'otra',
       '70000000-0000-4000-8000-0000000000e1');
    raise exception 'FALLO: segunda nota para la misma añada';
  exception when unique_violation then null;
  end;
end
$$;

delete from public.favoritos;
delete from public.notas;

-- =====================================================================
-- 3. anon: sin acceso
-- =====================================================================

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

do $$
begin
  begin
    perform 1 from public.favoritos;
    raise exception 'FALLO (anon): leyó favoritos';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.notas;
    raise exception 'FALLO (anon): leyó notas';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.favoritos (usuario_id, vino_id) values
      ('00000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000e1');
    raise exception 'FALLO (anon): insertó un favorito';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- =====================================================================
-- 4. Usuario A: crea lo suyo
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';

do $$
declare
  n int;
begin
  insert into public.favoritos (usuario_id, vino_id) values
    ('00000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000e1');
  insert into public.favoritos (usuario_id, bodega_id) values
    ('00000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000e1');

  insert into public.notas (usuario_id, texto, vino_id) values
    ('00000000-0000-4000-8000-0000000000a1', 'nota vino A', '60000000-0000-4000-8000-0000000000e1');
  insert into public.notas (usuario_id, texto, anada_id) values
    ('00000000-0000-4000-8000-0000000000a1', 'nota añada A', '70000000-0000-4000-8000-0000000000e1');

  -- Upsert por SQL: insert … on conflict (columnas de la unicidad) do update
  -- set texto. Necesita insert en las columnas de entidad y update solo sobre
  -- texto. (PostgREST, en cambio, actualiza todas las columnas del payload, por
  -- eso la app hace update + insert.)
  insert into public.notas (usuario_id, vino_id, anada_id, bodega_id, texto) values
    ('00000000-0000-4000-8000-0000000000a1', null, null, '40000000-0000-4000-8000-0000000000e1', 'v1')
  on conflict (usuario_id, vino_id, anada_id, bodega_id) do update set texto = excluded.texto;
  insert into public.notas (usuario_id, vino_id, anada_id, bodega_id, texto) values
    ('00000000-0000-4000-8000-0000000000a1', null, null, '40000000-0000-4000-8000-0000000000e1', 'v2')
  on conflict (usuario_id, vino_id, anada_id, bodega_id) do update set texto = excluded.texto;

  select count(*) into n from public.notas
  where bodega_id = '40000000-0000-4000-8000-0000000000e1';
  if n <> 1 or (select texto from public.notas where bodega_id = '40000000-0000-4000-8000-0000000000e1') <> 'v2' then
    raise exception 'FALLO (A): el upsert de la nota no actualizó la fila existente';
  end if;

  -- Lo mismo para favoritos (on conflict do nothing).
  insert into public.favoritos (usuario_id, vino_id, bodega_id) values
    ('00000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000e1', null)
  on conflict (usuario_id, vino_id, bodega_id) do nothing;
  select count(*) into n from public.favoritos;
  if n <> 2 then
    raise exception 'FALLO (A): esperaba 2 favoritos, hay %', n;
  end if;

  -- No puede crear en nombre de otro.
  begin
    insert into public.favoritos (usuario_id, bodega_id) values
      ('00000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000e2');
    raise exception 'FALLO (A): creó un favorito para B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.notas (usuario_id, texto, bodega_id) values
      ('00000000-0000-4000-8000-0000000000a2', 'x', '40000000-0000-4000-8000-0000000000e2');
    raise exception 'FALLO (A): creó una nota para B';
  exception when insufficient_privilege then null;
  end;

  -- Solo el texto es editable.
  begin
    update public.notas set bodega_id = '40000000-0000-4000-8000-0000000000e2'
    where bodega_id = '40000000-0000-4000-8000-0000000000e1';
    raise exception 'FALLO (A): cambió la entidad de una nota';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.notas set usuario_id = '00000000-0000-4000-8000-0000000000a2';
    raise exception 'FALLO (A): cambió el dueño de una nota';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.favoritos set bodega_id = null;
    raise exception 'FALLO (A): actualizó un favorito';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- El trigger set_updated_at funciona aunque el usuario solo pueda editar texto
-- (dentro de una transacción now() no cambia: se retrasa la fila antes).
update public.notas set updated_at = '2020-01-01' where texto = 'v2';

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
update public.notas set texto = 'v3' where texto = 'v2';
reset role;

do $$
begin
  if (select updated_at from public.notas where texto = 'v3') <= '2020-01-01' then
    raise exception 'FALLO: updated_at no cambió al editar la nota';
  end if;
end
$$;
update public.notas set texto = 'v2' where texto = 'v3';

-- =====================================================================
-- 5. Usuario B: no ve ni toca lo de A
-- =====================================================================

-- B tiene lo suyo, creado como postgres.
insert into public.favoritos (usuario_id, vino_id) values
  ('00000000-0000-4000-8000-0000000000a2', '60000000-0000-4000-8000-0000000000e1');
insert into public.notas (usuario_id, texto, vino_id) values
  ('00000000-0000-4000-8000-0000000000a2', 'nota vino B', '60000000-0000-4000-8000-0000000000e1');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.favoritos;
  if n <> 1 or exists (select 1 from public.favoritos where usuario_id <> '00000000-0000-4000-8000-0000000000a2') then
    raise exception 'FALLO (B): ve favoritos ajenos (% filas)', n;
  end if;
  select count(*) into n from public.notas;
  if n <> 1 or (select texto from public.notas) <> 'nota vino B' then
    raise exception 'FALLO (B): ve notas ajenas (% filas)', n;
  end if;

  update public.notas set texto = 'hackeada' where usuario_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (B): editó notas de A'; end if;

  delete from public.notas where usuario_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (B): borró notas de A'; end if;

  delete from public.favoritos where usuario_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (B): borró favoritos de A'; end if;

  -- Como hace la app (supabase-js no puede hacer un upsert que solo toque
  -- texto): update por entidad y, si no hay fila, insert. B sobre la misma
  -- bodega que A crea su propia nota y no toca la de A.
  update public.notas set texto = 'bodega B'
  where usuario_id = '00000000-0000-4000-8000-0000000000a2'
    and bodega_id = '40000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (B): el update tocó filas inexistentes'; end if;
  insert into public.notas (usuario_id, bodega_id, texto) values
    ('00000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000e1', 'bodega B');
  update public.notas set texto = 'bodega B 2'
  where usuario_id = '00000000-0000-4000-8000-0000000000a2'
    and bodega_id = '40000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (B): no pudo editar su nota'; end if;

  -- B borra lo suyo.
  delete from public.favoritos;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (B): no pudo borrar su favorito'; end if;
end
$$;

reset role;

do $$
begin
  if (select count(*) from public.favoritos where usuario_id = '00000000-0000-4000-8000-0000000000a1') <> 2
     or (select count(*) from public.notas where usuario_id = '00000000-0000-4000-8000-0000000000a1') <> 3
     or (select texto from public.notas
         where usuario_id = '00000000-0000-4000-8000-0000000000a1'
           and bodega_id = '40000000-0000-4000-8000-0000000000e1') <> 'v2' then
    raise exception 'FALLO: los datos de A cambiaron por acciones de B';
  end if;
end
$$;

-- =====================================================================
-- 6. Cascadas
-- =====================================================================

delete from public.anadas where id = '70000000-0000-4000-8000-0000000000e1';
do $$
begin
  if exists (select 1 from public.notas where anada_id is not null) then
    raise exception 'FALLO: las notas de la añada no se borraron en cascada';
  end if;
end
$$;

-- Los vinos de la bodega se borran antes (vinos.bodega_id es restrict).
delete from public.vinos where id = '60000000-0000-4000-8000-0000000000e1';
do $$
begin
  if exists (select 1 from public.favoritos where vino_id is not null)
     or exists (select 1 from public.notas where vino_id is not null) then
    raise exception 'FALLO: favoritos o notas del vino no se borraron en cascada';
  end if;
end
$$;

delete from public.bodegas where id = '40000000-0000-4000-8000-0000000000e1';
do $$
begin
  if exists (select 1 from public.favoritos where bodega_id = '40000000-0000-4000-8000-0000000000e1')
     or exists (select 1 from public.notas where bodega_id = '40000000-0000-4000-8000-0000000000e1') then
    raise exception 'FALLO: favoritos o notas de la bodega no se borraron en cascada';
  end if;
end
$$;

delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
do $$
begin
  if exists (select 1 from public.favoritos where usuario_id = '00000000-0000-4000-8000-0000000000a1')
     or exists (select 1 from public.notas where usuario_id = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'FALLO: favoritos o notas del usuario no se borraron al borrarlo';
  end if;
end
$$;

select 'espacio_personal_check OK' as resultado;

rollback;
