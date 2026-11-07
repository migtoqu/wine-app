-- Panel de administración (ROADMAP Fase 1, §5.8): gestión de usuarios y
-- guardado atómico de las relaciones del catálogo. Ver docs/SCOPE.md.
--
-- * proteger_ultimo_admin(): nunca se queda la app sin admins, ni al quitar el
--   rol ni al borrar el usuario (el cascade de auth.users llega como delete en
--   perfiles).
-- * admin_listar_usuarios(): perfiles con el email y el último acceso, que
--   están en auth.users y no se pueden leer por RLS.
-- * admin_guardar_denominaciones_bodega() y admin_guardar_variedades_anada():
--   reemplazan el conjunto de D.O. de una bodega o de uvas de una añada en una
--   sola transacción. security invoker: se aplica la RLS de escritura de admin.

-- =====================================================================
-- Último admin
-- =====================================================================

-- security definer: tiene que ver todas las filas admin (también cuando el
-- delete llega en cascada, con otro usuario) y bloquearlas con for update para
-- que dos admins que se quitan el rol a la vez no dejen la tabla sin ninguno.
create or replace function public.proteger_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rol = 'admin' and (tg_op = 'DELETE' or new.rol is distinct from 'admin') then
    perform 1 from public.perfiles where rol = 'admin' for update;
    if not exists (
      select 1 from public.perfiles where rol = 'admin' and id <> old.id
    ) then
      raise exception 'ultimo_admin: debe quedar al menos un admin'
        using errcode = 'P0001',
              hint = 'Da el rol admin a otro usuario antes.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

revoke execute on function public.proteger_ultimo_admin() from public, anon, authenticated;

create trigger proteger_ultimo_admin
  before update of rol or delete on public.perfiles
  for each row execute function public.proteger_ultimo_admin();

-- =====================================================================
-- Listado de usuarios
-- =====================================================================

-- nombre y rol también se pueden leer de perfiles (RLS de admin); van aquí
-- para listar en una sola llamada. De auth.users solo salen email y último acceso.
create or replace function public.admin_listar_usuarios()
returns table (
  id               uuid,
  email            text,
  nombre           text,
  rol              public.rol_usuario,
  created_at       timestamptz,
  last_sign_in_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.nombre, p.rol, p.created_at, u.last_sign_in_at
    from public.perfiles p
    join auth.users u on u.id = p.id
    order by p.created_at, p.id;
end
$$;

revoke execute on function public.admin_listar_usuarios() from public, anon;
grant execute on function public.admin_listar_usuarios() to authenticated;

-- =====================================================================
-- Relaciones del catálogo
-- =====================================================================

-- D.O. de una bodega: exactamente p_denominacion_ids; p_principal (si no es
-- null) tiene que estar entre ellas.
create or replace function public.admin_guardar_denominaciones_bodega(
  p_bodega_id         uuid,
  p_denominacion_ids  uuid[],
  p_principal         uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ids uuid[] := coalesce(p_denominacion_ids, '{}');
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  if p_principal is not null and not (p_principal = any (ids)) then
    raise exception 'principal_invalida: la D.O. principal no está en la lista'
      using errcode = '22023';
  end if;

  delete from public.bodega_denominaciones
  where bodega_id = p_bodega_id and not (denominacion_id = any (ids));

  -- Primero se quita la principal actual: hay un índice único por bodega.
  update public.bodega_denominaciones
  set principal = false
  where bodega_id = p_bodega_id and principal
    and denominacion_id is distinct from p_principal;

  insert into public.bodega_denominaciones (bodega_id, denominacion_id, principal)
  select p_bodega_id, d, d = p_principal
  from unnest(ids) as d
  on conflict (bodega_id, denominacion_id) do update set principal = excluded.principal;
end
$$;

-- Uvas de una añada: p_variedades es [{"variedad_id": uuid, "porcentaje": num|null}].
-- La suma de porcentajes no puede pasar de 100.
create or replace function public.admin_guardar_variedades_anada(
  p_anada_id     uuid,
  p_variedades   jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  filas jsonb := coalesce(p_variedades, '[]'::jsonb);
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  if jsonb_typeof(filas) <> 'array' then
    raise exception 'variedades_invalidas: se esperaba un array' using errcode = '22023';
  end if;
  if (select coalesce(sum((e ->> 'porcentaje')::numeric), 0)
      from jsonb_array_elements(filas) e) > 100 then
    raise exception 'porcentaje_excedido: la suma pasa de 100' using errcode = '22023';
  end if;

  delete from public.anada_variedades
  where anada_id = p_anada_id
    and variedad_id not in (
      select (e ->> 'variedad_id')::uuid from jsonb_array_elements(filas) e
    );

  insert into public.anada_variedades (anada_id, variedad_id, porcentaje)
  select p_anada_id, (e ->> 'variedad_id')::uuid, (e ->> 'porcentaje')::numeric
  from jsonb_array_elements(filas) e
  on conflict (anada_id, variedad_id) do update set porcentaje = excluded.porcentaje;
end
$$;

revoke execute on function
  public.admin_guardar_denominaciones_bodega(uuid, uuid[], uuid),
  public.admin_guardar_variedades_anada(uuid, jsonb)
from public, anon;

grant execute on function
  public.admin_guardar_denominaciones_bodega(uuid, uuid[], uuid),
  public.admin_guardar_variedades_anada(uuid, jsonb)
to authenticated;
