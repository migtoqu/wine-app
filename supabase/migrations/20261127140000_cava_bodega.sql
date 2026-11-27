-- Mi cava: enlace a la bodega del catálogo.
--
-- Hasta ahora un lote solo podía enlazarse a un vino (vino_id). Al añadir
-- botellas de un vino que no tenemos, la bodega sí puede estar registrada:
-- `bodega_id` la enlaza aunque el vino sea texto libre. `bodega_nombre` sigue
-- guardando la copia del texto, así que el lote sobrevive si la bodega se
-- borra (on delete set null).
--
-- Con vino enlazado, la bodega es siempre la del vino: lo fija un trigger,
-- sin fiarse de lo que mande el formulario.

alter table public.cava
  add column bodega_id uuid references public.bodegas (id) on delete set null;

create index cava_bodega_id_idx on public.cava (bodega_id) where bodega_id is not null;

create or replace function public._cava_bodega_del_vino()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vino_id is not null then
    select v.bodega_id into new.bodega_id from public.vinos v where v.id = new.vino_id;
  end if;
  return new;
end
$$;

revoke execute on function public._cava_bodega_del_vino() from public, anon, authenticated;

create trigger cava_bodega_del_vino before insert or update of vino_id, bodega_id on public.cava
  for each row execute function public._cava_bodega_del_vino();

-- Lotes ya enlazados a un vino: su bodega.
update public.cava c set bodega_id = v.bodega_id
from public.vinos v
where v.id = c.vino_id and c.bodega_id is null;

-- =====================================================================
-- Fusión: los lotes también pasan a la bodega que queda
-- =====================================================================
-- Igual que en 20261116180000_mi_cava.sql, pero la cava se reapunta también
-- en la fusión de bodegas.

create or replace function public._fusion_mover_personales(
  p_tipo     text,  -- 'bodega' | 'vino' | 'anada'
  p_origen   uuid,
  p_destino  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  col text;
begin
  if not public.is_admin() then
    raise exception 'solo_admin: hace falta el rol admin' using errcode = '42501';
  end if;
  if p_tipo not in ('bodega', 'vino', 'anada') then
    raise exception 'tipo_invalido: %', p_tipo using errcode = '22023';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'misma_entidad: origen y destino deben ser distintos' using errcode = '22023';
  end if;
  col := p_tipo || '_id';

  if p_tipo <> 'anada' then
    execute format(
      'delete from public.favoritos f where f.%1$I = $1
         and exists (select 1 from public.favoritos x where x.usuario_id = f.usuario_id and x.%1$I = $2)',
      col) using p_origen, p_destino;
    execute format('update public.favoritos set %1$I = $2 where %1$I = $1', col)
      using p_origen, p_destino;
  end if;

  execute format(
    'update public.notas n set texto = n.texto || E''\n\n———\n\n'' || o.texto, fusionada = true
       from public.notas o
      where n.%1$I = $2 and o.%1$I = $1 and o.usuario_id = n.usuario_id',
    col) using p_origen, p_destino;
  execute format(
    'delete from public.notas o where o.%1$I = $1
       and exists (select 1 from public.notas n where n.usuario_id = o.usuario_id and n.%1$I = $2)',
    col) using p_origen, p_destino;
  execute format('update public.notas set %1$I = $2 where %1$I = $1', col)
    using p_origen, p_destino;

  -- Cava: sin unicidad, basta con reapuntar los lotes.
  execute format('update public.cava set %1$I = $2 where %1$I = $1', col)
    using p_origen, p_destino;
end
$$;

revoke execute on function public._fusion_mover_personales(text, uuid, uuid) from public, anon;
grant execute on function public._fusion_mover_personales(text, uuid, uuid) to authenticated;
