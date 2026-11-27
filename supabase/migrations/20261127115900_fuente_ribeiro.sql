-- D.O. Ribeiro: listado de bodegas y colleiteiros del Consejo (scrapers/fuentes/consejos/ribeiro.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `ribeiro` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta con condiciones; solo hechos con enlace,
-- sin textos, imágenes, razón social ni persona de contacto; avisar al consejo antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O. Ribeiro',
    'cr-ribeiro',
    'consejo_regulador',
    'https://www.ribeiro.wine',
    'semanal',
    'robots.txt (2026-11-27): solo bloquea /wp-admin/. Se lee /es/bodegas-y-colleiteiros (bodegas y colleiteiros) '
    'y una ficha por bodega (dirección, ayuntamiento con CP, email, web, teléfono, coordenadas si las hay). No se '
    'leen descripción, razón social ni persona de contacto. Aviso legal (/es/aviso-legal): prohíbe el uso no '
    'autorizado y la reventa; nada sobre extracción. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
