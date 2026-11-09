-- Ola C: consejos reguladores con directorio de bodegas (Toro, Cigales, Bierzo, Priorat, Rueda).
-- Scrapers en scrapers/fuentes/consejos/ (núcleo común + un parser por consejo).
-- Idempotente: `on conflict (slug) do nothing` (no pisa ediciones posteriores). Las D.O. ya están en las semillas.
-- Auditoría (2026-11-08) en docs/SOURCES.md §5.3: todos aptos con condiciones; solo hechos con enlace,
-- sin textos ni imágenes; proyecto privado y sin ánimo de lucro; avisar a cada consejo antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O. Toro',
    'cr-toro',
    'consejo_regulador',
    'https://www.dotoro.com',
    'semanal',
    'robots.txt (2026-11-08): WordPress; solo bloquea /wp-admin/. Se lee /bodegas-y-marcas/ (listado único) '
    'y las fichas /bodegas/<slug>/. Aviso legal: prohíbe reproducir o comunicar contenidos sin autorización; '
    'nada sobre extracción automatizada. Solo datos factuales (contacto, municipio, marcas) con enlace.'
  ),
  (
    'Consejo Regulador D.O. Cigales',
    'cr-cigales',
    'consejo_regulador',
    'https://do-cigales.es',
    'semanal',
    'robots.txt (2026-11-08): WordPress; solo bloquea /wp-admin/. Se lee /bodegas/ (agrupado por municipio) '
    'y las fichas /bodegas/<slug>/. Aviso legal: uso personal y privado, prohibido el uso comercial; '
    'solo datos factuales con enlace, nunca la descripción. Proyecto privado y sin ánimo de lucro.'
  ),
  (
    'Consejo Regulador D.O. Bierzo',
    'cr-bierzo',
    'consejo_regulador',
    'https://www.crdobierzo.es',
    'semanal',
    'robots.txt (2026-11-08): no existe (404 = todo permitido). Se lee /es/bodegas-y-vinos/ y las fichas '
    '/es/bodegas-y-vinos/<slug>/<id>/. Aviso legal sin cláusula de propiedad intelectual. Solo datos factuales; '
    'los nombres de personas de contacto no se guardan.'
  ),
  (
    'Consell Regulador DOQ Priorat',
    'cr-priorat',
    'consejo_regulador',
    'https://www.doqpriorat.org',
    'semanal',
    'robots.txt (2026-11-08): Yoast, Disallow vacío. Se lee /cellers/ (paginado /cellers/page/N) y las fichas '
    '/cellers/<slug>/ (en catalán). Avís legal: prohíbe reproducir o transformar sin consentimiento; nada sobre '
    'extracción. Solo datos factuales; sin la «Descripció» ni nombres de personas.'
  ),
  (
    'Consejo Regulador D.O. Rueda',
    'cr-rueda',
    'consejo_regulador',
    'https://dorueda.com',
    'semanal',
    'robots.txt (2026-11-08): vacío (permite todo). Se lee solo /bodegas/ (tabla única: localidad, nombre, web, '
    'visitable, tienda online); las fichas ?pdb=N devuelven la misma tabla y no se piden. Aviso legal: prohíbe '
    'reproducir contenidos sin autorización. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
