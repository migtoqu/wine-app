# Tareas pendientes

> Resumen operativo a 2026-11-17, sacado de las sesiones anteriores (orquestación del MVP, plan de trabajos, scope y diseño) y de [ROADMAP.md](./ROADMAP.md).
> El roadmap sigue siendo la lista completa por fases; aquí va solo lo siguiente que hay que hacer, en orden.
> Estado del repo: `main` en `9899ee9` (#49), sin PR abiertas.

## 🔴 Bloqueos (te tocan a ti)

- [ ] **Facturación de GitHub Actions.** Todos los workflows (CI y scrapers programados) fallan en ~3 s desde el 17-11. Hasta resolverlo no corre ningún scraper y los 276 vinos nuevos de la ola D (#49) no entran en el catálogo. Arreglarlo en GitHub → Settings → Billing.
- [ ] **Dominio Lubiano** en `/admin/bodegas`: renombrar «Velvety Wines» → «Dominio Lubiano», web `https://dominiolubiano.com`, y borrar su vino falso «Laon Wine House» (es el nombre de la plantilla de su web).
- [ ] **Probar en el móvil con sesión iniciada**: Mi cava (`/yo/cava`), la portada nueva y el botón Atrás. Nadie lo ha recorrido aún con una cuenta real.

## 🟠 Siguiente (datos)

- [ ] Tras desbloquear Actions: lanzar la carga de webs de bodegas y revisar en `/admin/revision` los 38 vinos de webs compartidas por varias bodegas (Sierra Cantabria / Teso La Monja, Pago de Cirsus…).
- [ ] Lector para webs de bodega en **Shopify** (6 webs que hoy no dan vinos), en PR aparte.
- [ ] Webs que necesitan **navegador** (render JS): cooperativa de Cigales y Mazuela.
- [ ] **AJV**: devolvió 429 en la última prueba; revisar ritmo y reintentar.
- [ ] **Vinorea**: listados vacíos desde Actions (adaptado a PrestaShop 8 en #37); confirmar en la próxima ejecución.
- [ ] Test intermitente `scrapers/emparejamiento/evaluar.test.ts` («catálogo de bodegas contra sí mismo»): pasa de 5 s con la suite en paralelo. Subir su timeout o aligerarlo.
- [ ] Ampliar **cobertura de D.O.**: hoy 8; faltan Rías Baixas, Ribeiro, Penedès, Cava, Somontano, Jumilla, La Mancha, Jerez…
- [ ] Nombres alternativos de bodega en el buscador (marca vs. razón social).

## 🟡 Producto — Fase 2

- [ ] Premios y puntuaciones: tablas (§6.3) y scraper de una guía y un concurso
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

## ⚪ Rendimiento y menores

- [ ] Medir en móvil con sesión iniciada; arranques en frío de Vercel (~1 s) y Supabase Free
- [ ] SMTP propio en Supabase Auth (aplazado)
- [ ] Hacer público el repositorio (auditoría de secretos hecha; falta cambiar visibilidad) — solo si se decide

## Notas de funcionamiento

- Una sesión cada vez; archivarla al acabar.
- Las migraciones a Supabase las aplica una sola sesión cada vez.
- Fase 4 (apertura pública) no prevista: app privada para amigos.
