-- Vinorea migró a PrestaShop 8 (~2026-11-11): rutas `/do/<d.o.>/` con `?page=N` y robots.txt nuevo.
-- Solo actualiza las notas de la fuente (SOURCES §4.6). Idempotente.
update public.fuentes
set notas_robots =
  'robots.txt (2026-11-12, PrestaShop 8 por defecto): solo User-agent *; bloquea buscador (?q=), orden (?order=), '
  'carrito, cuenta y directorios del sistema; permite /do/<d.o.>/?page=N y las fichas *.html; ya no bloquea '
  '/aviso-legal. Aviso legal releído el 2026-11-12: la reproducción de contenidos requiere consentimiento; sin '
  'cláusula contra robots. Listados de Ribera, Rioja, Rueda y Bierzo + fichas (JSON-LD y ficha técnica). Solo '
  'hechos; 10-14 s entre peticiones y tope de 700 por ejecución. Imágenes solo enlazadas.'
where slug = 'vinorea';
