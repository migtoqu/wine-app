-- Comprobación de la consolidación (migración 20261110090000_consolidacion):
-- dominio_web, RLS y permisos de las tablas y funciones nuevas, procedencia
-- 'admin' solo al cambiar un valor, supresiones al borrar (también de los
-- hijos en cascada) y fusión de bodegas y vinos con favoritos y notas de
-- otros usuarios.
--
-- Autocontenido: crea usuarios y datos de prueba y lo deshace todo con
-- rollback. Cualquier fallo lanza una excepción con el prefijo "FALLO".
-- Ejecutar como `postgres`.

begin;

-- =====================================================================
-- 1. Datos de prueba (como postgres)
-- =====================================================================
-- Usuarios: …0031 admin, …0032 usuaria A, …0033 usuario B.

insert into public.invitaciones (email, rol) values
  ('cons-admin@example.test', 'admin'),
  ('cons-a@example.test', 'user'),
  ('cons-b@example.test', 'user');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000031', 'cons-admin@example.test'),
  ('00000000-0000-4000-8000-000000000032', 'cons-a@example.test'),
  ('00000000-0000-4000-8000-000000000033', 'cons-b@example.test');

insert into public.fuentes (id, nombre, slug, tipo, url_base) values
  ('a1000000-0000-4000-8000-000000000001', 'Tienda Cons', 'cons-tienda', 'tienda',
   'https://tienda.example.test');

insert into public.variedades_uva (id, nombre, slug) values
  ('a2000000-0000-4000-8000-000000000001', 'Uva Cons', 'cons-uva');

-- Bodega origen (O) y destino (D) para fusionar; X para borrar.
insert into public.bodegas (id, nombre, slug, web, municipio, telefono, hectareas) values
  ('b1000000-0000-4000-8000-000000000001', 'Bodega Cons Origen', 'cons-origen',
   'https://www.Cons-Origen.es/inicio', 'Roa', '+34 900 000 001', 12),
  ('b1000000-0000-4000-8000-000000000002', 'Bodega Cons Destino', 'cons-destino',
   null, null, '+34 900 000 002', null),
  ('b1000000-0000-4000-8000-000000000003', 'Bodega Cons Borrar', 'cons-borrar',
   null, null, null, null);

insert into public.servicios_bodega (id, bodega_id, tipo, titulo, precio_desde) values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'visita', 'Visita guiada', 15),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001',
   'cata', 'Cata premium', 40),
  ('b2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000002',
   'visita', 'Visita  GUIADA', 20);

insert into public.imagenes (id, bodega_id, url, tipo, principal) values
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'https://example.test/o.jpg', 'bodega', true),
  ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002',
   'https://example.test/d.jpg', 'bodega', true);

-- Vinos: VO (en O) y VD (en D) para fundir; VX (en X) para borrar.
insert into public.vinos (id, bodega_id, nombre, slug, tipo, descripcion) values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'Vino Cons Origen', 'cons-vino-origen', 'tinto', 'Descripción del origen'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002',
   'Vino Cons Destino', 'cons-vino-destino', 'tinto', null),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003',
   'Vino Cons Borrar', 'cons-vino-borrar', 'tinto', null);

-- Añadas: VO 2019 y 2020; VD 2020 (coincide) ; VX 2021.
insert into public.anadas (id, vino_id, anio, grado) values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 2019, 14),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 2020, 14.5),
  ('c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002', 2020, null),
  ('c2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000003', 2021, null);

insert into public.anada_variedades (anada_id, variedad_id, porcentaje) values
  ('c2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 100);

insert into public.imagenes (id, anada_id, url, tipo, principal) values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002',
   'https://example.test/vo-2020.jpg', 'botella', true),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000004',
   'https://example.test/vx-2021.jpg', 'botella', true);

