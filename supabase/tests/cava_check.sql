-- Comprobación de Mi cava (migración 20261116180000_mi_cava).
--
-- Autocontenido: crea dos usuarios, una bodega, dos vinos y una añada de
-- prueba; comprueba aislamiento entre usuarios, anon, restricciones, el set
-- null al borrar un vino y el traspaso en la fusión. Todo con rollback.
-- Cualquier fallo lanza una excepción con el prefijo "FALLO".
-- Ejecutar como `postgres`.

begin;

insert into public.invitaciones (email, rol) values
  ('cava-a@example.test', 'user'), ('cava-b@example.test', 'admin');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'cava-a@example.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'cava-b@example.test');

insert into public.bodegas (id, nombre, slug) values
  ('40000000-0000-4000-8000-0000000000c1', 'Bodega Cava', 'cava-bodega');

insert into public.vinos (id, bodega_id, nombre, slug, tipo) values
  ('60000000-0000-4000-8000-0000000000c1', '40000000-0000-4000-8000-0000000000c1', 'Vino Cava', 'cava-vino', 'tinto'),
  ('60000000-0000-4000-8000-0000000000c2', '40000000-0000-4000-8000-0000000000c1', 'Vino Cava 2', 'cava-vino-2', 'tinto'),
  ('60000000-0000-4000-8000-0000000000c3', '40000000-0000-4000-8000-0000000000c1', 'Vino Cava 3', 'cava-vino-3', 'tinto');

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.cava'::regclass) then
    raise exception 'FALLO: RLS desactivada en cava';
  end if;
  if has_table_privilege('anon', 'public.cava', 'select') then
    raise exception 'FALLO: anon tiene privilegios sobre cava';
  end if;
  -- Restricciones.
  begin
    insert into public.cava (usuario_id, nombre, cantidad)
    values ('00000000-0000-4000-8000-0000000000c1', 'X', -1);
    raise exception 'FALLO: cantidad negativa aceptada';
  exception when check_violation then null;
  end;
  begin
    insert into public.cava (usuario_id, nombre) values ('00000000-0000-4000-8000-0000000000c1', '  ');
    raise exception 'FALLO: nombre vacío aceptado';
  exception when check_violation then null;
  end;
  begin
    insert into public.cava (usuario_id, nombre, beber_desde, beber_hasta)
    values ('00000000-0000-4000-8000-0000000000c1', 'X', 2030, 2025);
    raise exception 'FALLO: ventana de consumo invertida aceptada';
  exception when check_violation then null;
  end;
end
$$;

-- Usuario A crea un lote (usuario_id por defecto = auth.uid()).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);

insert into public.cava (vino_id, nombre, bodega_nombre, anio, cantidad)
values ('60000000-0000-4000-8000-0000000000c1', 'Vino Cava', 'Bodega Cava', 2019, 3);
insert into public.cava (nombre, bodega_nombre, cantidad) values ('Vino fuera de catálogo', 'Otra', 1);

do $$
begin
  if (select count(*) from public.cava) <> 2 then
    raise exception 'FALLO: A no ve sus 2 lotes';
  end if;
  -- Con vino enlazado, la bodega es la del vino (20261127140000_cava_bodega).
  if (select bodega_id from public.cava where vino_id is not null)
     is distinct from '40000000-0000-4000-8000-0000000000c1' then
    raise exception 'FALLO: el lote con vino no hereda la bodega del vino';
  end if;
  begin
    insert into public.cava (usuario_id, nombre) values ('00000000-0000-4000-8000-0000000000c2', 'Ajeno');
    raise exception 'FALLO: A ha creado un lote a nombre de B';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Usuario B no ve, no edita y no borra lo de A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
do $$
declare n integer;
begin
  if (select count(*) from public.cava) <> 0 then
    raise exception 'FALLO: B ve lotes de A';
  end if;
  update public.cava set cantidad = 99;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: B ha editado lotes de A'; end if;
  delete from public.cava;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: B ha borrado lotes de A'; end if;
end
$$;

reset role;

-- Fusión (como admin B): el lote pasa del vino c1 al c2.
update public.perfiles set rol = 'admin' where id = '00000000-0000-4000-8000-0000000000c2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
select public._fusion_mover_personales('vino', '60000000-0000-4000-8000-0000000000c1', '60000000-0000-4000-8000-0000000000c2');
reset role;

do $$
begin
  if not exists (select 1 from public.cava where vino_id = '60000000-0000-4000-8000-0000000000c2') then
    raise exception 'FALLO: la fusión no ha traspasado el lote de la cava';
  end if;
  -- Borrar el vino deja el lote con su nombre guardado.
  delete from public.vinos where id = '60000000-0000-4000-8000-0000000000c2';
  if not exists (select 1 from public.cava where vino_id is null and nombre = 'Vino Cava' and cantidad = 3) then
    raise exception 'FALLO: el lote no sobrevive al borrado del vino';
  end if;
  -- Borrar la bodega deja el lote sin enlace pero con su texto.
  delete from public.vinos where bodega_id = '40000000-0000-4000-8000-0000000000c1';
  delete from public.bodegas where id = '40000000-0000-4000-8000-0000000000c1';
  if not exists (select 1 from public.cava where bodega_id is null and bodega_nombre = 'Bodega Cava') then
    raise exception 'FALLO: el lote no sobrevive al borrado de la bodega';
  end if;
  raise notice 'OK: cava_check';
end
$$;

rollback;
