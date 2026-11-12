-- Ola B del comparador: tiendas Vinatis y Vinorea (scraper en scrapers/fuentes/tiendas/; SOURCES §4.6).
-- Una fila en `fuentes` y otra en `tiendas` por tienda. Idempotente: no pisa ediciones del admin.
-- Descartadas en el audit del 2026-11-10: Vila Viniteca, Mariskal y Coalla Gourmet (ver SOURCES).

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Vinatis',
    'vinatis',
    'tienda',
    'https://www.vinatis.es',
    'semanal',
    'robots.txt (2026-11-10; /robots.txt redirige a /robots_es.txt): solo declara el sitemap, todo permitido. '
    'Condiciones generales (/condiciones-generales, releídas el 2026-11-10): sin cláusula contra robots ni '
    'extracción. Se leen solo los listados de D.O. (Ribera, Rioja, Bierzo), cuyo JSON product_elastic trae '
    'nombre, bodega, D.O., color, añada, uvas, grado, formato, precio y stock; no se piden fichas ni se leen '
    'las notas de cata. 10-14 s entre peticiones y tope de 60 por ejecución. Imágenes solo enlazadas.'
  ),
  (
    'Vinorea',
    'vinorea',
    'tienda',
    'https://www.vinorea.com',
    'semanal',
    'robots.txt (2026-11-10): PrestaShop por defecto; permite categorías con ?p=N y fichas *.html; bloquea '
    'buscador, carrito, cuenta y también /*aviso-legal y /*terminos-y-condiciones (no se piden con el bot). '
    'Aviso legal leído el 2026-11-08: la reproducción de contenidos requiere consentimiento; sin cláusula '
    'contra robots. Listados de Ribera, Rioja y Rueda + fichas (microdatos y ficha técnica). Solo hechos; '
    '10-14 s entre peticiones y tope de 700 por ejecución. Imágenes solo enlazadas.'
  )
on conflict (slug) do nothing;

insert into public.tiendas (nombre, slug, tipo, web, fuente_id)
select f.nombre, f.slug, 'especializada', f.url_base, f.id
from public.fuentes f
where f.slug in ('vinatis', 'vinorea')
on conflict do nothing;