insert into public.codigos_ean (ean, vino_id, anada_id) values
  ('8410000000011', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002'),
  ('8410000000028', 'c1000000-0000-4000-8000-000000000003', null);

insert into public.registros_fuente (id, fuente_id, id_externo, datos, entidad_tipo, entidad_id,
                                     estado_emparejamiento) values
  ('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'cons-o',
   '{}', 'bodega', 'b1000000-0000-4000-8000-000000000001', 'emparejado'),
  ('d1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'cons-vo-2020',
   '{}', 'anada', 'c2000000-0000-4000-8000-000000000002', 'emparejado'),
  ('d1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'cons-vx',
   '{}', 'vino', 'c1000000-0000-4000-8000-000000000003', 'emparejado'),
  ('d1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'cons-vx-2021',
   '{}', 'anada', 'c2000000-0000-4000-8000-000000000004', 'emparejado');

insert into public.valores_fuente (registro_id, entidad_tipo, entidad_id, campo, valor, fuente_id, origen) values
  ('d1000000-0000-4000-8000-000000000001', 'bodega', 'b1000000-0000-4000-8000-000000000001',
   'hectareas', '12', 'a1000000-0000-4000-8000-000000000001', 'tienda');
insert into public.procedencia_campos (entidad_tipo, entidad_id, campo, origen, fuente_id, registro_id) values
  ('bodega', 'b1000000-0000-4000-8000-000000000001', 'hectareas', 'tienda',
   'a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'),
  ('bodega', 'b1000000-0000-4000-8000-000000000001', 'telefono', 'tienda',
   'a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001');

insert into public.resumenes (entidad_tipo, entidad_id, campo, idioma, texto, hash_hechos, generador) values
  ('bodega', 'b1000000-0000-4000-8000-000000000001', 'historia', 'es', 'Texto', 'h', 'plantillas@1');

-- Personales: A tiene favorito y nota en O y en D (conflicto); B solo en O.
insert into public.favoritos (usuario_id, bodega_id) values
  ('00000000-0000-4000-8000-000000000032', 'b1000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000032', 'b1000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000033', 'b1000000-0000-4000-8000-000000000001');
insert into public.favoritos (usuario_id, vino_id) values
  ('00000000-0000-4000-8000-000000000033', 'c1000000-0000-4000-8000-000000000001');
insert into public.notas (usuario_id, bodega_id, texto) values
  ('00000000-0000-4000-8000-000000000032', 'b1000000-0000-4000-8000-000000000001', 'Nota A en origen'),
  ('00000000-0000-4000-8000-000000000032', 'b1000000-0000-4000-8000-000000000002', 'Nota A en destino'),
  ('00000000-0000-4000-8000-000000000033', 'b1000000-0000-4000-8000-000000000001', 'Nota B en origen');
insert into public.notas (usuario_id, anada_id, texto) values
  ('00000000-0000-4000-8000-000000000033', 'c2000000-0000-4000-8000-000000000002', 'Nota B añada 2020 origen'),
  ('00000000-0000-4000-8000-000000000033', 'c2000000-0000-4000-8000-000000000003', 'Nota B añada 2020 destino');

-- =====================================================================
-- 2. Utilidades, columnas generadas y permisos
-- =====================================================================

do $$
begin
  if public.dominio_web('https://WWW.Aalto.es/vinos?x=1') is distinct from 'aalto.es'
     or public.dominio_web('http://m.bodega.com:8080') is distinct from 'bodega.com'
     or public.dominio_web('https://es.bodega.com') is distinct from 'bodega.com'
     or public.dominio_web('https://www.co.uk') is distinct from 'www.co.uk'
     or public.dominio_web('https://tienda.bodega.es') is distinct from 'tienda.bodega.es'
     or public.dominio_web('no es una url') is not null then
    raise exception 'FALLO: dominio_web normaliza mal';
  end if;
  if (select dominio from public.bodegas where id = 'b1000000-0000-4000-8000-000000000001')
     is distinct from 'cons-origen.es' then
    raise exception 'FALLO: bodegas.dominio no se genera desde web';
  end if;
  if (select clave from public.servicios_bodega where id = 'b2000000-0000-4000-8000-000000000003')
     is distinct from (select clave from public.servicios_bodega where id = 'b2000000-0000-4000-8000-000000000001') then
    raise exception 'FALLO: la clave de servicio no normaliza el título';
  end if;
  if has_function_privilege('anon', 'public.admin_fusionar(text, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public._fusion_mover_personales(text, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public._fusion_comun(text, public.entidad_catalogo, uuid, uuid, text[])', 'execute')
     or has_function_privilege('authenticated', 'public.registrar_supresion()', 'execute')
     or has_function_privilege('authenticated', 'public.registrar_edicion_admin()', 'execute') then
    raise exception 'FALLO: anon o authenticated pueden ejecutar funciones internas';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.admin_fusionar(text, uuid, uuid)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public._fusion_mover_personales(text, uuid, uuid)'::regprocedure) then
    raise exception 'FALLO: admin_fusionar debe ser invoker y _fusion_mover_personales definer';
  end if;
  begin
    insert into public.codigos_ean (ean, vino_id) values ('123', 'c1000000-0000-4000-8000-000000000001');
    raise exception 'FALLO: se aceptó un EAN inválido';
  exception when check_violation then null;
  end;
end
$$;

-- =====================================================================
-- 3. anon: lee atribución, no lo interno
-- =====================================================================

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

do $$
begin
  if not exists (select 1 from public.procedencia_campos)
     or not exists (select 1 from public.resumenes)
     or not exists (select 1 from public.codigos_ean) then
    raise exception 'FALLO (anon): no lee procedencia, resúmenes o EAN';
  end if;
  begin
    perform 1 from public.supresiones;
    raise exception 'FALLO (anon): lee supresiones';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.valores_fuente;
    raise exception 'FALLO (anon): lee valores_fuente';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- =====================================================================
-- 4. Usuario normal: ni escribe ni fusiona
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000032", "role": "authenticated"}';

do $$
declare
  n integer;
begin
  if exists (select 1 from public.supresiones) or exists (select 1 from public.valores_fuente) then
    raise exception 'FALLO (usuario): ve supresiones o valores_fuente';
  end if;
  begin
    insert into public.procedencia_campos (entidad_tipo, entidad_id, campo, origen)
    values ('bodega', 'b1000000-0000-4000-8000-000000000002', 'web', 'admin');
    raise exception 'FALLO (usuario): escribe procedencia';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.resumenes (entidad_tipo, entidad_id, campo, idioma, texto, hash_hechos, generador)
    values ('bodega', 'b1000000-0000-4000-8000-000000000002', 'historia', 'es', 'x', 'h', 'g');
    raise exception 'FALLO (usuario): escribe resúmenes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_fusionar('bodega', 'b1000000-0000-4000-8000-000000000001',
                                  'b1000000-0000-4000-8000-000000000002');
    raise exception 'FALLO (usuario): ha podido fusionar';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public._fusion_mover_personales('bodega', 'b1000000-0000-4000-8000-000000000001',
                                            'b1000000-0000-4000-8000-000000000002');
    raise exception 'FALLO (usuario): ha podido mover favoritos ajenos';
  exception when insufficient_privilege then null;
  end;
  update public.bodegas set telefono = 'x' where id = 'b1000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO (usuario): ha editado una bodega';
  end if;
