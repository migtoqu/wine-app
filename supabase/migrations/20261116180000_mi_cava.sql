-- Mi cava (SCOPE §5.6, §6.5): botellas que el usuario tiene en casa.
--
-- Cada fila es un lote: un vino (y añada) con su cantidad, formato, compra,
-- ubicación y ventana de consumo. El vino puede no estar en el catálogo:
-- `nombre` y `bodega_nombre` guardan siempre una copia del texto, así que el
-- lote sobrevive aunque el vino se borre (FK on delete set null) y sirve para
-- vinos que aún no tenemos. Con cantidad 0 el lote queda como «bebido».
--
-- RLS de solo-propietario, como favoritos y notas. La fusión de duplicados
-- reapunta los lotes al vino/añada que queda (_fusion_mover_personales).

create table public.cava (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vino_id        uuid references public.vinos (id) on delete set null,
  anada_id       uuid references public.anadas (id) on delete set null,
  nombre         text not null,
  bodega_nombre  text,
  anio           smallint,            -- añada; null = sin añada o desconocida
  cantidad       integer not null default 1,
  formato_ml     integer not null default 750,
  precio_compra  numeric(10, 2),      -- € por botella
  fecha_compra   date,
  tienda         text,                -- dónde se compró
  ubicacion      text,                -- dónde está en casa (botellero, armario…)
  beber_desde    smallint,
  beber_hasta    smallint,
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cava_nombre_check        check (btrim(nombre) <> '' and char_length(nombre) <= 200),
  constraint cava_bodega_check        check (char_length(bodega_nombre) <= 200),
  constraint cava_anio_check          check (anio between 1800 and 2200),
  constraint cava_cantidad_check      check (cantidad between 0 and 9999),
  constraint cava_formato_check       check (formato_ml between 50 and 30000),
  constraint cava_precio_check        check (precio_compra >= 0 and precio_compra < 1000000),
  constraint cava_tienda_check        check (char_length(tienda) <= 120),
  constraint cava_ubicacion_check     check (char_length(ubicacion) <= 120),
  constraint cava_beber_desde_check   check (beber_desde between 1800 and 2200),
  constraint cava_beber_hasta_check   check (beber_hasta between 1800 and 2200),
  constraint cava_ventana_check       check (beber_desde is null or beber_hasta is null or beber_hasta >= beber_desde),
  constraint cava_notas_check         check (char_length(notas) <= 2000)
);

create index cava_usuario_id_updated_at_idx on public.cava (usuario_id, updated_at desc);
-- Soportan el set null al borrar un vino o una añada y la fusión.
create index cava_vino_id_idx  on public.cava (vino_id)  where vino_id is not null;
create index cava_anada_id_idx on public.cava (anada_id) where anada_id is not null;

create trigger set_updated_at before update on public.cava
  for each row execute function public.set_updated_at();

alter table public.cava enable row level security;

revoke all on public.cava from anon, authenticated;
grant select, insert, update, delete on public.cava to authenticated;

create policy "propia lee" on public.cava
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "propia inserta" on public.cava
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "propia actualiza" on public.cava
  for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "propia borra" on public.cava
  for delete to authenticated using (usuario_id = (select auth.uid()));

-- =====================================================================
-- Fusión: los lotes de la cava también pasan al vino/añada que queda
-- =====================================================================
-- Igual que en 20261110090000_consolidacion.sql, más la cava al final.

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
  if p_tipo <> 'bodega' then
    execute format('update public.cava set %1$I = $2 where %1$I = $1', col)
      using p_origen, p_destino;
  end if;
end
$$;

revoke execute on function public._fusion_mover_personales(text, uuid, uuid) from public, anon;
grant execute on function public._fusion_mover_personales(text, uuid, uuid) to authenticated;
