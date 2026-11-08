-- Fuente Vinopremier (tienda Magento; SOURCES §4.1). Idempotente: no pisa ediciones del admin.
insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Vinopremier',
    'vinopremier',
    'tienda',
    'https://vinopremier.com',
    'semanal',
    'robots.txt (2026-11-08): permite las categorías /vinos/denominaciones/* con ?p=N y las fichas *.html; '
    'prohíbe /checkout/, /customer/, /catalogsearch/, /catalog/product/view/, /ajax/ y queries price=, '
    'vp_bodega=, vp_do=, vp_pais=. Sin Crawl-delay. Condiciones de uso (/condiciones-de-venta): no prohíben '
    'la extracción; reservan textos, gráficos y diseños. Solo hechos; imágenes solo enlazadas.'
  )
on conflict (slug) do nothing;
