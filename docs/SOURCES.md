# Fuentes de datos del MVP: auditoría de `robots.txt` y términos

> Auditoría realizada el 2026-11-07 con peticiones mínimas (≈ 25 en total, 3 s entre ellas, UA identificable). Responde a la tarea de la Fase 0 del roadmap y a la decisión §12.1 de [SCOPE.md](./SCOPE.md). No es asesoramiento jurídico.

## Resumen

| Fuente | Qué aporta | Veredicto |
| --- | --- | --- |
| **C.R. D.O. Ribera del Duero** (`www.riberadelduero.es`) | Listado oficial de bodegas + ficha de contacto | **Apta con condiciones** |
| **Vinoselección** (`www.vinoseleccion.com`) | Vinos, añada, precio, imagen, cata | **Apta con condiciones** (técnicamente la más delicada) |

Ninguna prohíbe el rastreo en `robots.txt` para las rutas que necesitamos, ninguna menciona el scraping en su aviso legal y ninguna declara `Crawl-delay`. Ambas reservan todos los derechos de autor sobre textos, imágenes y bases de datos. Por eso las condiciones comunes son:

1. Guardar **solo datos factuales** (nombre, dirección, teléfono, web, precio, añada, formato, variedades). **No copiar** descripciones largas ni imágenes: las imágenes se enlazan (SCOPE §7.3, §12.9) y las descripciones propias se escriben o se enlazan a la fuente.
2. Citar la fuente y enlazar a la ficha original en cada registro.
3. Respetar `robots.txt` **en cada ejecución** (descargarlo y evaluarlo antes de rastrear; abortar si cambia a algo que nos excluya).
4. Mantener un canal de contacto en el UA y retirar los datos si la fuente lo pide.

### Discrepancia de volumen con SCOPE.md

SCOPE §12.2 prevé **~2.000 vinos**. En Vinoselección la categoría D.O. Ribera del Duero tiene solo **≈ 350 vinos** (ver más abajo), así que con estas dos fuentes el MVP quedaría en ~300 bodegas / ~350 vinos. Para llegar a 2.000 hay que ampliar a otras D.O. (Vinoselección ya trae ~3.350 productos en total) o a una segunda tienda. Es una decisión de alcance para el orquestador, no un bloqueo técnico.

---

## 1. Consejo Regulador D.O. Ribera del Duero

- Web oficial: <https://www.riberadelduero.es/> (el dominio sin `www` redirige 301 a `www`; el sitemap sí usa el dominio sin `www`, así que hay que normalizar el host).
- CMS: **Drupal** (HTML renderizado en servidor; **no hace falta navegador headless**).

### `robots.txt`

`https://www.riberadelduero.es/robots.txt` es el estándar de Drupal. Para `User-agent: *`:

- Prohíbe `/core/`, `/profiles/`, `/admin/`, `/search/`, `/node/add/`, `/user/*`, `/comment/reply/`, `/filter/tips`.
- **No prohíbe** `/bodegas/` ni `/bodegas/resultados`.
- Sin `Crawl-delay`. Sin línea `Sitemap:` (el sitemap está en `/sitemap.xml`).

### Términos de uso (aviso legal: `/aviso-legal`)

- Contenido, diseño gráfico y código son del Consejo Regulador. Prohíbe la reproducción, distribución, comunicación pública y transformación sin autorización expresa (cita: «queda prohibida su reproducción, distribución, comunicación pública, transformación»).
- No menciona rastreo automático, scraping ni reutilización del listado de bodegas.
- Interpretación: los datos de contacto de una empresa (nombre, dirección, teléfono, web) son hechos públicos y su extracción para un directorio con enlace a la fuente es de riesgo bajo. Copiar los textos de presentación de cada bodega o sus fotos **sí** infringiría la reserva de derechos.

### Rutas útiles

| Qué | URL de ejemplo |
| --- | --- |
| Listado paginado | `https://www.riberadelduero.es/bodegas/resultados?termino=&page=0` … `page=25` |
| Ficha de bodega | `https://www.riberadelduero.es/bodegas/aalto-bodegas-y-vinedos` |
| Sitemap | `https://www.riberadelduero.es/sitemap.xml` (1.648 URLs, generado con Screaming Frog en 2025-01; incluye ~600 rutas `/bodegas/<slug>` bajo el host sin `www`, con duplicados y datos desactualizados: usarlo solo como contraste, no como fuente de verdad) |

