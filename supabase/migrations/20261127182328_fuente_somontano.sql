-- D.O.P. Somontano: fichas de bodegas del Consejo (scrapers/fuentes/consejos/somontano.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `somontano` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta con condiciones; solo hechos con enlace,
-- sin textos, imágenes ni persona de contacto; avisar al consejo antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O.P. Somontano',
    'cr-somontano',
    'consejo_regulador',
    'https://dosomontano.com',
    'semanal',
    'robots.txt (2026-11-27): Yoast con Disallow vacío; solo bloquea /wp-admin/ y rutas de WooCommerce. Se lee '
    '/listado-bodegas/ y una ficha /bodega/<slug>/ por bodega: dirección, CP, municipio, web, email, teléfono, '
    'visitas, viñedo propio y capacidad. No se leen descripción, imágenes ni persona de contacto. Aviso legal: '
    'prohíbe reproducir contenidos con fines comerciales; nada sobre extracción. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
