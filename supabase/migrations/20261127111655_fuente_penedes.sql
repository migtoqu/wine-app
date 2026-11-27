-- D.O. Penedès: consejo con directorio de bodegas y CSV oficial (scrapers/fuentes/consejos/penedes.ts).
-- Idempotente: `on conflict (slug) do nothing`. La D.O. `penedes` ya está en las semillas.
-- Auditoría (2026-11-27) en docs/SOURCES.md §5.3: apta con condiciones; solo hechos con enlace,
-- sin textos ni imágenes; proyecto privado y sin ánimo de lucro; avisar al consejo antes de la fase pública.

insert into public.fuentes (nombre, slug, tipo, url_base, frecuencia, notas_robots) values
  (
    'Consell Regulador D.O. Penedès',
    'cr-penedes',
    'consejo_regulador',
    'https://dopenedes.cat',
    'semanal',
    'robots.txt (2026-11-27): Disallow vacío (permite todo). Se leen /es/bodegas/ (tabla: id de ficha, nombre, '
    'municipio, venta online, WineBar) y el CSV que publica el propio consejo, /llistat_cellers.php (dirección, CP, '
    'municipio, teléfono, web, email). No se piden las fichas ?id=N. Aviso legal: reproducir o comunicar '
    'contenidos requiere consentimiento; nada sobre extracción. Solo datos factuales con enlace.'
  )
on conflict (slug) do nothing;