**Recomendación:** recorrer el listado `?page=0..N` (N = página «Última» del paginador, hoy 25) y recoger los enlaces `/bodegas/<slug>`; luego pedir cada ficha. No usar el parámetro `termino` con texto (la ruta de búsqueda propia podría considerarse búsqueda interna).

### Volumen

26 páginas × 12 bodegas ≈ **312 bodegas**. Coincide con la estimación (~300). Total ≈ 26 + 312 = **~340 peticiones** por ejecución semanal.

### Estructura de datos observada

**Listado** (`/bodegas/resultados`): `ul.bodegas__list > li.views-row`, con `h3.bodega--title > a[href="/bodegas/<slug>"]` (nombre) y miniatura en `.bodega--picture img` (no copiar). Paginador: `li.pager__item--last a[href*="page="]`.

**Ficha** (`/bodegas/<slug>`): no hay JSON-LD ni API. Selectores:

| Campo | Selector |
| --- | --- |
| Nombre | `h1` |
| Descripción | `.field--name-body` (texto reservado: no copiar, solo enlazar) |
| Dirección | `.views--field__address` → `.address-line1`, `.postal-code`, `.locality`, `.administrative-area`, `.country` |
| Email | `.views--field__email` (texto tras `<strong>`) |
| Teléfono | `.views--field__tel a[href^="tel:"]` |
| Web | `.views--field__web a[href]` |
| Venta online | `.views--field__venta` (a menudo vacío) |
| Marcas | bloque «Marcas» tras «Datos de la sociedad» (lista de marcas de la bodega) |
| Coordenadas | iframe `.geofield-embed-google-map iframe[src]`, parámetro `q=<lat>%2C<lng>` (extraer lat/lng del `src`; **no reutilizar la clave de Google Maps** que lleva esa URL) |

### Campos frente al esquema (SCOPE §6.1, tabla `bodegas`)

| Esquema | ¿Disponible? |
| --- | --- |
| nombre | Sí |
| slug | Derivable (el slug de la fuente incluye forma societaria: `…-sl`; generar uno propio) |
| descripción | Sí, pero reservada: no copiar |
| dirección, municipio, provincia, comunidad | Sí (comunidad = Castilla y León, derivable) |
| ubicación PostGIS | Sí (del iframe del mapa) |
| web, teléfono, email | Sí (email en algunas fichas) |
| redes sociales | No |
| año de fundación, hectáreas | Solo dentro del texto libre (no estructurado) |
| estado | No |
| vínculo bodega ⇄ D.O. | Implícito (todas son Ribera del Duero) |

### Riesgos

- Reserva de derechos sobre textos e imágenes (mitigado guardando solo hechos).
- Sitemap y HTML cambian sin aviso al ser Drupal personalizado: los selectores `views--field__*` son estables pero conviene tests con una ficha guardada como fixture.
- El nombre en la ficha es la razón social (p. ej. «41 Norte, S.L.»); hace falta normalizar para el emparejamiento con la tienda.

### Veredicto: **apta con condiciones** (las condiciones comunes de arriba).

---

## 2. Vinoselección

- Web oficial: <https://www.vinoseleccion.com/> (tienda online española; **Magento** con Elasticsuite). Empresa tras la web: ver su aviso legal.
- HTML renderizado en servidor, con datos de producto embebidos; **no hace falta navegador headless**.

### `robots.txt`

`https://www.vinoseleccion.com/robots.txt` (para `User-agent: *`):

- Prohíbe, entre otras, `/catalog/`, `/catalogsearch/`, `/checkout/`, `/customer/`, `/review/`, `/search/`, `/buscar/`, `/pub/`, `/app/`.
- Prohíbe **cualquier URL con query string** (`Disallow: /*?*`) **salvo** `?p=` (`Allow: /*?p=*`, añadida por el sitio en 08/2026). Es decir: la paginación `?p=N` está permitida; los filtros (`?cat=`, `?price=`, `?q=`, `?dir=`, `?limit=`, etc.) **no**.
- Sin `Crawl-delay`. Declara el sitemap: `https://www.vinoseleccion.com/media/sitemap/com/sitemap.xml`.
- Las URLs de producto y de categoría que usamos son «limpias» (`/conde-san-cristobal-2023`, `/vinos/espana/ribera-duero`) y no caen en ninguna regla `Disallow`.

### Términos de uso (aviso legal: `/aviso-legal`)

