-- D.O. La Mancha: directorio de bodegas del Consejo (scrapers/fuentes/consejos/la-mancha.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `la-mancha` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta con condiciones; solo hechos con enlace,
-- sin textos ni imágenes; avisar al consejo antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O. La Mancha',
    'cr-la-mancha',
    'consejo_regulador',
    'https://lamanchawines.com',
    'semanal',
    'robots.txt (2026-11-27): bloquea /wp-admin/ y toda URL con «?», así que el listado no se pagina: las fichas '
    '/enoturismo/<slug>/ salen de los sitemaps wpbdp_listing-sitemap*.xml. De cada ficha: dirección, CP, población, '
    'provincia, teléfono, web, marcas, enoturismo y tipo (elaboración, crianza, embotellado). Se descartan los '
    'embotelladores de fuera («Otras (embotellado)»). No se leen descripción, logo ni redes. Aviso legal y términos: '
    'reserva de propiedad intelectual sobre contenidos; nada sobre extracción. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
