-- Espacio personal (SCOPE §5.6, §6.5): favoritos y notas privadas.
--
-- Cada fila apunta a exactamente una entidad del catálogo (FK real con
-- on delete cascade: si desaparece el vino, la añada o la bodega, se van con
-- ellas). RLS: cada usuario solo ve y modifica las suyas; anon no tiene acceso.
--
-- Unicidad con `nulls not distinct` (PG15+) en vez de índices parciales, para
-- que `upsert(..., { onConflict })` de PostgREST pueda usarla como destino.

-- =====================================================================
-- Favoritos
-- =====================================================================

create table public.favoritos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  vino_id     uuid references public.vinos (id) on delete cascade,
  bodega_id   uuid references public.bodegas (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint favoritos_entidad_check check (num_nonnulls(vino_id, bodega_id) = 1),
  constraint favoritos_usuario_entidad_key
    unique nulls not distinct (usuario_id, vino_id, bodega_id)
);

create index favoritos_usuario_id_created_at_idx on public.favoritos (usuario_id, created_at desc);
-- Soportan la cascada al borrar un vino o una bodega.
create index favoritos_vino_id_idx   on public.favoritos (vino_id)   where vino_id is not null;
create index favoritos_bodega_id_idx on public.favoritos (bodega_id) where bodega_id is not null;

-- =====================================================================
-- Notas privadas
-- =====================================================================

create table public.notas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  vino_id     uuid references public.vinos (id) on delete cascade,
  anada_id    uuid references public.anadas (id) on delete cascade,
  bodega_id   uuid references public.bodegas (id) on delete cascade,
  texto       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notas_entidad_check check (num_nonnulls(vino_id, anada_id, bodega_id) = 1),
  constraint notas_texto_check check (btrim(texto) <> '' and char_length(texto) <= 5000),
  -- Una nota por usuario y entidad (se edita, no se acumulan).
  constraint notas_usuario_entidad_key
    unique nulls not distinct (usuario_id, vino_id, anada_id, bodega_id)
);

create index notas_usuario_id_updated_at_idx on public.notas (usuario_id, updated_at desc);
create index notas_vino_id_idx   on public.notas (vino_id)   where vino_id is not null;
create index notas_anada_id_idx  on public.notas (anada_id)  where anada_id is not null;
create index notas_bodega_id_idx on public.notas (bodega_id) where bodega_id is not null;

create trigger set_updated_at before update on public.notas
  for each row execute function public.set_updated_at();

-- =====================================================================
-- RLS: cada usuario solo lo suyo
-- =====================================================================

alter table public.favoritos enable row level security;
alter table public.notas     enable row level security;

revoke all on public.favoritos, public.notas from anon, authenticated;

-- Favoritos: se crean y se borran, no se editan.
grant select, insert, delete on public.favoritos to authenticated;

create policy "propio lee" on public.favoritos
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "propio inserta" on public.favoritos
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "propio borra" on public.favoritos
  for delete to authenticated using (usuario_id = (select auth.uid()));

-- Notas: solo el texto es editable (ni dueño ni entidad pueden cambiar).
grant select, insert, delete on public.notas to authenticated;
grant update (texto) on public.notas to authenticated;

create policy "propia lee" on public.notas
  for select to authenticated using (usuario_id = (select auth.uid()));
create policy "propia inserta" on public.notas
  for insert to authenticated with check (usuario_id = (select auth.uid()));
create policy "propia actualiza" on public.notas
  for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "propia borra" on public.notas
  for delete to authenticated using (usuario_id = (select auth.uid()));
