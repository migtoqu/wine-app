-- Mi cava: foto de la botella en cada lote.
--
-- La imagen vive en un bucket privado de Storage (`cava-fotos`) bajo la
-- carpeta del usuario: `<usuario_id>/<lote_id>-<aleatorio>.jpg`. La fila solo
-- guarda la ruta; la app firma URLs temporales para mostrarla. El navegador
-- reduce la foto (≈1200 px, JPEG) antes de enviarla, así que 2 MB sobra.

alter table public.cava
  add column foto_path text,
  add constraint cava_foto_path_check check (char_length(foto_path) <= 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cava-fotos', 'cava-fotos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Cada usuario solo ve y toca los ficheros de su carpeta.
create policy "cava fotos propia lee" on storage.objects
  for select to authenticated
  using (bucket_id = 'cava-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cava fotos propia sube" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cava-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cava fotos propia actualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'cava-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'cava-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cava fotos propia borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cava-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