- Todos los contenidos (bases de datos, imágenes, textos) son propiedad de la empresa; «todos los derechos reservados»; copiar o reproducir requiere autorización expresa.
- Prohíbe la reproducción total o parcial de sus servicios.
- No menciona scraping, bots ni minería de datos.
- Interpretación: precios, añada, formato y variedades son hechos y se pueden guardar con enlace a la fuente (es además el propósito de un comparador). Descripciones y notas de cata son texto original de la tienda: **no copiarlas**. Imágenes: **solo enlazar** (hotlinking de `og:image`/JSON-LD `image`).
- Riesgo: es un comercio con ánimo de lucro y reserva expresa de la base de datos. Mitigación recomendada además de lo técnico: **escribir al contacto de Vinoselección** avisando del proyecto y ofreciendo atribución y enlace (a ellos les genera tráfico). Si respondieran negativamente, SCOPE §12.1 ordena sustituirla (alternativas al final).

### Rutas útiles

| Qué | URL de ejemplo |
| --- | --- |
| Listado D.O. Ribera del Duero | `https://www.vinoseleccion.com/vinos/espana/ribera-duero` y `…?p=2` … `?p=30` |
| Ficha de vino | `https://www.vinoseleccion.com/conde-san-cristobal-2023` |
| Sitemap índice | `https://www.vinoseleccion.com/media/sitemap/com/sitemap.xml` → `sitemap_product_com.xml` (**3.351 productos**), `sitemap_category_com.xml`, `sitemap_entity_com.xml` (D.O., bodegas, uvas), cms, other, additional_link |

### Volumen

- Categoría Ribera del Duero: 12 productos por página; la página 30 trae 9 productos → **≈ 350 vinos** (29 × 12 + 9). Atención: pedir páginas por encima de la última (`?p=31`, `?p=35`, `?p=60`) devuelve una página llena de 12 productos (comportamiento no fiable), así que **parar al primer producto repetido o al agotar el rango de enlaces del paginador** y deduplicar por URL.
- No hay una página única «todos los vinos de Ribera»: puede haber vinos de Ribera fuera de esta categoría (el sitemap de producto no incluye la D.O.). Contraste posible: la categoría `…/rio-vinos/ribera` y las de ofertas.
- Peticiones por ejecución: 30 listados + ≈ 350 fichas ≈ **380**.

### Estructura de datos observada

**Listado**: cada tarjeta es `.product-item-info`, con `h2.product-item-name a.product-item-link[href]`, `p.sdesc a` (D.O.) e imagen. El `onclick` del enlace contiene un JSON (dataLayer GA4) con precio, id, bodega, añada, variedades, formato y fecha de alta; es útil pero está dentro de un atributo HTML escapado.

Campos del JSON de la tarjeta (`items[0]`): `item_name`, `item_id` (SKU interno, p. ej. `AGR-DL0027`), `price`, `price_without_discount`, `discount`, `is_on_sale`, `item_brand` (bodega/grupo), `vintage_year_wine`, `grape_variety_wine` (texto con %), `capacity` (p. ej. «75 cl»), `ean` (**vacío** en las muestras revisadas), `added_date`.

**Ficha**: JSON-LD `<script type="application/ld+json">` con `@type: Product`: `name`, `description` (HTML, reservado), `image` (URL absoluta bajo `/media/catalog/product/…`), `offers.price`, `offers.priceCurrency`, `offers.availability` (`InStock`…), `offers.url`. Además `BreadcrumbList` y metaetiquetas `og:title`, `og:image`. Bloques de cata en HTML: `div.data-label.maridaje`, `.temperatura.servicio`, `.nariz.cata`, `.boca.cata`, `.servicio`. Enlaces de facetas a `…/vinos/tipos-uva/<uva>` y `…/vinos/bodegas/<bodega>`.

### Campos frente al esquema (SCOPE §6)

