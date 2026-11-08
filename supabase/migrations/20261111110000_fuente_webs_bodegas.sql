-- Fuente madre del crawler de webs oficiales de bodegas (scrapers/fuentes/webs-bodegas).
--
-- Cada web rastreada tiene además su propia fila en public.fuentes, que crea el
-- scraper con la service role: slug `web-<dominio>`, tipo 'bodega' (web
-- oficial, la de más rango tras el admin), url_base = la web de la bodega y en
-- notas_robots el resultado de la puerta legal (veredicto, motivo y fecha). Así
-- la ficha atribuye campos y resúmenes a la web de cada bodega, y el admin
-- puede apagar un sitio con `activa = false` (el scraper nunca lo reactiva).
-- Las ejecuciones (ejecuciones_scraper) se registran en esta fuente madre, una
-- por lote de la matriz del workflow.
insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Webs oficiales de bodegas',
    'webs-bodegas',
    'bodega',
    'https://github.com/migtoqu/wine-app/tree/main/scrapers/fuentes/webs-bodegas',
    'semanal',
    'Crawler genérico (WordPress, WooCommerce Store API, sitemap y HTML) de las webs de bodegas.web. '
    'Puerta por sitio: lista de exclusión manual (exclusiones.json), 401/403/429 y desafíos anti-bot, '
    'robots.txt (Content-Signal search=no bloquea; ai-train/ai-input=no y noai se registran) y '
    'cláusulas del aviso legal contra robots/crawlers/scraping/minería de datos. Solo hechos atómicos '
    'y resúmenes propios por plantilla; nunca se copia texto. El veredicto de cada sitio está en su '
    'propia fuente (slug web-<dominio>).'
  )
on conflict (slug) do nothing;
