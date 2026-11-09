-- Comprobación del comparador de precios (migración 20261112110000_comparador_precios):
-- historial solo cuando cambia el precio, vino_id derivado de la añada,
-- marcar_ofertas_no_vistas, precio «desde» y filtro/orden de listar_vinos
-- (sin cambios sin los parámetros nuevos), fusión de vinos y bodegas con
-- ofertas y RLS (lectura pública, escritura solo admin y service_role).
--
-- Autocontenido: crea usuarios y datos de prueba y lo deshace todo con
-- rollback. Cualquier fallo lanza una excepción con el prefijo "FALLO".
-- Ejecutar como `postgres`.

begin;

-- =====================================================================
-- 1. Datos de prueba (como postgres)
-- =====================================================================
-- Usuarios: …0041 admin, …0042 usuario normal.

insert into public.invitaciones (email, rol) values
  ('comp-admin@example.test', 'admin'),
  ('comp-user@example.test', 'user');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000041', 'comp-admin@example.test'),
  ('00000000-0000-4000-8000-000000000042', 'comp-user@example.test');

insert into public.bodegas (id, nombre, slug) values
  ('e1000000-0000-4000-8000-000000000001', 'Bodega Comp Origen', 'comp-origen'),
  ('e1000000-0000-4000-8000-000000000002', 'Bodega Comp Destino', 'comp-destino');

-- VO y VD para fundir; VB y VC para el listado.
insert into public.vinos (id, bodega_id, nombre, slug, tipo) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
   'Comp Origen', 'comp-vino-origen', 'tinto'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002',
   'Comp Destino', 'comp-vino-destino', 'tinto'),
  ('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000002',
   'Comp Barato', 'comp-vino-barato', 'blanco'),
  ('e2000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000002',
   'Comp Caro', 'comp-vino-caro', 'blanco');

-- VO: 2019 (solo en origen) y 2020 (coincide con VD 2020).
insert into public.anadas (id, vino_id, anio) values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 2019),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 2020),
  ('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000002', 2020);

-- T1 normal, T2 tienda online de la bodega origen, T3 desactivada.
insert into public.tiendas (id, nombre, slug, web, tipo, bodega_id, activa) values
  ('e4000000-0000-4000-8000-000000000001', 'Tienda Comp', 'comp-tienda', 'https://t1.example.test', 'online', null, true),
  ('e4000000-0000-4000-8000-000000000002', 'Tienda Bodega', 'comp-bodega', 'https://t2.example.test', 'bodega',
   'e1000000-0000-4000-8000-000000000001', true),
  ('e4000000-0000-4000-8000-000000000003', 'Tienda Off', 'comp-off', 'https://t3.example.test', 'online', null, false);

