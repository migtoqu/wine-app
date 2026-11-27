-- D.O.P. Calatayud: fichas de bodegas del Consejo (scrapers/fuentes/consejos/calatayud.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `calatayud` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta; solo hechos con enlace, sin textos ni imágenes.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O.P. Calatayud',
    'cr-calatayud',
    'consejo_regulador',
    'https://www.calatayudwine.com',
    'semanal',
    'robots.txt (2026-11-27): solo bloquea /wp-admin/. Se lee /bodegas/ y una ficha /bodegas/<slug>/ por bodega: '
    'dirección, CP, municipio, teléfono, web y marcas de sus vinos. No se leen descripción ni imágenes. Aviso legal: '
    'sin cláusulas sobre reproducción ni extracción. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
