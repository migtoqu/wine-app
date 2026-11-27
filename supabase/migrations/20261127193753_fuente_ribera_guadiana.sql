-- D.O. Ribera del Guadiana: fichas de bodegas del Consejo (scrapers/fuentes/consejos/ribera-guadiana.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `ribera-del-guadiana` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: aviso legal como el de Cava (solo copias privadas);
-- se guardan solo hechos con enlace. Pedir permiso al consejo antes de cualquier fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O. Ribera del Guadiana',
    'cr-ribera-guadiana',
    'consejo_regulador',
    'https://riberadelguadiana.eu',
    'semanal',
    'robots.txt (2026-11-27): bloquea /wp-admin/, /xmlrpc.php y ficheros sueltos. Se lee /bodegas/ (la página 2 '
    'repite las mismas fichas) y una ficha /bodegas/<slug>/ por bodega: dirección, CP, teléfono, email, web y los '
    'nombres de sus vinos (como marcas). No se leen descripción, imágenes ni certificados. Aviso legal: solo copias '
    'privadas no cedidas ni instaladas en servidores; se guardan solo hechos con enlace (proyecto privado). Pedir '
    'permiso al consejo antes de cualquier fase pública.'
  )
on conflict (slug) do nothing;