-- =====================================================================
-- 2. Permisos y RLS
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['tiendas', 'ofertas', 'historial_precios'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'FALLO: RLS desactivada en %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'insert')
       or has_table_privilege('anon', 'public.' || t, 'truncate')
       or has_table_privilege('authenticated', 'public.' || t, 'truncate') then
      raise exception 'FALLO: permisos de más en %', t;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.marcar_ofertas_no_vistas(uuid, timestamptz, integer)', 'execute')
     or has_function_privilege('anon', 'public.marcar_ofertas_no_vistas(uuid, timestamptz, integer)', 'execute') then
    raise exception 'FALLO: marcar_ofertas_no_vistas debe ser solo de service_role';
  end if;
  if has_function_privilege('anon', 'public._fusion_mover_ofertas(text, uuid, uuid)', 'execute') then
    raise exception 'FALLO: anon puede ejecutar _fusion_mover_ofertas';
  end if;
end
$$;

-- =====================================================================
-- 3. Ofertas e historial (como service_role, igual que los scrapers)
-- =====================================================================

set local role service_role;

do $$
declare
  o uuid;
  n integer;
begin
  -- vino_id se deriva de la añada aunque llegue otro.
  insert into public.ofertas (id, tienda_id, vino_id, anada_id, id_externo, url, precio, visto_por_ultima_vez)
  values ('e5000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001',
          'e2000000-0000-4000-8000-000000000004', 'e3000000-0000-4000-8000-000000000002',
          'p-2020', 'https://t1.example.test/p-2020', 20, now() - interval '2 days');
  if (select vino_id from public.ofertas where id = 'e5000000-0000-4000-8000-000000000001')
     <> 'e2000000-0000-4000-8000-000000000001' then
    raise exception 'FALLO: vino_id no se deriva de la añada';
  end if;

  o := 'e5000000-0000-4000-8000-000000000001';
  if (select count(*) from public.historial_precios where oferta_id = o and hasta is null and precio = 20) <> 1 then
    raise exception 'FALLO: la oferta nueva no abre tramo de historial';
  end if;

  -- Mismo precio: no hay tramo nuevo.
  update public.ofertas set precio = 20, disponible = false where id = o;
  update public.ofertas set precio = 20.00 where id = o;
  if (select count(*) from public.historial_precios where oferta_id = o) <> 1 then
    raise exception 'FALLO: historial nuevo sin cambio de precio';
  end if;

  -- Cambio de precio: cierra el vigente y abre otro.
  update public.ofertas set precio = 18.5 where id = o;
  select count(*) into n from public.historial_precios where oferta_id = o;
  if n <> 2
     or (select count(*) from public.historial_precios where oferta_id = o and hasta is null) <> 1
     or (select precio from public.historial_precios where oferta_id = o and hasta is null) <> 18.5
     or (select hasta from public.historial_precios where oferta_id = o and precio = 20) is null then
    raise exception 'FALLO: el cambio de precio no deja dos tramos (uno cerrado y el vigente)';
  end if;
  update public.ofertas set precio = 20, disponible = true where id = o;
  if (select count(*) from public.historial_precios where oferta_id = o) <> 3 then
    raise exception 'FALLO: volver a un precio anterior debe abrir otro tramo';
  end if;

  -- Añada inexistente.
  begin
    insert into public.ofertas (tienda_id, vino_id, anada_id, id_externo, url, precio)
    values ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
            'e3000000-0000-4000-8000-0000000000ff', 'x', 'https://t1.example.test/x', 10);
    raise exception 'FALLO: oferta con añada inexistente';
  exception when foreign_key_violation then null;
  end;

  -- Clave (tienda, id_externo) única.
  begin
    insert into public.ofertas (tienda_id, vino_id, id_externo, url, precio)
    values ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002',
            'p-2020', 'https://t1.example.test/otra', 10);
    raise exception 'FALLO: dos ofertas con la misma tienda e id_externo';
  exception when unique_violation then null;
  end;
end
$$;

