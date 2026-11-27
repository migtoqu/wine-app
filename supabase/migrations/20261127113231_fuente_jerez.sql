-- D.O. Jerez-Xérès-Sherry: listado de bodegas del Consejo (scrapers/fuentes/consejos/jerez.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `jerez-xeres-sherry` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta con condiciones; solo hechos con enlace,
-- sin textos ni imágenes; proyecto privado y sin ánimo de lucro; avisar al consejo antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O. Jerez-Xérès-Sherry y Manzanilla-Sanlúcar de Barrameda',
    'cr-jerez',
    'consejo_regulador',
    'https://www.sherry.wine',
    'semanal',
    'robots.txt (2026-11-27): solo bloquea /admin/ y URLs sueltas. Se lee /sherry-wine/bodegas/bodegas-listing '
    '(página única: nombre, razón social, dirección, CP, email, web) y sus pestañas ?t=crianza-y-expedicion y '
    '?t=crianza-y-almacenista para el tipo de registro; no se piden las fichas. Aviso legal (/es/legal): prohíbe '
    'reproducir contenidos sin consentimiento; nada sobre extracción. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
