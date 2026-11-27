-- D.O. Empordà: fichas de cellers del Consell (scrapers/fuentes/consejos/emporda.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `emporda` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta con condiciones; solo hechos con enlace,
-- sin textos ni imágenes; avisar al consejo antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consell Regulador D.O. Empordà',
    'cr-emporda',
    'consejo_regulador',
    'https://www.doemporda.cat',
    'semanal',
    'robots.txt (2026-11-27): no existe (404, todo permitido). Se lee /ca/els-cellers.html y una ficha '
    '/ca/els-cellers/l/<id>-<slug>.html por celler: dirección, CP, municipio, teléfono, web, coordenadas, '
    'hectáreas, variedades, tipos de vino y marcas. No se leen descripción ni logo. Avís legal: los contenidos '
    'pertenecen al Consell; prohíbe el framing; nada sobre extracción. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
