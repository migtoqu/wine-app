-- Fuente: Ruta del Vino Ribera del Duero (enoturismo y directorio de bodegas).
-- Inactiva hasta que el aviso legal de la web (permiso previo por escrito) quede resuelto:
-- mientras `activa = false`, el CLI no ejecuta la fuente salvo en --dry-run.
insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, activa, notas_robots) values
  (
    'Ruta del Vino Ribera del Duero',
    'ruta-vino-ribera',
    'guia',
    'https://rutadelvinoriberadelduero.es',
    'semanal',
    false,
    'PENDIENTE DE AUTORIZACIÓN ESCRITA (aviso legal: reproducción y almacenamiento requieren permiso previo; '
    'contacto info@riberate.com). robots.txt (2026-11-08): bloquea /wp-json/ y /?rest_route=, wc-logs, '
    'wp-admin, wp-includes, plugins y temas: no se usa ninguna API. Solo sitemaps (product-sitemap.xml, '
    'directories-sitemap.xml) y HTML público de /producto/<slug>/ y /directories/<slug>/; solo hechos '
    '(nombre, precio, enlace de reserva, contacto, horario de visitas), nunca textos ni imágenes.'
  )
on conflict (slug) do nothing;