end
$$;

reset role;

-- =====================================================================
-- 5. Admin: procedencia, borrados y fusiones
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000031", "role": "authenticated"}';

-- 5.1 Procedencia 'admin' solo si el valor cambia.
do $$
begin
  -- Guardado sin cambios (mismo teléfono y hectáreas): la procedencia sigue siendo de la fuente.
  update public.bodegas set telefono = telefono, hectareas = 12, nombre = nombre
  where id = 'b1000000-0000-4000-8000-000000000001';
  if (select origen from public.procedencia_campos
      where entidad_tipo = 'bodega' and entidad_id = 'b1000000-0000-4000-8000-000000000001'
        and campo = 'hectareas') <> 'tienda' then
    raise exception 'FALLO (admin): un guardado sin cambios marcó el campo como admin';
  end if;

  update public.bodegas set telefono = '+34 900 000 009'
  where id = 'b1000000-0000-4000-8000-000000000001';
  if (select origen from public.procedencia_campos
      where entidad_tipo = 'bodega' and entidad_id = 'b1000000-0000-4000-8000-000000000001'
        and campo = 'telefono') <> 'admin'
     or (select fuente_id from public.procedencia_campos
         where entidad_tipo = 'bodega' and entidad_id = 'b1000000-0000-4000-8000-000000000001'
           and campo = 'telefono') is not null then
    raise exception 'FALLO (admin): editar un campo no lo marcó como admin';
  end if;

  -- Vaciar un campo también es una decisión del admin.
  update public.anadas set grado = null where id = 'c2000000-0000-4000-8000-000000000003';
  if exists (select 1 from public.procedencia_campos
             where entidad_tipo = 'anada' and entidad_id = 'c2000000-0000-4000-8000-000000000003') then
    raise exception 'FALLO (admin): null → null no es un cambio';
  end if;
  update public.anadas set grado = 13.5 where id = 'c2000000-0000-4000-8000-000000000003';
  update public.anadas set grado = null where id = 'c2000000-0000-4000-8000-000000000003';
  if (select origen from public.procedencia_campos
      where entidad_tipo = 'anada' and entidad_id = 'c2000000-0000-4000-8000-000000000003'
        and campo = 'grado') <> 'admin' then
    raise exception 'FALLO (admin): vaciar un campo no lo marcó como admin';
  end if;
