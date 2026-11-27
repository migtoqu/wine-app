-- Comprobación de premios (migración 20261127183538_premios): semilla del
-- Concours Mondial, RLS (lectura pública sin los ocultos, escritura solo admin),
-- premios que siguen al superviviente en una fusión de vinos y que caen con un
-- borrado normal.
--
-- Autocontenido: crea usuarios y datos de prueba y lo deshace todo con
-- rollback. Cualquier fallo lanza una excepción con el prefijo "FALLO".
-- Ejecutar como `postgres`.

begin;

-- =====================================================================
-- 1. Datos de prueba (como postgres)
-- =====================================================================

insert into public.invitaciones (email, rol) values
  ('premios-admin@example.test', 'admin'),
  ('premios-user@example.test', 'user');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000061', 'premios-admin@example.test'),
  ('00000000-0000-4000-8000-000000000062', 'premios-user@example.test');

insert into public.bodegas (id, nombre, slug) values
  ('f1000000-0000-4000-8000-000000000001', 'Bodega Premios', 'premios-bodega');

insert into public.vinos (id, bodega_id, nombre, slug, tipo) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Premiado Origen', 'premios-origen', 'tinto'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'Premiado Destino', 'premios-destino', 'tinto'),
  ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'Premiado Borrado', 'premios-borrado', 'tinto');

do $$
begin
  if not exists (
    select 1 from public.certamenes c join public.fuentes f on f.id = c.fuente_id
    where c.slug = 'concours-mondial-bruxelles' and f.slug = 'concours-mondial-bruxelles' and c.tipo = 'concurso'
  ) then
    raise exception 'FALLO (semilla): falta el certamen del Concours Mondial ligado a su fuente';
  end if;
end
$$;

insert into public.premios (id, certamen_id, vino_id, anio, edicion, medalla, distincion, id_externo, oculto_admin)
select x.id::uuid, c.id, x.vino::uuid, 2020, 2024, x.medalla::public.medalla_premio, 'Medalla', x.ext, x.oculto
from public.certamenes c,
  (values
    ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'oro', 'premios-1', false),
    ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'plata', 'premios-2', true),
    ('f3000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000003', 'oro', 'premios-3', false)
  ) as x(id, vino, medalla, ext, oculto)
where c.slug = 'concours-mondial-bruxelles';

-- Ni medalla, ni puntos, ni distinción: no es un premio.
do $$
begin
  begin
    insert into public.premios (certamen_id, vino_id, edicion, id_externo)
    select id, 'f2000000-0000-4000-8000-000000000001', 2024, 'premios-vacio'
    from public.certamenes where slug = 'concours-mondial-bruxelles';
    raise exception 'FALLO (check): acepta un premio vacío';
  exception when check_violation then null;
  end;
end
$$;

-- =====================================================================
-- 2. Anon y usuario: leen los visibles, no escriben
-- =====================================================================

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

do $$
begin
  if not exists (select 1 from public.certamenes where slug = 'concours-mondial-bruxelles') then
    raise exception 'FALLO (anon): no lee certámenes';
  end if;
  if (select count(*) from public.premios where id_externo like 'premios-%') <> 2 then
    raise exception 'FALLO (anon): no ve exactamente los 2 premios visibles';
  end if;
  begin
    update public.premios set oculto_admin = false;
    if exists (select 1 from public.premios where id = 'f3000000-0000-4000-8000-000000000002') then
      raise exception 'FALLO (anon): ve o desoculta premios ocultos';
    end if;
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000062", "role": "authenticated"}';

do $$
declare
  n integer;
begin
  if (select count(*) from public.premios where id_externo like 'premios-%') <> 2 then
    raise exception 'FALLO (usuario): no ve exactamente los 2 premios visibles';
  end if;
  begin
    insert into public.certamenes (nombre, slug, tipo) values ('X', 'premios-x', 'guia');
    raise exception 'FALLO (usuario): crea certámenes';
  exception when insufficient_privilege then null;
  end;
  delete from public.premios where id_externo like 'premios-%';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO (usuario): borra premios';
  end if;
end
$$;

reset role;

-- =====================================================================
-- 3. Admin: ve los ocultos, edita y funde
-- =====================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "00000000-0000-4000-8000-000000000061", "role": "authenticated"}';

do $$
begin
  if (select count(*) from public.premios where id_externo like 'premios-%') <> 3 then
    raise exception 'FALLO (admin): no ve los premios ocultos';
  end if;
  insert into public.certamenes (nombre, slug, tipo, escala_max) values ('Guía X', 'premios-guia-x', 'guia', 100);
  delete from public.certamenes where slug = 'premios-guia-x';

  perform public.admin_fusionar('vino', 'f2000000-0000-4000-8000-000000000001',
                                'f2000000-0000-4000-8000-000000000002');
  if (select count(*) from public.premios
      where vino_id = 'f2000000-0000-4000-8000-000000000002' and id_externo in ('premios-1', 'premios-2')) <> 2 then
    raise exception 'FALLO (fusión): los premios no pasaron al superviviente';
  end if;
  if not (select oculto_admin from public.premios where id = 'f3000000-0000-4000-8000-000000000002') then
    raise exception 'FALLO (fusión): el premio oculto dejó de estarlo';
  end if;

  delete from public.vinos where id = 'f2000000-0000-4000-8000-000000000003';
  if exists (select 1 from public.premios where id = 'f3000000-0000-4000-8000-000000000003') then
    raise exception 'FALLO (borrado): el premio de un vino borrado sigue ahí';
  end if;
end
$$;

reset role;

rollback;
