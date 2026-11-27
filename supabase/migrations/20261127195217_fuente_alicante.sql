-- D.O.P. Alicante: bodegas certificadas del Consejo (scrapers/fuentes/consejos/alicante.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `alicante` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta; solo nombre, web y comarca con enlace.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O.P. Alicante',
    'cr-alicante',
    'consejo_regulador',
    'https://vinosalicantedop.org',
    'semanal',
    'robots.txt (2026-11-27): solo bloquea /wp-admin/ y rutas de WooCommerce. Se lee solo '
    '/conoce-las-bodegas-con-dop-alicante/ (una petición): nombre, web y comarca de cada bodega certificada. No hay '
    'fichas ni direcciones. Una web compartida por varias bodegas (grupo) no se asigna a ninguna. Aviso legal: sin '
    'cláusulas sobre reproducción ni extracción. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
