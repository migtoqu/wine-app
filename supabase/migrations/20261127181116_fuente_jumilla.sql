-- D.O.P. Jumilla: fichas de bodegas del Consejo (scrapers/fuentes/consejos/jumilla.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `jumilla` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta con condiciones; solo hechos con enlace,
-- sin textos ni imágenes; avisar al consejo antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O.P. Jumilla',
    'cr-jumilla',
    'consejo_regulador',
    'https://jumilla.wine',
    'semanal',
    'robots.txt (2026-11-27): vacío (todo permitido). Se lee /nuestras-bodegas/ y una ficha /bodegas_cpt/<slug>/ '
    'por bodega: municipio, dirección, CP, teléfono, web, tienda y email. No se leen descripción ni imágenes. Aviso '
    'legal: prohíbe reproducir contenidos sin autorización y el uso comercial; nada sobre extracción. Solo datos '
    'factuales con enlace.'
  )
on conflict (slug) do nothing;
