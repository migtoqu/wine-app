# Tareas pendientes

> Resumen operativo a 2026-11-27, sacado de las sesiones anteriores (orquestación del MVP, plan de trabajos, scope y diseño) y de [ROADMAP.md](./ROADMAP.md).
> El roadmap sigue siendo la lista completa por fases; aquí va solo lo siguiente que hay que hacer, en orden.
> Estado del repo: público desde el 2026-11-26 (#51), así GitHub Actions es gratis y sin límite de minutos.

## 🔴 Bloqueos (te tocan a ti)

- [ ] **Probar en el móvil con sesión iniciada**: Mi cava (`/yo/cava`), la portada nueva y el botón Atrás. Nadie lo ha recorrido aún con una cuenta real.

## 🟠 Siguiente (datos)

- [ ] Ampliar **cobertura de D.O.**: hoy 15 (Penedès, Jerez, Ribeiro, Cava, La Mancha, Jumilla y Somontano añadidas el 2026-11-27). Valdepeñas y Utiel-Requena auditadas y aplazadas: sus webs no tienen directorio con datos. Quedan por auditar las D.O. pequeñas (Calatayud, Campo de Borja, Alicante, Bullas, Yecla…). Rías Baixas sigue dando 403 a nuestro UA.
- [ ] Nombres alternativos de bodega en el buscador (marca vs. razón social).

## ✅ Hecho el 2026-11-27

- **Premios** (#80): tablas `certamenes` y `premios` (migración aplicada), scraper del Concours Mondial de Bruxelles (vinos españoles de 2019 a 2026, mensual) y bloques «Premios» en la ficha de vino y «Premios de sus vinos» en la de bodega. Carga real 2019–2026: 3.840 premios leídos, **468 enlazados** a 297 vinos de 138 bodegas, 3 a revisión y 3.369 pendientes (vino o bodega aún fuera del catálogo; se reintentan cada mes).

- Cooperativa de Cigales y Mazuela: no necesitaban navegador. Adaptadores nuevos (de 0 a 14 vinos en dry-run): en `bodegacigales.es` las fichas están por columnas en las dos páginas de gama Torondos (9 vinos; el «Torondos Verdejo Rueda» va a D.O. Rueda); en `bodegasmazuela.com` `/vinos/` redirige por JavaScript y el nombre solo está en el `<title>` con «Caja de 6» (5 vinos, con añada e imagen). Los adaptadores pueden dar ya la D.O. de una ficha que no trae la sigla. Se cargan en la próxima ejecución de webs.
- AJV sin 429: las ejecuciones del 26 de noviembre leyeron la web entera (7 vinos en la BD, 11 servicios).
- Vinorea confirmada tras el arreglo de PrestaShop 8: la ejecución del 15 de noviembre leyó 114 ofertas sin errores (la del 22 no arrancó por la facturación de Actions, antes de que el repo fuera público).
- **D.O. Penedès**: consejo nuevo (#65) a partir de la tabla de bodegas y del CSV que publica el propio consejo. Carga real: 133 bodegas nuevas (120 con web, 132 con teléfono, todas con CP) y 1 a revisión (Família Torres ~ Selección de Torres). El catálogo pasa a 1.000 bodegas. El crawler de webs del jueves sacará sus vinos.
- **D.O. Jerez**: consejo nuevo (#67) desde el listado único de sherry.wine. Carga real: 64 bodegas nuevas (todas con CP y email, 51 con web), 0 a revisión. El crawler de webs del jueves sacará sus vinos.
- **D.O. Ribeiro**: consejo nuevo (#70) desde el listado de bodegas y colleiteiros de ribeiro.wine y una ficha por bodega (sin razón social ni persona de contacto). Carga real: 88 bodegas nuevas (51 bodegas, 37 colleiteiros), 0 a revisión. El catálogo pasa a 1.152 bodegas.
- **D.O. Cava**: consejo nuevo (#72) desde el listado paginado de cava.wine y una ficha por bodega. Carga real: 71 bodegas nuevas, 62 ya existentes vinculadas a la D.O. Cava (casi todas del Penedès) y 9 a revisión en /admin (Ondarre, Jaume Serra y Marqués de la Concordia parecen la misma bodega). Su aviso legal es el más restrictivo: pedir permiso antes de una fase pública.
- **D.O. La Mancha**: consejo nuevo (#74, #75) desde el directorio de lamanchawines.com, leído por sus sitemaps porque robots.txt prohíbe URLs con «?». Carga real: 179 bodegas nuevas con marcas, 2 a revisión (García Carrión ~ Mayor de Castilla, J. Ramón Lozano ~ Bodegas Lozano) y 41 descartadas: 36 embotelladores de fuera de la región y 5 fichas retiradas. El catálogo pasa a unas 1.400 bodegas.
- **D.O. Jumilla** (#77): 36 bodegas nuevas desde jumilla.wine (Murcia y Albacete), 1 a revisión (García Carrión ~ Mayor de Castilla).
- **D.O. Somontano** (#78): 27 bodegas de dosomontano.com con web, email y visitas (carga real tras el merge).
- Tablero de tareas en vivo (artifact privado, fuente en `docs/tablero/tareas.html`): lo actualiza Claude al empezar y acabar cada tarea.

## ✅ Hecho el 2026-11-26

- Lector Shopify para webs de bodega (`/products.json`): en dry-run las 10 webs Shopify pasan de 63 a 233 vinos (Gran Clos, Trossos del Priorat y Bello Berganzo de 0 a 7, 12 y 4; Murrieta de 1 a 21; García Carrión de 2 a 90). Los vinos de webs de grupo (García Carrión, Marqués del Atrio) con otra D.O. van a revisión como siempre.
- Mi cava: foto de la botella con miniatura (#59).
- Revisión de los vinos de webs de grupo: 19 registros (los 38 ya habían bajado). 5 de Irache asociados a sus fichas; creadas las bodegas Bodegas Sierra Cantabria, Viñedos Sierra Cantabria y Señorío de San Vicente (sin web, para no compartir dominio con Páganos) con sus 12 vinos, y 2 vinos «Colección Privada» de Irache. La próxima carga de webs aplica las decisiones.

## 🟡 Producto — Fase 2

- [ ] Premios y puntuaciones: **hecho** tablas (§6.3), concurso (Concours Mondial de Bruxelles, #80) y bloque en las fichas. **Falta una guía con puntos**: Peñín (tras registro) y Proensa (de pago) no son aptas; siguiente candidata, Premios Zarcillo (oro y plata en PDF). También ocultar premios desde el admin
- [ ] Vinos premiados que no están en el catálogo (3.369 del CMB; en 2026, casi todos de bodegas que sí están): decidir si un certamen puede crear el vino cuando la bodega es inequívoca
- [ ] Reseñas externas (extracto + enlace)
- [ ] Ubicación de referencia guardada del usuario («cerca de mí» ya funciona en `/mapa`)
- [ ] Filtros de tienda, puntuación, premios y servicios (precio ya hecho)
- [ ] Páginas de D.O. y de variedad de uva

## 🟡 Producto — Fase 3

- [ ] Diario de catas con foto (y descontar la botella de Mi cava al catar)
- [ ] Rating 1–5 y media comunitaria
- [ ] Listas personalizadas y compartir por enlace revocable
- [ ] Recomendaciones por reglas en `/yo`
- [ ] Sugerir correcciones / vino o bodega nuevos + moderación en admin
- [ ] RGPD: exportar mis datos y borrar mi cuenta
- [ ] **Reconocimiento de botellas**: hacer una foto con el móvil y que la app identifique la botella. Dos vías posibles para la primera iteración:
  1. OCR: leer el nombre del vino y la bodega en la etiqueta y buscarlos en el buscador.
  2. ML de imagen: buscar la botella más parecida entre las que ya tenemos registradas.

## ⚪ Rendimiento y menores

- [ ] Medir en móvil con sesión iniciada; arranques en frío de Vercel (~1 s) y Supabase Free
- [ ] SMTP propio en Supabase Auth (aplazado)

## Notas de funcionamiento

- Una sesión cada vez; archivarla al acabar.
- Las migraciones a Supabase las aplica una sola sesión cada vez.
- Fase 4 (apertura pública) no prevista: app privada para amigos. El repo es público, la app no.
- No subir emails ni datos personales al código: los admins y las invitaciones viven solo en la BD (`/admin/usuarios`, `/admin/invitaciones`).
