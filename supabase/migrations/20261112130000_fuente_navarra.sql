-- Fuente C.R.D.O. Navarra (navarrawine.com): bodegas, vinos y experiencias de enoturismo.
-- Scraper en scrapers/fuentes/consejos/navarra/ (guardado compartido con Rioja).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `navarra` ya está en las semillas.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consejo Regulador D.O. Navarra',
    'cr-navarra',
    'consejo_regulador',
    'https://navarrawine.com',
    'semanal',
    'robots.txt (2026-11-08): WordPress; solo bloquea /wp-admin/ y /wp-content/uploads/wpforms/. Se recorren '
    'sitemap_index.xml (bodegas-, vinos- y experiencias-sitemap) y /bodegas-navarra/ (zona). La REST no expone los '
    'campos (acf vacío): se lee el HTML. Aviso legal: prohíbe reproducir o comunicar contenidos sin autorización; '
    'solo datos factuales con enlace, sin descripciones ni imágenes. Avisar al Consejo antes de la fase pública.'
  )
on conflict (slug) do nothing;