| Esquema | ¿Disponible? |
| --- | --- |
| vino: nombre, descripción | Nombre sí; descripción reservada (no copiar) |
| vino: tipo, crianza | Parcial (en categorías/texto libre; la crianza suele ir en el nombre: «Crianza», «Reserva») |
| vino: bodega (FK) | `item_brand` y enlace `vinos/bodegas/<x>`: **no siempre coincide** con la bodega del Consejo Regulador (a veces es el grupo) → pasa por emparejamiento difuso (SCOPE §7.2) |
| añada: año | `vintage_year_wine` |
| añada: grado, meses de crianza | Solo en texto libre |
| añada: notas de cata, maridaje | Sí, pero reservadas: solo extracto breve + enlace |
| añada: temp. servicio | Sí (`15-16 ºC`) |
| añada_variedades (uva + %) | `grape_variety_wine` («100% Tempranillo») y enlaces de uva |
| oferta: precio, url, disponible | Sí (JSON-LD) |
| oferta: formato_ml | `capacity` («75 cl») |
| oferta: EAN | **No** en las muestras (`ean` vacío); depender del emparejamiento por nombre |
| imagen | URL en JSON-LD/og:image: **solo enlazar** |

### Riesgos

- Ánimo comercial y reserva de la base de datos (ver mitigación arriba).
- La política de `robots.txt` cambió hace poco (`?p=` permitido desde 08/2026): puede volver a endurecerse. El scraper debe fallar con claridad y notificar si `?p=` deja de estar permitido.
- Sin EAN, el emparejamiento depende de nombre + bodega + añada.
- Bot-protection: no se observó (respuestas 200 con UA propio). Si aparece un desafío, **no** intentar saltarlo; parar y avisar.
- Los precios varían con IVA/envío; guardar el precio de lista de la ficha (con IVA incluido) y anotarlo.

### Veredicto: **apta con condiciones**

Condiciones: las comunes + usar solo URLs limpias y `?p=N`, sin ningún otro parámetro; enviar el aviso/consulta a la tienda; plan de sustitución listo.

### Alternativa equivalente investigada (por si se rechaza)

No se ha verificado en profundidad ninguna; candidatas de SCOPE §7.1 a auditar con este mismo método (robots + términos) antes de elegir: **Bodeboca**, **Decántalo**, **Lavinia**. Alternativa de datos de producto no comercial: **Open Food Facts** (licencia abierta, ODbL) para EAN/imágenes de vinos, con cobertura limitada de vino español.

---

## 3. Recomendaciones técnicas para los scrapers

### User-Agent y cabeceras

```
wine-app-bot/0.1 (+https://github.com/migtoqu/wine-app; contacto: <email de contacto>)
```

Más `Accept-Language: es-ES,es;q=0.9`. Usar un email de contacto dedicado del proyecto (no personal) antes de hacer público el repo. No simular un navegador.

### Ritmo y robustez

- **Una petición cada 3–5 s por dominio** (con *jitter*), **una sola conexión concurrente por dominio**. Estimado: ~340 peticiones en Ribera ≈ 20–25 min; ~380 en Vinoselección ≈ 25–30 min. Muy por debajo del límite del *job* de Actions.
- Reintentos solo ante 5xx/timeouts, con *backoff* exponencial (3 intentos). Ante **403/429**: parar la fuente y marcar la ejecución como fallida (no insistir ni cambiar de UA/IP).
- Enviar `If-None-Match`/`If-Modified-Since` si el servidor devuelve `ETag`/`Last-Modified`.
- Cachear `robots.txt` por ejecución y **evaluarlo con una librería** (no a mano) antes de cada petición.
- Franjas distintas de la semana para cada fuente (SCOPE §7.2).

### Extracción

- Ribera: HTML estático + `cheerio`/`linkedom` (Node) o `selectolax`/`BeautifulSoup`; selectores de la tabla anterior; fixtures HTML guardados en el repo (solo las partes factuales mínimas) para tests.
- Vinoselección: **preferir JSON-LD** de la ficha (`Product`) y completar con el JSON de `item_brand`/`vintage_year_wine`/`grape_variety_wine`/`capacity` de la tarjeta del listado; leer cata (maridaje, temperatura) solo para extracto breve con enlace.
- No hace falta Playwright para ninguna de las dos. No ejecutar JavaScript de las páginas.

### Datos a guardar

- Hechos + URL de la ficha original + fecha de captura (`visto_por_última_vez`). Imágenes: guardar solo la URL.
- `fuente` y `url_fuente` en cada registro, para atribución (SCOPE §7.3).
- No almacenar descripciones completas de ninguna fuente.

### Seguridad del repo público

- Los scrapers no necesitan secretos de las fuentes (todo es público). Solo `SUPABASE_SERVICE_ROLE_KEY`/DB URL como GitHub Secrets; workflows con secretos no deben ejecutarse en PRs de forks (SCOPE §12.6).