end
$$;

-- 5.2 Borrar un vino suprime también sus añadas e imágenes (cascada).
do $$
begin
  delete from public.vinos where id = 'c1000000-0000-4000-8000-000000000003';

  if not exists (select 1 from public.supresiones
                 where entidad_tipo = 'vino' and entidad_id = 'c1000000-0000-4000-8000-000000000003'
                   and motivo = 'borrado' and claves ->> 'nombre' = 'Vino Cons Borrar'
                   and claves -> 'eans' ? '8410000000028'
                   and creada_por = '00000000-0000-4000-8000-000000000031') then
    raise exception 'FALLO (admin): borrar un vino no dejó su supresión con claves y EAN';
  end if;
  if not exists (select 1 from public.supresiones
                 where entidad_tipo = 'anada' and entidad_id = 'c2000000-0000-4000-8000-000000000004'
                   and (claves ->> 'anio')::int = 2021
                   and claves ->> 'vino_id' = 'c1000000-0000-4000-8000-000000000003')
     or not exists (select 1 from public.supresiones
                    where entidad_tipo = 'imagen' and entidad_id = 'c3000000-0000-4000-8000-000000000002'
                      and claves ->> 'url' = 'https://example.test/vx-2021.jpg') then
    raise exception 'FALLO (admin): los hijos borrados en cascada no quedaron suprimidos';
  end if;
  if exists (select 1 from public.registros_fuente
             where id in ('d1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000004')
               and (supresion_id is null or entidad_id is not null
                    or estado_emparejamiento <> 'descartado')) then
    raise exception 'FALLO (admin): los registros del vino y su añada no quedaron suprimidos';
  end if;

  -- La bodega sin vinos, al borrarse, también queda suprimida.
  delete from public.bodegas where id = 'b1000000-0000-4000-8000-000000000003';
  if not exists (select 1 from public.supresiones
                 where entidad_tipo = 'bodega' and entidad_id = 'b1000000-0000-4000-8000-000000000003') then
    raise exception 'FALLO (admin): borrar una bodega no dejó supresión';
  end if;
end
$$;

-- 5.3 Fusión de bodegas O → D.
do $$
declare
  d public.bodegas;
