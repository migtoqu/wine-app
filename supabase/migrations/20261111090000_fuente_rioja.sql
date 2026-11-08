-- Fuente C.R. DOCa Rioja (riojawine.com): bodegas, vinos y experiencias de enoturismo.
-- Idempotente: `on conflict (slug) do nothing` (no pisa ediciones posteriores). La D.O. `rioja` ya está en las semillas.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador DOCa Rioja',
    'cr-rioja',
    'consejo_regulador',
    'https://riojawine.com',
    'semanal',
    'robots.txt (2026-11-08): WordPress/Yoast; solo bloquea /wp-includes/, /cgi-bin/, /wp-content/plugins/, '
    '/wp-content/themes/ y /wp-admin/, más herramientas de copia (HTTrack, WebCopier…); sin Crawl-delay. '
    'Se recorre sitemap-es-es.xml (/es/bodegas-rioja/, /es/vinos-rioja/, /es/experiencia/). '
    'Aviso legal: prohíbe copiar sin autorización y el uso comercial; solo datos factuales con enlace, '
    'sin textos ni imágenes. Proyecto privado y sin ánimo de lucro; avisar al Consejo antes de la fase pública.'
  )
on conflict (slug) do nothing;