-- Resto de ofertas de prueba.
insert into public.ofertas (id, tienda_id, vino_id, anada_id, id_externo, url, precio, formato_ml,
                            disponible, visto_por_ultima_vez, oculta_admin) values
  -- VO 2019 en la tienda de la bodega.
  ('e5000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000002',
   'e2000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
   'b-2019', 'https://t2.example.test/2019', 25, 750, true, now(), false),
  -- VO sin añada en T1 y VD sin añada en T1 con la misma URL y formato: colisión al fundir.
  -- La de VO es más reciente: debe ganar y heredar los tramos cerrados de la de VD.
  ('e5000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000001', null,
   'sin-anada-o', 'https://t1.example.test/sin-anada', 30, 750, true, now(), false),
  ('e5000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000002', null,
   'sin-anada-d', 'https://t1.example.test/sin-anada', 33, 750, true, now() - interval '5 days', false),
  -- VD 2020 en T1 (otra URL): convive con la de VO 2020 tras fundir.
  ('e5000000-0000-4000-8000-000000000005', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000003',
   'd-2020', 'https://t1.example.test/d-2020', 22, 750, true, now(), false),
  -- Listado: VB 9 € (y 5 € en mágnum, que no cuenta); VC 40 € visible y 12 € oculta,
  -- no disponible o en tienda desactivada (no cuentan).
  ('e5000000-0000-4000-8000-000000000011', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000003', null, 'vb', 'https://t1.example.test/vb', 9, 750, true, now(), false),
  ('e5000000-0000-4000-8000-000000000012', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000003', null, 'vb-mag', 'https://t1.example.test/vb-mag', 5, 1500, true, now(), false),
  ('e5000000-0000-4000-8000-000000000013', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000004', null, 'vc', 'https://t1.example.test/vc', 40, 750, true, now(), false),
  ('e5000000-0000-4000-8000-000000000014', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000004', null, 'vc-oculta', 'https://t1.example.test/vc-o', 12, 750, true, now(), true),
  ('e5000000-0000-4000-8000-000000000015', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000004', null, 'vc-agotada', 'https://t1.example.test/vc-a', 12, 750, false, now(), false),
  ('e5000000-0000-4000-8000-000000000016', 'e4000000-0000-4000-8000-000000000003',
   'e2000000-0000-4000-8000-000000000004', null, 'vc-off', 'https://t3.example.test/vc', 12, 750, true, now(), false);

-- Tramo cerrado antiguo en la oferta de VD sin añada (para comprobar que se une).
insert into public.historial_precios (oferta_id, precio, desde, hasta) values
  ('e5000000-0000-4000-8000-000000000004', 35, now() - interval '30 days', now() - interval '20 days');

-- 3.1 marcar_ofertas_no_vistas: la oferta p-2020 (vista hace 2 días) suma ejecuciones.
do $$
declare
  n integer;
  o uuid := 'e5000000-0000-4000-8000-000000000001';
begin
  n := public.marcar_ofertas_no_vistas('e4000000-0000-4000-8000-000000000001', now() - interval '1 day', 2);
  if n <> 0 or (select ejecuciones_sin_ver from public.ofertas where id = o) <> 1
     or not (select disponible from public.ofertas where id = o) then
    raise exception 'FALLO: primera ejecución sin ver no debe quitar la disponibilidad';
  end if;
  if (select ejecuciones_sin_ver from public.ofertas where id = 'e5000000-0000-4000-8000-000000000011') <> 0 then
    raise exception 'FALLO: una oferta vista no debe sumar ejecuciones sin ver';
  end if;
  -- p-2020 y sin-anada-d (vista hace 5 días) llegan al umbral a la vez.
  n := public.marcar_ofertas_no_vistas('e4000000-0000-4000-8000-000000000001', now() - interval '1 day', 2);
  if n <> 2 or (select disponible from public.ofertas where id = o) then
    raise exception 'FALLO: al llegar al umbral la oferta debe pasar a no disponible (n=%)', n;
  end if;
  n := public.marcar_ofertas_no_vistas('e4000000-0000-4000-8000-000000000001', now() - interval '1 day', 2);
  if n <> 0 then
    raise exception 'FALLO: una oferta ya no disponible no se vuelve a contar';
  end if;
  -- Otra tienda no se toca.
  if (select ejecuciones_sin_ver from public.ofertas where id = 'e5000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FALLO: marcar_ofertas_no_vistas tocó otra tienda';
  end if;
  update public.ofertas set disponible = true, ejecuciones_sin_ver = 0
  where id in (o, 'e5000000-0000-4000-8000-000000000004');
end
$$;

reset role;

-- =====================================================================
-- 4. Precio «desde» y listar_vinos
-- =====================================================================

do $$
declare
  r record;
  n integer;
begin
  if public.precio_desde_vino('e2000000-0000-4000-8000-000000000003') <> 9
     or public.precio_desde_vino('e2000000-0000-4000-8000-000000000003', 1500) <> 5
     or public.precio_desde_vino('e2000000-0000-4000-8000-000000000004') <> 40 then
    raise exception 'FALLO: precio_desde_vino no ignora formatos, ocultas, agotadas o tiendas inactivas';
  end if;

  -- Sin parámetros nuevos: los mismos vinos y en el mismo orden que antes (por nombre).
  select count(*) into n from public.listar_vinos(bodega => 'comp-destino', orden => 'nombre');
  if n <> 3 then
    raise exception 'FALLO: listar_vinos sin filtro de precio devuelve % vinos (esperados 3)', n;
  end if;
  if (select array_agg(slug) from public.listar_vinos(bodega => 'comp-destino', orden => 'nombre'))
     <> array['comp-vino-barato', 'comp-vino-caro', 'comp-vino-destino'] then
    raise exception 'FALLO: listar_vinos cambió el orden por nombre';
  end if;
  select * into r from public.listar_vinos(bodega => 'comp-destino', orden => 'nombre', limite => 1);
  if r.slug <> 'comp-vino-barato' or r.precio_desde <> 9 or r.total <> 3 then
    raise exception 'FALLO: precio_desde o total mal en listar_vinos: %', row_to_json(r);
  end if;

  -- Filtro: hasta 10 € → solo VB; desde 10 € → VC (40) y VD (22; VO aún no está fundido).
  if (select array_agg(slug) from public.listar_vinos(bodega => 'comp-destino', precio_max => 10))
     <> array['comp-vino-barato'] then
    raise exception 'FALLO: filtro precio_max';
  end if;
  if (select array_agg(slug) from public.listar_vinos(bodega => 'comp-destino', precio_min => 10))
     <> array['comp-vino-caro', 'comp-vino-destino'] then
    raise exception 'FALLO: filtro precio_min';
  end if;
  select count(*) into n from public.listar_vinos(bodega => 'comp-destino', precio_min => 23, precio_max => 39);
  if n <> 0 then
    raise exception 'FALLO: filtro de rango sin coincidencias';
  end if;

  -- Orden por precio: ascendente (sin precio, al final: aquí todos tienen).
  if (select array_agg(slug) from public.listar_vinos(bodega => 'comp-destino', orden => 'precio'))
     <> array['comp-vino-barato', 'comp-vino-destino', 'comp-vino-caro'] then
    raise exception 'FALLO: orden por precio';
  end if;
end
$$;

-- =====================================================================
-- 5. Anon y usuario: leen, no escriben
-- =====================================================================

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

do $$
begin
  if (select count(*) from public.ofertas where tienda_id = 'e4000000-0000-4000-8000-000000000001') = 0
     or not exists (select 1 from public.historial_precios)
     or not exists (select 1 from public.tiendas where slug = 'comp-tienda') then
    raise exception 'FALLO (anon): no lee tiendas, ofertas o historial';
  end if;
  if (select count(*) from public.listar_vinos(bodega => 'comp-destino', precio_max => 10)) <> 1 then
    raise exception 'FALLO (anon): listar_vinos con precio';
  end if;
  begin
    insert into public.tiendas (nombre, slug, web) values ('X', 'comp-x', 'https://x.example.test');
    raise exception 'FALLO (anon): crea tiendas';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000042", "role": "authenticated"}';

do $$
declare
  n integer;
begin
  if not exists (select 1 from public.ofertas) then
    raise exception 'FALLO (usuario): no lee ofertas';
  end if;
  begin
    insert into public.tiendas (nombre, slug, web) values ('X', 'comp-x', 'https://x.example.test');
    raise exception 'FALLO (usuario): crea tiendas';
  exception when insufficient_privilege then null;
  end;
  update public.ofertas set precio = 1 where id = 'e5000000-0000-4000-8000-000000000011';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO (usuario): edita ofertas';
  end if;
  delete from public.historial_precios;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO (usuario): borra historial';
  end if;
  begin
    perform public._fusion_mover_ofertas('vino', 'e2000000-0000-4000-8000-000000000001',
                                         'e2000000-0000-4000-8000-000000000002');
    raise exception 'FALLO (usuario): mueve ofertas';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- =====================================================================
-- 6. Admin: CRUD de tiendas y fusiones con ofertas
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000041", "role": "authenticated"}';

do $$
declare
  t uuid;
begin
  insert into public.tiendas (nombre, slug, web) values ('Nueva', 'comp-nueva', 'https://www.Nueva.example.test/x')
  returning id into t;
  if (select dominio from public.tiendas where id = t) <> 'nueva.example.test' then
    raise exception 'FALLO (admin): dominio de la tienda';
  end if;
  update public.tiendas set info_envio = 'Gratis desde 60 €', envio_gratis_desde = 60 where id = t;
  delete from public.tiendas where id = t;

  -- El admin corrige un precio: también deja historial.
  update public.ofertas set precio = 10 where id = 'e5000000-0000-4000-8000-000000000011';
  if (select count(*) from public.historial_precios where oferta_id = 'e5000000-0000-4000-8000-000000000011') <> 2 then
    raise exception 'FALLO (admin): la corrección de precio no deja historial';
  end if;
  update public.ofertas set oculta_admin = true where id = 'e5000000-0000-4000-8000-000000000011';
  update public.ofertas set oculta_admin = false, precio = 9 where id = 'e5000000-0000-4000-8000-000000000011';
end
$$;

-- 6.1 Fusión de vinos: VO → VD.
do $$
declare
  n integer;
begin
  perform public.admin_fusionar('vino', 'e2000000-0000-4000-8000-000000000001',
                                'e2000000-0000-4000-8000-000000000002');

  -- VO 2019 se movió entera (añada nueva en VD): su oferta la sigue con vino_id nuevo.
  if (select vino_id from public.ofertas where id = 'e5000000-0000-4000-8000-000000000002')
     <> 'e2000000-0000-4000-8000-000000000002' then
    raise exception 'FALLO (fusión): la oferta de una añada movida no cambió de vino';
  end if;

  -- VO 2020 se fundió en VD 2020: su oferta (p-2020) pasa a esa añada y conserva el historial.
  if (select anada_id from public.ofertas where id = 'e5000000-0000-4000-8000-000000000001')
     is distinct from 'e3000000-0000-4000-8000-000000000003'
     or (select vino_id from public.ofertas where id = 'e5000000-0000-4000-8000-000000000001')
     <> 'e2000000-0000-4000-8000-000000000002' then
    raise exception 'FALLO (fusión): la oferta de una añada fundida no pasó a la superviviente';
  end if;
  if (select count(*) from public.historial_precios where oferta_id = 'e5000000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'FALLO (fusión): la oferta movida perdió historial';
  end if;
  if (select count(*) from public.ofertas where anada_id = 'e3000000-0000-4000-8000-000000000003') <> 2 then
    raise exception 'FALLO (fusión): las dos ofertas de distinta URL deben convivir en la añada';
  end if;

  -- Sin añada, misma tienda, URL y formato: queda la más reciente (la de VO) con los
  -- tramos cerrados de la otra y un solo tramo vigente.
  if exists (select 1 from public.ofertas where id = 'e5000000-0000-4000-8000-000000000004') then
    raise exception 'FALLO (fusión): la oferta duplicada más antigua sigue existiendo';
  end if;
  if (select vino_id from public.ofertas where id = 'e5000000-0000-4000-8000-000000000003')
     <> 'e2000000-0000-4000-8000-000000000002' then
    raise exception 'FALLO (fusión): la oferta sin añada no pasó al vino superviviente';
  end if;
  select count(*) into n from public.historial_precios where oferta_id = 'e5000000-0000-4000-8000-000000000003';
  if n <> 2
     or (select count(*) from public.historial_precios
         where oferta_id = 'e5000000-0000-4000-8000-000000000003' and hasta is null) <> 1
     or not exists (select 1 from public.historial_precios
                    where oferta_id = 'e5000000-0000-4000-8000-000000000003' and precio = 35) then
    raise exception 'FALLO (fusión): historiales mal unidos (% tramos)', n;
  end if;

  if exists (select 1 from public.ofertas where vino_id = 'e2000000-0000-4000-8000-000000000001') then
    raise exception 'FALLO (fusión): quedan ofertas en el vino absorbido';
  end if;
end
$$;

-- 6.2 Fusión de bodegas: la tienda online de la bodega origen pasa al destino.
do $$
begin
  perform public.admin_fusionar('bodega', 'e1000000-0000-4000-8000-000000000001',
                                'e1000000-0000-4000-8000-000000000002');
  if (select bodega_id from public.tiendas where id = 'e4000000-0000-4000-8000-000000000002')
     is distinct from 'e1000000-0000-4000-8000-000000000002' then
    raise exception 'FALLO (fusión): la tienda de la bodega no pasó al destino';
  end if;
end
$$;

-- 6.3 Una añada que el admin cambia de vino arrastra sus ofertas.
do $$
begin
  update public.anadas set vino_id = 'e2000000-0000-4000-8000-000000000003'
  where id = 'e3000000-0000-4000-8000-000000000003';
  if exists (select 1 from public.ofertas
             where anada_id = 'e3000000-0000-4000-8000-000000000003'
               and vino_id <> 'e2000000-0000-4000-8000-000000000003') then
    raise exception 'FALLO: las ofertas no siguen a su añada al cambiarla de vino';
  end if;
end
$$;

reset role;

-- =====================================================================
-- 7. Semillas
-- =====================================================================

do $$
begin
  if (select count(*) from public.tiendas t join public.fuentes f on f.id = t.fuente_id
      where f.slug in ('vinoseleccion', 'vinopremier')) <> 2 then
    raise exception 'FALLO: faltan las tiendas de Vinoselección y Vinopremier';
  end if;
end
$$;

rollback;