begin
  begin
    perform public.admin_fusionar('bodega', 'b1000000-0000-4000-8000-000000000002',
                                  'b1000000-0000-4000-8000-000000000002');
    raise exception 'FALLO (admin): se fusionó una bodega consigo misma';
  exception when invalid_parameter_value then null;
  end;

  perform public.admin_fusionar('bodega', 'b1000000-0000-4000-8000-000000000001',
                                'b1000000-0000-4000-8000-000000000002');

  if exists (select 1 from public.bodegas where id = 'b1000000-0000-4000-8000-000000000001') then
    raise exception 'FALLO (fusión bodega): el origen sigue existiendo';
  end if;
  select * into d from public.bodegas where id = 'b1000000-0000-4000-8000-000000000002';
  -- Huecos rellenados desde el origen; lo que el destino tenía se conserva.
  if d.web is distinct from 'https://www.Cons-Origen.es/inicio' or d.municipio is distinct from 'Roa'
     or d.hectareas is distinct from 12 or d.telefono is distinct from '+34 900 000 002' then
    raise exception 'FALLO (fusión bodega): huecos mal rellenados: %', row_to_json(d);
  end if;
  if (select origen from public.procedencia_campos
      where entidad_tipo = 'bodega' and entidad_id = d.id and campo = 'hectareas') <> 'tienda'
     or exists (select 1 from public.procedencia_campos
                where entidad_tipo = 'bodega' and entidad_id = 'b1000000-0000-4000-8000-000000000001') then
    raise exception 'FALLO (fusión bodega): la procedencia no se traspasó';
  end if;
  if (select bodega_id from public.vinos where id = 'c1000000-0000-4000-8000-000000000001') <> d.id then
    raise exception 'FALLO (fusión bodega): los vinos no pasaron al destino';
  end if;
  -- Servicios: «Visita guiada» ya existía en el destino (se conserva el suyo); la cata pasa.
  if (select count(*) from public.servicios_bodega where bodega_id = d.id) <> 2
     or (select precio_desde from public.servicios_bodega
         where bodega_id = d.id and tipo = 'visita') <> 20 then
    raise exception 'FALLO (fusión bodega): servicios mal fusionados';
  end if;
  if (select count(*) from public.imagenes where bodega_id = d.id) <> 2
     or (select count(*) from public.imagenes where bodega_id = d.id and principal) <> 1 then
    raise exception 'FALLO (fusión bodega): imágenes mal fusionadas';
  end if;
  if (select entidad_id from public.registros_fuente where id = 'd1000000-0000-4000-8000-000000000001') <> d.id
     or not exists (select 1 from public.valores_fuente
                    where registro_id = 'd1000000-0000-4000-8000-000000000001' and entidad_id = d.id) then
    raise exception 'FALLO (fusión bodega): registros o valores no se reapuntaron';
  end if;
  if exists (select 1 from public.resumenes where entidad_id = 'b1000000-0000-4000-8000-000000000001') then
    raise exception 'FALLO (fusión bodega): quedan resúmenes del origen';
  end if;
  if not exists (select 1 from public.supresiones
                 where entidad_tipo = 'bodega' and entidad_id = 'b1000000-0000-4000-8000-000000000001'
                   and motivo = 'fusion' and fusionada_en = d.id
                   and claves ->> 'nombre' = 'Bodega Cons Origen') then
    raise exception 'FALLO (fusión bodega): no quedó constancia de la fusión';
  end if;
  -- La fusión no se registra como borrado de sus hijos ni como edición del admin.
  if exists (select 1 from public.supresiones
             where entidad_tipo = 'servicio_bodega' and entidad_id = 'b2000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.procedencia_campos
                where entidad_tipo = 'bodega' and entidad_id = d.id and campo = 'web' and origen = 'admin') then
    raise exception 'FALLO (fusión bodega): la fusión disparó supresiones o procedencia admin';
  end if;
end
$$;

-- 5.4 Fusión de vinos VO → VD (añada 2020 repetida, 2019 nueva).
do $$
begin
  perform public.admin_fusionar('vino', 'c1000000-0000-4000-8000-000000000001',
                                'c1000000-0000-4000-8000-000000000002');

  if exists (select 1 from public.vinos where id = 'c1000000-0000-4000-8000-000000000001') then
    raise exception 'FALLO (fusión vino): el origen sigue existiendo';
  end if;
  if (select descripcion from public.vinos where id = 'c1000000-0000-4000-8000-000000000002')
     is distinct from 'Descripción del origen' then
    raise exception 'FALLO (fusión vino): no se rellenó la descripción';
  end if;
  if (select vino_id from public.anadas where id = 'c2000000-0000-4000-8000-000000000001')
     <> 'c1000000-0000-4000-8000-000000000002' then
    raise exception 'FALLO (fusión vino): la añada 2019 no pasó al destino';
  end if;
  if exists (select 1 from public.anadas where id = 'c2000000-0000-4000-8000-000000000002')
     or (select count(*) from public.anadas
         where vino_id = 'c1000000-0000-4000-8000-000000000002' and anio = 2020) <> 1 then
    raise exception 'FALLO (fusión vino): la añada 2020 no se fundió';
  end if;
  -- El admin vació a propósito el grado de la 2020 del destino: no se rellena.
  if (select grado from public.anadas where id = 'c2000000-0000-4000-8000-000000000003') is not null then
    raise exception 'FALLO (fusión vino): se rellenó un campo que el admin dejó vacío';
  end if;
  if not exists (select 1 from public.anada_variedades
                 where anada_id = 'c2000000-0000-4000-8000-000000000003')
     or (select anada_id from public.imagenes where id = 'c3000000-0000-4000-8000-000000000001')
        <> 'c2000000-0000-4000-8000-000000000003'
     or (select anada_id from public.codigos_ean where ean = '8410000000011')
        <> 'c2000000-0000-4000-8000-000000000003'
     or (select vino_id from public.codigos_ean where ean = '8410000000011')
        <> 'c1000000-0000-4000-8000-000000000002'
     or (select entidad_id from public.registros_fuente where id = 'd1000000-0000-4000-8000-000000000002')
        <> 'c2000000-0000-4000-8000-000000000003' then
    raise exception 'FALLO (fusión vino): uvas, imagen, EAN o registro de la añada no se traspasaron';
  end if;
  if not exists (select 1 from public.supresiones
                 where entidad_tipo = 'vino' and entidad_id = 'c1000000-0000-4000-8000-000000000001'
                   and fusionada_en = 'c1000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.supresiones
                    where entidad_tipo = 'anada' and entidad_id = 'c2000000-0000-4000-8000-000000000002'
                      and fusionada_en = 'c2000000-0000-4000-8000-000000000003') then
    raise exception 'FALLO (fusión vino): no quedó constancia de la fusión del vino o la añada';
  end if;
