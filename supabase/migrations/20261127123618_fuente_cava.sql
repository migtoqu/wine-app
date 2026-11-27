-- D.O. Cava: listado de bodegas del Consejo (scrapers/fuentes/consejos/cava.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `cava` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: el aviso legal más restrictivo hasta ahora (solo copias
-- privadas); se guardan solo hechos con enlace, sin textos ni logos. Pedir permiso antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O. Cava',
    'cr-cava',
    'consejo_regulador',
    'https://www.cava.wine',
    'semanal',
    'robots.txt (2026-11-27): Allow /, solo bloquea /jp/. Se lee /es/bodegas/?page=N (nombre, municipio, zona) y '
    'una ficha por bodega (contacto, dirección, CP, enoturismo, tienda online, tipos de cava). No se leen '
    'descripción ni logos. Aviso legal: solo copias privadas no cedidas a terceros ni instaladas en servidores; '
    'se guardan solo hechos con enlace (proyecto privado). Pedir permiso al consejo antes de cualquier fase pública.'
  )
on conflict (slug) do nothing;
