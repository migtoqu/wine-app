-- Ocho consejos cuyos dominios reales se localizaron el 2026-11-27 (scrapers/fuentes/consejos/<x>.ts).
-- Idempotente: `on conflict (slug) do nothing`. Las D.O. ya están en las semillas.
-- Auditoría en docs/SOURCES.md §5.3. Avisos legales: cláusulas genéricas de propiedad intelectual; solo
-- datos factuales con enlace, nunca descripciones ni imágenes.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  ('Consejo Regulador D.O. Costers del Segre', 'cr-costers-segre', 'consejo_regulador', 'https://costersdelsegre.es', 'semanal',
   'robots.txt (2026-11-27): solo rutas de Drupal (/admin/, /user/…). Se leen /ca/cellers y ?page=N (6 por página) y cada ficha '
   '/ca/cellers/<slug>: dirección, web, teléfono, email, visitas y nombres de vinos. Aviso legal: reproducción con autorización '
   'escrita; solo hechos con enlace.'),
  ('Consejo Regulador D.O. Monterrei', 'cr-monterrei', 'consejo_regulador', 'https://www.domonterrei.wine', 'semanal',
   'robots.txt (2026-11-27): sin bloqueos. Se leen /bodegas/ y cada ficha /bodegas/<slug>/: dirección, teléfono, email, web, '
   'variedades y marcas comerciales. Nunca la persona de contacto.'),
  ('Consejo Regulador D.O.P. Bullas', 'cr-bullas', 'consejo_regulador', 'https://vinosdebullas.es', 'semanal',
   'robots.txt (2026-11-27): solo /cms/wp-admin/. Se lee solo /bodegas/ (una petición): nombre, dirección, coordenadas, teléfono, '
   'web y tienda. El email está ofuscado por script y no se lee; tampoco el responsable. Aviso legal: reproducción con '
   'autorización; solo hechos con enlace.'),
  ('Consejo Regulador D.O. Arlanza', 'cr-arlanza', 'consejo_regulador', 'https://arlanza.org', 'semanal',
   'robots.txt (2026-11-27): solo /wp-admin/. Se leen /bodegas-y-productores/ (razón social y municipio) y cada ficha '
   '/bodegas-productores/<slug>/: ubicación, email, teléfono y web. Una ubicación en otra ciudad es la sede social '
   '(extra.direccion_contacto). Aviso legal: prohíbe reproducción y almacenaje con fin público o comercial; app privada, solo '
   'hechos con enlace; pedir permiso antes de una fase pública.'),
  ('Consejo Regulador D.O. León', 'cr-leon', 'consejo_regulador', 'https://doleon.es', 'semanal',
   'robots.txt (2026-11-27): solo /wp-json/ y ?rest_route=. Se leen /bodegas/ (entradas de la categoría Bodegas DO León) y cada '
   'entrada: dirección, email, teléfono, web y referencias (marcas). Nunca la persona de contacto. Aviso legal: prohíbe la '
   'explotación sin autorización; app privada, solo hechos con enlace; pedir permiso antes de una fase pública.'),
  ('Consejo Regulador D.O.P. Yecla', 'cr-yecla', 'consejo_regulador', 'https://yeclavino.com', 'semanal',
   'robots.txt (2026-11-27): solo /wp-admin/. Se leen /bodegas/ y cada ficha /bodega/<slug>/: dirección, email y web. El '
   'teléfono es el mismo en todas las fichas (plantilla) y no se lee. Aviso legal: reproducción con autorización escrita; solo '
   'hechos con enlace.'),
  ('Consejo Regulador D.O. Binissalem', 'cr-binissalem', 'consejo_regulador', 'https://binissalemdo.com', 'semanal',
   'robots.txt (2026-11-27): sin bloqueos relevantes. Se leen /es/bodegas-do-binissalem/ (nombre y municipio) y cada ficha: '
   'dirección, teléfono, email y web del bloque «Contacto bodega».'),
  ('Consejo Regulador D.O.P. Cariñena', 'cr-carinena', 'consejo_regulador', 'https://carinenawines.com', 'semanal',
   'robots.txt (2026-11-27): solo /wp-admin/. Web actual del consejo (docarinena.com se perdió y elvinodelaspiedras.es redirige '
   'aquí). Se leen /bodegas/ y cada ficha /bodegas/<slug>/: municipio, dirección, teléfono, email, web y si es visitable. Aviso '
   'legal: prohíbe la copia sin autorización; app privada, solo hechos con enlace; pedir permiso antes de una fase pública.')
on conflict (slug) do nothing;