end
$$;

reset role;

-- =====================================================================
-- 6. Favoritos y notas de otros usuarios tras las fusiones (como postgres)
-- =====================================================================

do $$
begin
  -- A: tenía favorito en O y D → uno solo, en D. B: el suyo pasa a D.
  if (select count(*) from public.favoritos
      where usuario_id = '00000000-0000-4000-8000-000000000032') <> 1
     or not exists (select 1 from public.favoritos
                    where usuario_id = '00000000-0000-4000-8000-000000000033'
                      and bodega_id = 'b1000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.favoritos where bodega_id = 'b1000000-0000-4000-8000-000000000001')
     or not exists (select 1 from public.favoritos
                    where usuario_id = '00000000-0000-4000-8000-000000000033'
                      and vino_id = 'c1000000-0000-4000-8000-000000000002') then
    raise exception 'FALLO (personales): favoritos mal traspasados';
  end if;
  -- A: la nota del destino se conserva con la del origen añadida; B: la suya pasa.
  if (select texto from public.notas
      where usuario_id = '00000000-0000-4000-8000-000000000032'
        and bodega_id = 'b1000000-0000-4000-8000-000000000002')
     is distinct from E'Nota A en destino\n\n———\n\nNota A en origen'
     or (select count(*) from public.notas
         where usuario_id = '00000000-0000-4000-8000-000000000032') <> 1
     or (select texto from public.notas
         where usuario_id = '00000000-0000-4000-8000-000000000033'
           and bodega_id = 'b1000000-0000-4000-8000-000000000002') <> 'Nota B en origen' then
    raise exception 'FALLO (personales): notas de bodega mal fusionadas';
  end if;
  if (select texto from public.notas
      where usuario_id = '00000000-0000-4000-8000-000000000033'
        and anada_id = 'c2000000-0000-4000-8000-000000000003')
     is distinct from E'Nota B añada 2020 destino\n\n———\n\nNota B añada 2020 origen' then
    raise exception 'FALLO (personales): notas de añada mal fusionadas';
  end if;
end
$$;

-- =====================================================================
-- 7. Los borrados de service_role (scrapers, mantenimiento) no suprimen
-- =====================================================================

set local role service_role;

do $$
begin
  delete from public.servicios_bodega where id = 'b2000000-0000-4000-8000-000000000002';
  if exists (select 1 from public.supresiones where entidad_id = 'b2000000-0000-4000-8000-000000000002') then
    raise exception 'FALLO (service_role): un borrado del scraper dejó supresión';
  end if;
  update public.bodegas set email = 'x@example.test' where id = 'b1000000-0000-4000-8000-000000000002';
  if exists (select 1 from public.procedencia_campos
             where entidad_id = 'b1000000-0000-4000-8000-000000000002' and campo = 'email') then
    raise exception 'FALLO (service_role): una escritura del scraper se marcó como admin';
  end if;
end
$$;

reset role;

rollback;
