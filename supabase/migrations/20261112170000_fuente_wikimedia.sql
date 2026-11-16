-- Fuente Wikimedia Commons: fotos de bodega con licencia libre (CC0, dominio público, CC BY,
-- CC BY-SA), enlazadas desde upload.wikimedia.org con autor, licencia y enlace a la ficha del
-- archivo en `imagenes.atribucion`. Scraper en scrapers/fuentes/wikimedia/.
-- Idempotente: `on conflict (slug) do nothing`.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Wikimedia Commons',
    'wikimedia-commons',
    'otra',
    'https://commons.wikimedia.org',
    'mensual',
    'robots.txt (2026-11-12): excluye /w/ (API) y /wiki/Special:; query.wikidata.org excluye /sparql y /bigdata. '
    'Solo se lee el HTML público de /wiki/Category:… (árbol «Wineries in Spain…») y /wiki/File:… (licencia y autor). '
    'Imágenes enlazadas (hotlinking permitido por la Fundación Wikimedia), nunca descargadas; solo licencias libres '
    'y siempre con atribución (autor · licencia · Wikimedia Commons · enlace a la ficha).'
  )
on conflict (slug) do nothing;
