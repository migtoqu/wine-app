# Fuentes de datos del MVP: auditoría de `robots.txt` y términos

> Auditoría de la Fase 0 realizada el 2026-11-07 (§1 y §2, ≈ 25 peticiones) y **ampliación «ola 4» del 2026-11-08** (§3 en adelante, ≈ 350 peticiones repartidas en ~60 sitios, 2–3 s entre peticiones al mismo sitio, UA identificable, sin escribir en la BD). Responde a la decisión §12.1 de [SCOPE.md](./SCOPE.md). No es asesoramiento jurídico.

## Resumen de la ola 4 (ampliación de fuentes)

Decisiones de partida (del usuario): **textos** = resumen propio redactado a partir de hechos extraídos, con enlace y atribución a la fuente, **nunca copia del texto**; **cobertura** = Ribera del Duero a fondo (incluido un crawler de las webs de las bodegas, columna `bodegas.web`) + Rioja + 1–2 D.O. grandes. Reglas de scraping: [SCOPE §7.3](./SCOPE.md).

### Veredictos de un vistazo

| # | Fuente | Qué aporta | Veredicto |
| --- | --- | --- | --- |
| 1 | C.R. D.O. Ribera del Duero | Bodegas (contacto, coordenadas, marcas) | Apta con condiciones (Fase 0, §1) |
| 2 | Vinoselección | Vinos, añada, precio, cata | Apta con condiciones (Fase 0, §2) |
| 3 | **Webs oficiales de las bodegas de Ribera** | Vinos, uvas, elaboración, historia, enoturismo | **Apta con condiciones**, sitio a sitio (§3) |
| 4.1 | **Vinopremier** | Vinos, **EAN**, precio, D.O./uva/crianza en el texto | **Apta con condiciones** (§4.1) |
| 4.2 | **Vinissimus** | ~5.000 vinos y ~1.500 bodegas; precio, graduación, uva | **Apta con condiciones** (§4.2) |
| 4.3 | Bodeboca, Lavinia, Decántalo, El Corte Inglés | — | **No apta**: bloquean con desafío anti-bot / 403 (§4.3; ECI re-auditado el 2026-11-08) |
| 4.5 | Carrefour | — | **No apta**: Cloudflare bloquea nuestro UA, incluido el sitemap de vinos (§4.5) |
| 4.4 | Uvinum / Drinks&Co | — | **No verificada** (error 520 a nuestro UA); baja prioridad (§4.4) |
| 5.1 | **C.R. DOCa Rioja** (`riojawine.com`) | ~213 bodegas, ~700 vinos, ~370 experiencias con reserva | **Apta con condiciones** (§5.1) |
| 5.2 | **D.O. Rueda** (2.ª D.O. recomendada) y **D.O. Navarra** | Bodegas con web; Navarra: bodegas, vinos y experiencias estructurados | **Apta con condiciones** (§5.2) |
| 5.3 | **C.R. Toro, Cigales, Bierzo, Priorat y Rueda** (ola C) | ≈ 350 bodegas con contacto y municipio; marcas (Toro, Cigales); coordenadas (Bierzo, Priorat); visitable y tienda (Rueda) | **Apta con condiciones**; implementada (§5.3) |
| — | D.O. Rías Baixas | — | **No apta**: 403 a `robots.txt` (§5.2, §5.3) |
| 6.1 | **Ruta del Vino Ribera del Duero** | Actividades, catas, visitas, precios, eventos | **Apta con condiciones** (§6.1) |
| 6.2 | Rutas del Vino de España (ACEVIN), Rioja Alavesa, Turismo CyL | Enoturismo de otras rutas | Con condiciones, sin auditar a fondo (§6.2) |
| 7.1 | **Wikidata** (CC0) | Fundación/fundadores/coordenadas de bodegas notables, variedades | **Apta** (§7.1) |
| 7.2 | Wikipedia (CC BY-SA) | Contexto histórico | Con condiciones (solo hechos, no texto) (§7.2) |
| 7.3 | Registros oficiales (AESAN RGSEAA, datasets autonómicos) | NIF / nº de registro para emparejar | Por verificar formato y licencia (§7.3) |

### Prioridades y orden recomendado de implementación

Valor y coste de 1 (bajo) a 5 (alto). Se ordena por valor/coste, ajustado por dependencias (las bodegas de una D.O. deben existir antes de colgarles vinos).

| Orden | Fuente | Valor | Coste | Por qué en ese puesto |
| --- | --- | --- | --- | --- |
| **1** | C.R. DOCa Rioja (§5.1) | 5 | 2 | Abre Rioja entera (bodegas + vinos + experiencias con enlace de reserva). HTML en servidor, sitemap, plantillas regulares, sin bloqueos. Crea las bodegas de Rioja y sus webs (alimentan el crawler). |
| **2** | Vinopremier (§4.1) | 4 | 2 | Único con **EAN** visible y JSON-LD `Product`. Es casi un clon del parser de Vinoselección (Magento). ~370 vinos de Ribera medidos; ~6.900 productos en total. |
| **3** | Ruta del Vino Ribera del Duero (§6.1) | 4 | 1 | Enoturismo con precios y enlaces de reserva por API pública de WordPress/WooCommerce (JSON, sin HTML). |
| **4** | Crawler de webs de bodegas, fase A: WordPress (§3) | 5 | 4 | Es lo más rico (historia, elaboración, uvas, visitas), pero necesita extracción de hechos desde texto libre. ~85 % de las webs vivas son WordPress con `wp-json` y sitemap. |
| **5** | Vinissimus (§4.2) | 3 | 2 | Mucho volumen (≈ 5.000 vinos, 1.538 páginas de bodega) y robots permisivo, pero JSON-LD pobre y sin EAN; valor sobre todo en precio/disponibilidad y cobertura de vinos. |
| **6** | D.O. Navarra y D.O. Rueda (§5.2) | 3 | 1–2 | Navarra es casi gratis (sitemaps por tipo, WP REST). Rueda aporta ~74 bodegas con web y encaja con el crawler. |
| **7** | Wikidata (§7.1) | 2 | 1 | SPARQL gratis, CC0, pero solo ~243 bodegas españolas (55 con fecha de fundación): úsese para las notables y para variedades. |
| **8** | Crawler fase B: otras plataformas y Rioja/Rueda/Navarra (§3) | 4 | 3 | Reutiliza la fase A para las webs de las bodegas nuevas; añade extractores Shopify/Wix/HTML genérico. |
| **9** | Registros oficiales RGSEAA / autonómicos (§7.3) | 2 | 3 | Solo aportan NIF/nº de registro para deduplicar; formato y licencia sin confirmar. |
| **10** | ACEVIN / otras rutas (§6.2) | 2 | 3 | Útil en cuanto se amplíe a más D.O.; estructura no auditada. |
| — | Uvinum (§4.4) | 2 | ? | Primero comprobar acceso. |
| — | Bodeboca, Lavinia, Decántalo, El Corte Inglés, Carrefour | — | — | Descartadas mientras bloqueen (no se elude ningún bloqueo). Vía posible: afiliación en Awin, si el usuario se da de alta (§4.3). |

**Cobertura esperable tras 1–6:** Ribera ≈ 300 bodegas (ya) + ~700–900 vinos (Vinoselección ≈ 350, Vinopremier ≈ 370 con solapamiento, más webs de bodega); Rioja ≈ 210 bodegas del Consejo (el DOCa tiene más inscritas: la web solo muestra las adheridas) y ≈ 700 vinos. El objetivo de ~2.000 vinos en Ribera **no se alcanza solo con tiendas** (Vinoselección ≈ 350 y Vinopremier ≈ 370, con alto solapamiento); se llega sumando los vinos de las webs de las propias bodegas (≈ 5–8 vinos por bodega × ~150 bodegas con web con vinos ≈ 750–1.200) y la cobertura de Rioja.

### Claves de emparejamiento disponibles por fuente

Para consolidar duplicados (columnas previstas en el plan de consolidación: `dominio`, `nif`, `registro_embotellador`, EAN, nombre normalizado + municipio). ✔ = disponible de forma fiable; ~ = parcial; ✘ = no.

| Fuente | Dominio web | EAN | NIF / nº registro | Nombre + municipio | Otras claves |
| --- | --- | --- | --- | --- | --- |
| C.R. Ribera | ✔ (`Web`) | ✘ | ✘ (no hay NIF en la ficha; el nombre es la razón social «…, S.L.») | ✔ (razón social + municipio + provincia) | ID de nodo Drupal (`nodo:NNNN`), slug, email, teléfono, coordenadas, lista de **marcas** de la bodega |
| Vinoselección | ✘ | ~ (campo `ean` vacío en las muestras) | ✘ | ~ (`item_brand` puede ser el grupo) | SKU (`AGR-DL0027`), URL de ficha, faceta `vinos/bodegas/<x>` |
| Webs de bodegas | ✔ (es la propia clave) | ~ (solo tiendas WooCommerce con GTIN) | ~ (a veces en el aviso legal: «CIF/NIF» del titular) | ✔ (JSON-LD `Organization`/`PostalAddress` en algunas) | email/teléfono de contacto, redes sociales |
| Vinopremier | ✘ | ✔ (**EAN** visible en ficha: «EAN: 84370…») | ✘ | ✔ (marca/bodega en el JSON-LD y en el texto) | SKU (`VT-AALTO`), slug |
| Vinissimus | ✘ | ✘ | ✘ | ✔ (`brand` JSON-LD; página `/es/bodega/<x>/`) | SKU (`braya23`), región en breadcrumb |
| C.R. Rioja | ✔ (`Ver tienda`/web en la ficha) | ✘ | ✘ | ✔ (nombre comercial + municipio + zona) | email, teléfono, slug propio |
| Ruta del Vino Ribera | ✔ (en cada ficha `directories`) | ✘ | ✘ | ✔ | ID de WordPress, coordenadas |
| Wikidata | ✔ (`P856`) | ✘ | ✘ | ✔ (`rdfs:label`, municipio `P131`) | **QID** estable, coordenadas `P625`, fundación `P571` |
| RGSEAA (AESAN) | ✘ | ✘ | ✔ (**nº RGSEAA**, razón social) — por verificar | ✔ | Domicilio |

Orden de fiabilidad recomendado para fusionar bodegas: **dominio web** (igual en Consejo, Rioja, Ruta, Wikidata y web propia) > NIF/nº registro (cuando exista) > nombre normalizado + municipio. Para vinos: **EAN** > bodega + nombre normalizado + añada + formato. Ojo: un grupo puede compartir dominio entre varias bodegas y varias bodegas pueden apuntar a la web de una marca: el dominio es clave fuerte, no única.

### Política de textos (decidida)

Descripciones, historia, notas de cata y elaboración **no se copian**. Se extraen **hechos** (año de fundación, fundador, hectáreas, uvas y %, meses y tipo de barrica, graduación, producción, precios y duración de visitas, idiomas) y con ellos se redacta un **resumen propio**, guardando `url` de la ficha original, nombre de la fuente y fecha de captura (`registros_fuente`, `resumenes.fuentes`). Esto encaja con todos los avisos legales revisados, ninguno de los cuales protege los hechos, pero sí el texto y las imágenes. Las imágenes se enlazan (`og:image`/JSON-LD), nunca se copian. Cuando un sitio prohíbe expresamente robots/crawlers en su aviso legal o *Content Signals*, **no se rastrea** aunque `robots.txt` lo permita.

---

## Condiciones comunes de la Fase 0 (Ribera y Vinoselección)

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

Auditadas en la ola 4 (§4): **Vinopremier** y **Vinissimus** son accesibles y se pueden usar como sustituto o complemento; **Bodeboca, Lavinia, Decántalo y El Corte Inglés** bloquean con desafío anti-bot. Alternativa de datos de producto no comercial: **Open Food Facts** (licencia abierta, ODbL) para EAN/imágenes de vinos, con cobertura limitada de vino español.

---

## 3. Webs oficiales de las bodegas de Ribera

Muestra: las **40 primeras fichas** de un `node scrapers/cli.ts ribera --dry-run --limit 40` (45 peticiones, 181 s) → 34 URLs con `web` (85 %) → **24 dominios distintos** (varias fichas repiten dominio con/sin `/`). Por dominio: `GET /`, `GET /robots.txt`, `GET /wp-json/wp/v2/types`, el sitemap y, en 8 sitios, la página de aviso legal. UA identificable, 2 s entre peticiones, `robots.txt` evaluado antes de cada ruta. Los datos crudos están en la carpeta de notas de la sesión (`sources-wave4-webs-ribera-scan.json`).

### Resultados

| Pregunta | Resultado (de 24 dominios) |
| --- | --- |
| Web viva con nuestro UA | **21 (88 %)**. 2 devuelven **403** a nuestro UA desde la portada (`bodegasarbas.com`, `bodegaconvento.com`: WAF; no se insiste ni se elude); 1 falla en red/TLS (`bodegamatarromera.es`, a reintentar) |
| CMS | **WordPress ≈ 19/21 (90 %)**; Divi, Elementor y WPBakery como constructores; ≥ 9 con WooCommerce o tipo `product`; 1 sitio ASP clásico (`bodegasangabriel.com`) y 1 HTML estático. **Ninguna** en Shopify, Wix, PrestaShop, Squarespace ni Joomla |
| `robots.txt` | 21/21 responden 200; **8,2 KB en total (≈ 390 B de media)**; ninguno excluye `/` ni el sitemap; WordPress por defecto (`Disallow: /wp-admin/`). Ningún `Crawl-delay` |
| Sitemap | 21/21 con sitemap XML (Yoast `post/page/product-sitemap.xml` o `wp-sitemap-*.xml` del núcleo); suelen traer 3–10 sub-sitemaps; un sitio ASP trae 144 URLs |
| API WordPress `/wp-json/wp/v2/types` | **18/21 públicos (86 %)**; 1 con 401 (bloqueado), 1 con 404. Tipos útiles detectados: `product` (WooCommerce), `bodegas` (Fernández Rivera), `vino` (Dobler), `anada` (Tomás Postigo), `productos`/`proyectos` (Bardos), `project`/`portfolio` |
| JSON-LD | En 14/21 de portadas, pero casi todo es el grafo genérico de Yoast (`WebSite`, `WebPage`, `Organization`, `BreadcrumbList`). **Ninguna** expone `Product`, `Winery` ni `Offer` en la portada. Solo `Organization` (9) y, en una, `PostalAddress` |
| Navegación localizable por texto del enlace | «vinos/tienda/productos» en **14/21 (67 %)**, «historia/nosotros/la bodega» en **12/21 (57 %)**, «enoturismo/visitas/catas/experiencias» en **9/21 (43 %)** (cota inferior: solo mira los enlaces de portada; el sitemap añade más) |
| Aviso legal (muestra de 8) | 8,4–21,4 mil caracteres, plantilla de gestoría. Todos reservan propiedad intelectual y 6 mencionan la reproducción; **ninguno menciona scraping**; **1 (`abadiadeacon.com`) prohíbe expresamente «robots», «spiders», «crawlers»** y reclama indemnización → excluir ese sitio |

### Estrategia del crawler genérico

El crawler **no escribe en el catálogo**: deja *hechos* en `registros_fuente.hechos` y el generador de resúmenes redacta el texto (ver «Política de textos»). Un sitio = un trabajo; una conexión por dominio y 3–5 s entre peticiones (reglas de §8); concurrencia global ≤ 8 dominios a la vez.

1. **Entrada y filtros.** Dominios de `bodegas.web` normalizados (https, sin `/` final, mismo host tras redirecciones; se rechazan redirecciones a otro dominio, como `lib/http.ts`). Un dominio compartido por varias bodegas se rastrea una vez.
2. **Puerta de cumplimiento.** (a) `robots.txt` (ya implementado). (b) Localizar el aviso legal (enlace «aviso legal» o `/aviso-legal`) y buscar con una lista fija `robots|spiders|crawlers|scraping|minería de datos|extracción automática|content-signal`; si coincide, `rastreable=false` y revisión del admin. (c) Respetar `Content-Signal`/cabeceras `X-Robots-Tag: noai` si aparecen. (d) 401/403/429/desafío anti-bot = parar ese sitio y marcarlo, sin cambiar UA ni IP.
3. **Huella de plataforma.** `<meta name="generator">`, `/wp-json/` en `<link rel="https://api.w.org/">`, `wp-content`, `cdn.shopify.com`, `wixstatic`. Decide el extractor.
4. **Descubrimiento.** Primero sitemap (`Sitemap:` de robots → `/sitemap_index.xml` → `/wp-sitemap.xml` → `/sitemap.xml`), expandiendo índices con tope. Si no hay: enlaces de portada y menú a profundidad ≤ 2, mismo host, máx. ~40 páginas por sitio. Filtrar por idioma (`/es/`, o la única lengua; las páginas `/en/` solo si no hay `/es/`).
5. **Clasificación de páginas** (por slug + título + `<h1>` + tipos JSON-LD, ES/EN):
   - vino/producto: `vino|vinos|nuestros-vinos|productos|tienda|shop|wines|gama|marcas`, o `Product`;
   - historia: `historia|la-bodega|bodega|nosotros|quienes-somos|filosofia|about|our-story`;
   - enoturismo: `enoturismo|visitas?|visita-la-bodega|catas?|experiencias|reservas?|wine-tourism|tours?|eventos`;
   - contacto/legal para redes y teléfono.
6. **Extractores por plataforma** (de menor a mayor coste):
   - **WordPress** (≈ 90 %): `GET /wp-json/wp/v2/types` para descubrir CPT (`product`, `vino`, `bodegas`, `anada`…), luego `GET /wp-json/wp/v2/<rest_base>?per_page=100&_fields=id,slug,link,title,content,modified` y `/pages?slug=`. Evita HTML y respeta paginación `X-WP-TotalPages`. **WooCommerce**: `/wp-json/wc/store/v1/products` si es público (precio, categorías, atributos; solo URL e imagen enlazada). Cuando `wp-json` está cerrado (401/404), cae al HTML del sitemap.
   - **JSON-LD / microdatos / OpenGraph** en cualquier plataforma: `Product`/`Offer` (nombre, precio, GTIN/EAN, marca), `Organization`/`PostalAddress`/`sameAs` (redes), `Event` (catas con fecha), `Winery`/`LocalBusiness`.
   - **Shopify** (`/products.json`, `/collections/*.json`) y **Wix**: previstos pero sin casos en la muestra; implementar solo cuando aparezcan en `bodegas.web`.
   - **HTML genérico**: contenido principal (readability) → texto plano para extraer hechos; sin ejecutar JavaScript (no Playwright).
7. **Extracción de hechos** del texto (regex + diccionario `variedades_uva` con sinónimos; opcionalmente un LLM *solo para extraer campos estructurados*, no para copiar texto): año de fundación («fundada en 1987»), fundadores, hectáreas, altitud, uvas y %, «N meses en barrica de roble francés/americano», graduación («14,5 % vol»), producción en botellas, añada, precio de visita («25 € por persona»), duración, idiomas, horario, URL/mail/teléfono de reserva. Cada hecho guarda la URL de la página y un fragmento mínimo (≤ 200 caracteres) para auditoría, no para mostrar.
8. **Cadencia.** Mensual (no semanal), o semanal solo para sitios cuyo sitemap cambie (`lastmod`/`ETag`). Presupuesto: ≈ 12 peticiones por sitio de arranque + ≈ 10–25 páginas de contenido ⇒ **~25–40 peticiones por sitio, ≈ 6.000–9.000 por pasada de ~225 sitios**. A 4 s por dominio y 8 dominios en paralelo, ≈ 50–75 min: dividir en 2–3 *jobs* de matriz o por lotes de dominios (el *job* de Actions tiene `timeout-minutes: 60`).

### Cobertura esperada (sobre 302 bodegas de Ribera)

| Etapa | Estimación |
| --- | --- |
| Con `web` | ≈ 255 (85 %) |
| Web viva y rastreable (sin WAF, sin cláusula anti-robots) | ≈ 215–225 (84–88 % de las anteriores) |
| Con extractor «barato» (WordPress REST o sitemap + JSON-LD) | ≈ 190 |
| Con página de vinos identificada | ≈ 145 (67 %) → ≈ 5–8 vinos por bodega ⇒ **~750–1.100 vinos** |
| Con historia | ≈ 125 (57 %) |
| Con enoturismo identificado | ≈ 95–100 (43 %); con precio/reserva estructurados, ≈ 40–50 (la mayoría solo dice «visitas con reserva previa») |
| Con uvas/crianza/cata *estructuradas* (no solo prosa) | ≈ 30–40 % de las que tienen página de vinos |

Riesgos: texto en imágenes o PDF (fichas técnicas en PDF: solo URL, no leer PDF en la v1); sitios con *age gate* en JavaScript (el HTML suele traer el contenido tras el aviso; si no, se descarta); bodegas que apuntan a una tienda de un tercero (Shopify/Vivino): se ignora; nombres de producto con añada incrustada («Aalto 2021»).

**Veredicto: apta con condiciones**, sitio a sitio: `robots.txt` + escaneo de cláusula anti-robots + sin WAF + enlace/atribución + solo hechos. Contacto de retirada en el UA.

---

## 4. Tiendas con mucho catálogo (Ribera y Rioja)

Resumen: con nuestro UA solo **Vinopremier** y **Vinissimus** responden con normalidad. **Bodeboca, Lavinia, Decántalo y El Corte Inglés** muestran un desafío anti-bot o `Access Denied` incluso en rutas permitidas; al no poder (ni deber) saltarlo quedan descartadas hasta que cambie, y se puede pedir permiso por escrito a la tienda.

| Tienda | Plataforma | `robots.txt` | Sitemap | Volumen | EAN | Estado con nuestro UA |
| --- | --- | --- | --- | --- | --- | --- |
| Vinopremier | Magento 2 | Permisivo (bloquea carrito, buscador, filtros por query, `/feed/`) | Sí, por idioma; productos 6.927 URLs | Ribera ≈ **369**; total ~6.900 | **Sí** | 200 |
| Vinissimus | Propia (rutas `external_to_zope`) | Muy permisivo | Sí, 8.549 URLs | ~5.070 vinos, 1.538 bodegas, 481 regiones, 376 uvas | No | 200 |
| Bodeboca | — | **403 también en `robots.txt`** (desafío «Just a moment» de Cloudflare) | — | — | — | Bloqueada |
| Lavinia | Cloudflare delante | `Allow: /` para `*`, pero con *Content Signals* (`ai-train=no`) y «reservas de derechos bajo el artículo 4» | Desafío Cloudflare | — | — | Bloqueada |
| Decántalo | PrestaShop + Cloudflare | `crawl-delay: 1`, lista larga de bots vetados; `*` bloquea buscador y parámetros | **403** («Attention Required») | — | — | Bloqueada |
| El Corte Inglés | Akamai | **`Access Denied` en `robots.txt`** | — | — | — | Bloqueada |
| Uvinum / Drinks&Co | WordPress | `Disallow: /visit/`, `/login/`, `/search/`… | `sitemap_index.xml` → **520** | — | — | Sin verificar |
| Vinoteca.es | Shopify | Permisivo | Sí | — | — | **Descartada**: vende *vinotecas* (armarios de vino), no vino |

### 4.1 Vinopremier (`vinopremier.com`) — apta con condiciones

- **robots.txt** (para `*`): bloquea `/app/`, `/checkout/`, `/customer/`, `/catalogsearch/`, `/catalog/product/view/`, `/catalog/category/view/`, `/review/`, `/ajax/`, `/feed/`, `/amfeed/`, `/private-feed/` y las queries `price=`, `dir=`, `product_list_*=`, `vp_bodega=`, `vp_do=`, `vp_pais=`, `mg_related_*=`. **No bloquea** `?p=` ni las URLs limpias de producto y categoría. Sin `Crawl-delay`. Declara siete sitemaps.
- **Términos (leídos el 2026-11-08):** `/aviso-legal` devuelve 404; las «Condiciones generales de uso» están en `/condiciones-de-venta` (200) y se leyeron enteras. **No contienen ninguna cláusula contra robots, scraping, extracción automatizada ni bases de datos.** Lo único relevante es el apartado 4, que reserva a Vinopremier «diseños, textos, gráficos, logos…» y exige autorización para su «reproducción, distribución o comunicación pública». Condiciones de uso del scraper: solo hechos, imágenes enlazadas (no copiadas), resúmenes propios, UA identificable, rate limit y parada ante 403/429. robots.txt (host real `vinopremier.com`; `www` redirige): sin `Content-Signal` ni `Crawl-delay`; veta a Baiduspider, Yandex, AhrefsBot, PetalBot, Wget, HTTrack, Python-urllib y Applebot, no a nuestro UA.
- **Rutas útiles:** índice `https://vinopremier.com/media/sitemap/sitemap_es_index.xml` → `…_products.xml` (6.927 URLs) y `…_products_outstock.xml`; categoría `https://vinopremier.com/vinos/denominaciones/d-o-ribera-del-duero` (30 productos/página, 369 en total → 13 páginas con `?p=N`); ficha `https://vinopremier.com/vino-tinto-aalto.html`.
- **Estructura:** ficha de 345 KB. JSON-LD `Product` con `name`, `sku` (`VT-AALTO`), `description` (HTML truncado, reservado), `image`, `offers[0].price`/`availability`, `brand` y `manufacturer` (la bodega); `BreadcrumbList` con la D.O. (`/vinos/denominaciones/…`). **EAN** visible («EAN: 8437003104763») y en atributo `ean`. Texto libre con «Zona: D.O. Ribera del Duero. Bodega: Aalto. Uva: 100 % Tinto Fino. Crianza: 20 meses en barricas de roble americano y francés». Las variedades y la crianza salen de ahí con regex.
- **Campos frente al esquema:** nombre ✔; bodega ✔ (`manufacturer`); D.O. ✔; uvas y % ~ (texto libre); crianza ~ (texto libre); añada ~ (a veces en el nombre); precio/disponibilidad ✔; formato ~ (productos de 9 L aparecen como producto aparte, `…-9-litros.html`); **EAN ✔**; imagen ✔ (enlazar); cata ✘ (casi nunca).
- **Riesgos:** comercio con ánimo de lucro (misma mitigación que Vinoselección: contacto y atribución); formato no siempre explícito; páginas pesadas. **Veredicto: apta con condiciones** (condiciones comunes de la Fase 0; términos leídos sin cláusula anti-scraping).
- **Incidente (2026-11-08):** durante el primer dry-run completo (UA identificable, 3–5 s entre peticiones, ~290 peticiones en ~41 min, 14:12–14:53 UTC) el sitio dejó de responder desde la IP del equipo de desarrollo (`fetch failed`, también `robots.txt`; sin 403/429 previo), lo que parece un bloqueo a esa IP. Se detuvo la ejecución sin reintentar ni sortear el bloqueo (ni otra IP ni GitHub Actions). Mitigación en el scraper: pausa de 10–14 s entre peticiones, tope de 450 peticiones por ejecución (se marca la ejecución como parcial) y la carga programada no se activa hasta comprobar que la web vuelve a responder.

### 4.2 Vinissimus (`www.vinissimus.com`) — apta con condiciones

- **robots.txt:** una sola regla para `*`: bloquea `cart`, `checkout`, `checkout-fail`, `account`, `order*`, `newsletter-preferences`, `unsubscribed` en `es/en/fr/it/de`; veta además bots de entrenamiento (CCBot, Bytespider, meta-externalagent…). Sitemap declarado. Sin `Crawl-delay`.
- **Términos:** no localizados (`/es/aviso-legal.html` 404; el pie solo enlaza `/es/privacidad.html`). **Pendiente.**
- **Rutas:** `https://www.vinissimus.com/external_to_zope/web_downloads/sitemap.xml` → `…sitemap_vinissimus_com_es.xml` (1,2 MB, 8.549 URLs: 5.070 `/es/vino/<slug>/`, 1.538 `/es/bodega/<slug>/`, 481 `/es/region/<país>/<región>/`, 376 `/es/uva/<uva>/`, 278 cava, 99 champán…). Regiones relevantes: `/es/region/espana/ribera-del-duero/`, `/rioja/`, `/rueda/`, `/navarra/` (volumen por región no medido: hay que paginar su listado).
- **Estructura de la ficha:** JSON-LD `Product` mínimo: `name` («Bimbache La Raya 2023», **añada en el nombre**), `sku`, `image`, `category` (color: «Blanco»), `brand.name`, `offers.price`/`url`/`availability`. En el HTML: productor, tipo de uva («Uvas blancas»; no la variedad), **graduación** («13,5 %»), región con *breadcrumb* (`España › Islas Canarias › El Hierro`), alérgenos, formatos y precio por 1/2/3 botellas, opiniones.
- **Campos:** nombre ✔, añada ✔ (del nombre), bodega ✔, región/D.O. ✔, tipo/color ✔, graduación ✔, precio/disponibilidad ✔, formato ✔ («0,75 L»), imagen ✔ (CDN propia; enlazar), EAN ✘, variedades % ✘ (solo enlaces de facetas), cata ~ (en algunas).
- **Riesgos:** términos sin leer; plataforma propia (cambios sin aviso); ánimo comercial. **Veredicto: apta con condiciones**; usarla para precio/ofertas y para descubrir vinos que faltan, no como fuente de descripciones.

### 4.3 Bodeboca, Lavinia, Decántalo, El Corte Inglés — no aptas

Evidencia (2026-11-08, UA `wine-app-bot/0.1`):

- **Bodeboca:** `GET /robots.txt` → **403** con página «Just a moment…» (desafío de Cloudflare).
- **Lavinia:** `robots.txt` 200 con `Allow: /` y la advertencia de que cualquier restricción de las *Content Signals* es «express reservations of rights under Article 4» de la Directiva 2019/790 (excepción de minería de textos y datos); además veta a ClaudeBot, GPTBot, etc. `GET /sitemap.xml` → desafío Cloudflare. Aunque nuestro UA no figura en los vetados, el sitio manifiesta reserva de TDM y desafía a los bots: no rastrear.
- **Decántalo:** `robots.txt` 200 (`crawl-delay: 1`); `GET /sitemap.xml` → **403** «Attention Required! | Cloudflare».
- **El Corte Inglés:** `GET /robots.txt` → **`Access Denied`** (Akamai). **Re-auditado el 2026-11-08 (tarde)**, a petición del usuario: `robots.txt`, `/sitemap.xml` y `/condiciones-de-uso/` → **403 `Access Denied`** (`AkamaiGHost`). Sigue bloqueada; no se pudieron leer términos ni contar referencias de Ribera/Rioja.

**Vía posible (no comprobada): afiliación en Awin.** El Corte Inglés tiene un programa de afiliados en Awin (perfil 13075), igual que Carrefour Supermercado (perfil 25399, §4.5). Awin da *feeds* de producto a los *publishers* aprobados. Hay matices: el alta la tendría que hacer el usuario (nosotros no creamos cuentas); el anunciante decide si aprueba el sitio; el feed está pensado para promocionar con enlaces trackeados, así que hay que respetar sus condiciones de uso; y ECI excluye la categoría supermercado de comisión, donde suele estar el vino, por lo que el vino podría no estar en su feed. No se ha verificado que exista un feed de vinos en ninguna de las dos.

Saltarse estos desafíos va contra las reglas del proyecto. Opciones: (1) escribir a cada tienda ofreciendo atribución y tráfico y pedir acceso a un feed/afiliados (preguntar si ofrecen afiliación o *feeds* de producto: sería la vía legítima para obtener EAN y precio; no se ha comprobado que existan); (2) esperar a que levanten el bloqueo. **Veredicto: no apta** por ahora.

### 4.4 Uvinum / Drinks&Co (`www.uvinum.es`) — no verificada

`robots.txt` 200 y corto (WordPress virtual: `Disallow: /visit/`, `/login/`, `/search/`, `/wp-admin/`, `*?s=0`), pero `sitemap_index.xml` devolvió **520** (error del origen o filtro) a nuestro UA. Es un *marketplace* (precios de varios vendedores, enlaces `/visit/` redirigen al vendedor). No se insistió. Volver a probar en otro momento antes de auditar términos; prioridad baja.

### 4.5 Otras

- **Supermercados** (Mercadona, Carrefour, DIA): sus `robots.txt` existen (Mercadona permite todo; DIA bloquea `/products/`; Carrefour bloquea `/buscador/`), pero su catálogo de vino de D.O. es pequeño, volátil y orientado a marca blanca; no aportan bodegas ni historia. No se auditaron términos. Baja prioridad.
- **Carrefour (`www.carrefour.es`) — no apta (auditada el 2026-11-08, a petición del usuario).** UA `wine-app-bot/0.1`, 3 peticiones, ≥ 12 s entre ellas. Delante hay Cloudflare.
  - `GET /robots.txt` → 200, servido desde la caché de Cloudflare (`cf-cache-status: HIT`). Para `*` bloquea `/buscador/`, `/browse/*`, `/e-commerce/*`, las facetas (`N-*Z*Z*`, `F-*Z*`) y las queries `?q=`, `?sort=`, `?filter=`…; no tiene `Crawl-delay` para `*` (solo para TwengaBot: 60), y la lista de *bad bots* no incluye nuestro UA. Declara cuatro sitemaps, entre ellos **`/crs/cdn-static/sitemap-bodega/index.xml`**, el de la sección de vinos.
  - `GET /crs/cdn-static/sitemap-bodega/index.xml`, `GET /crs/cdn-static/sitemap-food/index.xml` y `GET /aviso-legal` → **403 «Sorry, you have been blocked»** (Cloudflare). El bloqueo es por cliente, no por ruta: alcanza incluso a lo que `robots.txt` anuncia.
  - No se pudieron leer términos ni contar referencias de Ribera/Rioja. No se insiste ni se cambia UA/IP. Vía posible: afiliación en Awin (perfil 25399), con los mismos matices que El Corte Inglés (§4.3).
- **Vivino y Wine-Searcher:** `robots.txt` bloquea precios, reseñas y acciones (`/prices/`, `/reviews/`, `/ajax/`…); son agregadores con API propia y términos que se esperan restrictivos; sus reseñas son contenido de usuarios. **No recomendadas**; no se leyeron los términos.

---

## 5. Consejos reguladores

### 5.1 C.R. DOCa Rioja (`riojawine.com`) — apta con condiciones

- WordPress + Yoast (HTML renderizado en servidor; contenido accesible aunque haya *age gate* en JavaScript). Idiomas `/es/`, `/en-gb/`, `/de-de/`.
- **robots.txt:** `*` solo bloquea `/wp-includes/`, `/cgi-bin/`, `/wp-content/plugins/`, `/wp-content/themes/`, `/wp-admin/`; veta herramientas de copia (HTTrack, WebCopier, Offline Explorer…). Sitemaps declarados: `sitemap-es-es.xml`, `sitemap-en-gb.xml`, `sitemap-de-de.xml`. Sin `Crawl-delay`.
- **Aviso legal** (`/es/aviso-legal/`): copias solo «para su uso exclusivo»; prohíbe copiar, distribuir, modificar o comunicar públicamente sin autorización, **prohíbe el uso comercial o la comercialización de la información** y declara que «no concede licencia o autorización alguna» sobre los elementos protegidos; prohíbe eludir dispositivos técnicos de protección. **No menciona scraping ni minería de datos.** Aplicación al proyecto: datos factuales (nombre, municipio, zona, web, teléfono) con enlace y atribución; sin copiar textos ni imágenes; recomendable **avisar al Consejo** (ya es nuestro modelo con la D.O. Ribera) porque el proyecto es privado y sin ánimo de lucro por ahora, pero cambiaría en la fase pública.
- **Rutas:** sitemap ES (`https://riojawine.com/sitemap-es-es.xml`, 283 KB, generado con Screaming Frog 20.3: puede estar desfasado respecto al sitio, igual que el de Ribera): **~213** `/bodegas-rioja/<slug>/`, **~700** `/vinos-rioja/<slug>/`, **~371** `/experiencia/<slug>`, 60 `/visita-rioja/municipios/<m>`, 15 variedades de uva (`/doca-rioja/variedades-de-uva/…`), tipos de vino y las tres zonas (Rioja Alta, Alavesa, Oriental).
- **Estructura observada (3 fichas leídas):**
  - **Bodega** (`/bodegas-rioja/bodegas-muga/`): nombre, zona y municipio («Rioja Alta · Haro»), «Ver tienda», **web, teléfono, email, dirección**; texto de historia/elaboración (reservado; ejemplo: fundación 1932 y fundador están en la prosa → hecho extraíble), etiquetas («Familiares», «Centenarias», «Con calados históricos»), vinos y experiencias relacionados.
  - **Vino** (`/vinos-rioja/ysios-los-prados/`): nombre, bodega y zona, **precio** («€60,00»), tipo (tinto/blanco/rosado/espumoso) por categoría, descripción con la uva («uvas Tempranillo…»).
  - **Experiencia** (`/experiencia/a-pie-de-vina/`): título, zona/municipio, botón **«Reservar experiencia»** (enlace externo), «Ver tienda», web, teléfono y email de reservas; categorías por perfil (en familia, en pareja…).
  - Sin JSON-LD de producto/negocio (solo navegación). Hay que usar selectores del tema.
- **Campos frente al esquema:** `bodegas` (nombre, municipio, zona, web, teléfono, email, dirección) ✔; vinos (nombre, tipo, precio) ✔, uvas y notas ~ (prosa); `servicios_bodega` (título, tipo, url_reserva, contacto) ✔, precio/duración ~ (prosa); EAN ✘; NIF ✘.
- **Cobertura:** el DOCa Rioja tiene más bodegas inscritas que las ~213 que publica esta web (solo las adheridas); el resto se alcanzaría con el crawler de webs. Riesgo de que el Consejo restrinja el rastreo en la fase pública. **Veredicto: apta con condiciones** (comunes + aviso al Consejo + sin uso comercial hasta tener autorización).

### 5.2 Segunda D.O.: recomendación

Candidatas comprobadas con `robots.txt` y sitemap (1–3 peticiones cada una):

| D.O. | Acceso | Lo que ofrece |
| --- | --- | --- |
| **Rueda** (`dorueda.com`) | `robots.txt` vacío (permite todo) | Tabla única de **74 bodegas** (localidad, nombre, web/blog/red social, «visitable» / Ruta del Vino de Rueda, tienda online); fichas `…/bodegas/?pdb=NNN`; sin dirección ni teléfono de la bodega; sin listado de vinos |
| **Navarra** (`navarrawine.com`) | Permisivo (solo `/wp-admin/`) | WordPress con tipos propios y **sitemaps por tipo**: `bodegas` (~29), `vinos` (~253), `experiencias` (~27); `wp-json/wp/v2` público |
| Penedès (`dopenedes.cat`) | Permisivo | WordPress; sitemaps de entradas y `tipus_activitat` (actividades); sin sitemap de bodegas/vinos localizado |
| Toro (`dotoro.es`) | Permisivo | Pequeña (WordPress); sin auditar |
| Rías Baixas (`doriasbaixas.com`) | **403** a `robots.txt` (WAF) | No accesible |
| Cava, Jumilla, Bierzo, La Mancha | Sin respuesta desde la red de pruebas | No evaluadas |

**Recomendación: Rueda como segunda D.O. de la ola**, con **Navarra** como extra casi gratuito:

1. Rueda es grande por producción y reconocimiento, vecina de Ribera (Castilla y León), con robots abierto, y su listado (nombre + localidad + web) es exactamente la entrada que necesita el crawler de la §3, que aporta los vinos y la historia. Cobertura inmediata en tiendas (Vinopremier y Vinissimus tienen página de región).
2. Navarra ofrece **datos estructurados oficiales** de bodegas, vinos y experiencias a bajo coste (sitemaps y REST), útil como segundo piloto del extractor WordPress. Su tamaño es modesto (≈ 29 bodegas publicadas).
3. Rías Baixas, la otra gran D.O., hoy no es accesible (WAF); se cubriría por tiendas y webs de bodega.

Los términos de Rueda y Navarra **no se han leído** todavía: auditarlos al empezar. **Veredicto: apta con condiciones** (provisional).

### 5.3 Ola C: consejos con directorio de bodegas (auditados el 2026-11-08)

Scrapers en `scrapers/fuentes/consejos/`: un **núcleo común** (`comun/`: normalizar → `EmparejadorBodegas` → consolidación, con la D.O. como parámetro) y un parser por consejo, porque las cinco webs usan plataformas distintas. CLI: `node scrapers/cli.ts consejo-<toro|cigales|bierzo|priorat|rueda>`. Fuentes `cr-<consejo>` (migración `20261112120000`), tipo `consejo_regulador`, semanales.

Auditoría: unas 40 peticiones, como mucho 7 por sitio, ≥ 4 s entre peticiones al mismo host y con el UA del proyecto. Todos responden 200, sin desafío anti-bot ni WAF.

| Consejo | `robots.txt` | Aviso legal | Listado → ficha | Datos que se guardan |
| --- | --- | --- | --- | --- |
| **Toro** (`www.dotoro.com`) | Solo `/wp-admin/` | Prohíbe reproducir o comunicar contenidos sin autorización; nada sobre extracción | `/bodegas-y-marcas/` (una página) → `/bodegas/<slug>/` | Nombre, dirección, CP, municipio, teléfono, email, web, **marcas**, año de inscripción |
| **Cigales** (`do-cigales.es`) | Solo `/wp-admin/` | **Uso personal y privado**, prohibido el uso comercial | `/bodegas/` (agrupado por municipio) → `/bodegas/<slug>/` | Nombre, municipio (del listado), contacto, web, **marcas de vino**. La dirección de contacto solo se usa si es del mismo municipio (Protos da la de Peñafiel) |
| **Bierzo** (`www.crdobierzo.es`) | **404** (= todo permitido) | Sin cláusula de propiedad intelectual | `/es/bodegas-y-vinos/` → `/<slug>/<id>/` | Razón social, dirección, CP, municipio, **coordenadas**, teléfono, email, web |
| **Priorat** (`www.doqpriorat.org`) | Yoast, `Disallow:` vacío | Prohíbe reproducir o transformar sin consentimiento | `/cellers/` paginado → `/cellers/<slug>/` (en catalán) | Nombre, dirección, CP, municipio (con alias, sin traducir), **coordenadas**, contacto, idiomas de visita; `bodega.enoturismo` solo si las visitas son para público |
| **Rueda** (`dorueda.com`) | Vacío | Igual que Toro | `/bodegas/`: **tabla única** (las fichas `?pdb=N` devuelven la misma tabla y no se piden) | Nombre, localidad, web, «Visitable», tienda online. Sin CP: provincia por tabla de municipios (Valladolid, Segovia, Ávila) |

Reglas: solo hechos con enlace a la ficha; **nunca** la descripción de la bodega, imágenes ni nombres de personas (contacto, enólogos, responsables). Las marcas no crean vinos: van a `datos` y al emparejador. La provincia sale del código postal; si no hay, de la tabla de municipios de la D.O.; nunca se pone la de la D.O. por defecto. Proyecto privado y sin ánimo de lucro; **avisar a cada consejo antes de la fase pública** (Cigales es el más restrictivo).

Descartados: **Rías Baixas** (`doriasbaixas.com`) devuelve 403 a `robots.txt`; no se insiste ni se cambia de UA.

**Dry-run completo (2026-11-09)**, sin tocar la BD:

| Consejo | Bodegas | Peticiones | Tiempo | Errores | Con CP | Con web | Con teléfono | Con email | Otros |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Toro | 63 | 66 | 5,6 min | 0 | 54 | 60 | 61 | 63 | 59 con marcas |
| Cigales | 27 | 29 | 2,6 min | 0 | 25 | 26 | 27 | 25 | 27 con marcas |
| Bierzo | 69 | 71 | 4,8 min | 0 | 69 | 55 | 66 | 68 | 61 con coordenadas |
| Priorat | 114 | 125 | 12,3 min | 0 | 113 | 97 | 112 | 112 | 96 con coordenadas; 89 visitables por el público |
| Rueda | 74 | 2 | 5 s | 0 | — | 70 | — | — | 43 visitables |
| **Total** | **347** | 293 | | **0** | | 308 | | | |

Las 347 tienen municipio y provincia. Cruce con el catálogo actual (511 bodegas), con el mismo `EmparejadorBodegas` y en el orden de los cron: **319 nuevas** (el catálogo pasaría a ≈ 830), 20 vinculadas a una bodega existente (Protos, Emilio Moro, Pagos del Rey, Marqués de Riscal…) y **8 a revisión**. Seis de esas revisiones son grupos que comparten web, como `sierracantabria.com` (Teso la Monja ≠ Viñedos de Paganos) o `bodegasriojanas.com` (Torreduero, Viore). El guardado manda a revisión cualquier vínculo hecho solo por dominio cuando los nombres no se parecen (`vinculoDudosoPorDominio`). Las webs de redes sociales o del propio consejo no van a `bodegas.web`.

#### Navarra (`navarrawine.com`): bodegas, vinos y experiencias

| Clave | Detalle |
| --- | --- |
| Auditoría (2026-11-08) | `robots.txt` solo bloquea `/wp-admin/` y los formularios. El aviso legal prohíbe reproducir o comunicar contenidos sin autorización y no dice nada de la extracción. Sin anti-bot. La REST pública (`wp-json/wp/v2/bodegas`) devuelve `acf` vacío, así que se lee el HTML |
| Recorrido | `sitemap_index.xml` → `bodegas-`, `vinos-` y `experiencias-sitemap.xml` → fichas, más `/bodegas-navarra/` para la zona |
| Código | `scrapers/fuentes/consejos/navarra/`. El guardado es el de Rioja, extraído a `consejos/comun/guardar-completo.ts` (`GuardadoConsejoCompleto`, con la D.O. como parámetro); `GuardadoRioja` es ahora una subclase que fija la D.O. Los helpers de tipo, crianza, añada, precio, duración e idiomas pasan a `comun/vinos.ts` y `comun/servicios.ts`; Rioja los re-exporta y sus tests no cambian |
| Bodega | Contacto, web, coordenadas (iframe del mapa), servicios de enoturismo e instalaciones, y enlaces a sus vinos y experiencias. La ficha no trae CP. El municipio sale de la dirección o de la de sus experiencias, con una lista de municipios de la D.O. La provincia es Navarra (`provinciaUnica`: la D.O. está entera en la Comunidad Foral) |
| Vino | Nombre, tipo y crianza («Tinto Crianza»), variedades, meses de barrica (hecho `anada.barrica_meses`) y bodega por el enlace «Ver bodega». El precio de la ficha va solo a `datos` |
| Experiencia | Tipo, precio, duración (la web da horas sin unidad), idiomas, temporada y horario, enlace de reserva y bodega. El texto se usa para clasificar el tipo, pero no se guarda |

**Dry-run completo (2026-11-09)**, sin tocar la BD: 322 peticiones, **0 errores**, en 2 h 8 min. Los vinos tardaron unos 28 s por ficha, con dos timeouts reintentados; al día siguiente una ficha respondía en 4 s. El workflow tiene 150 min de margen.

| Entidad | Fichas | Detalle |
| --- | --- | --- |
| Bodegas | 30 | Todas con web, teléfono, email y provincia; 24 con zona; 16 con municipio (de la dirección o de sus experiencias); 19 visitables; 8 con coordenadas |
| Vinos | 255 | Bodega por enlace explícito: 253. Las otras 2 van a revisión (su bodega no tiene ficha). Tipo en todos: 141 tintos, 61 blancos, 45 rosados, 8 dulces. Crianza en 155; uvas en todos; meses de barrica en 126 |
| Experiencias | 28 | Todas con su bodega, idiomas y horario; 25 con precio; 27 con duración; 24 con enlace de reserva |

---

## 6. Rutas del vino y enoturismo

### 6.1 Ruta del Vino Ribera del Duero (`rutadelvinoriberadelduero.es`) — apta con condiciones

- WordPress (Elementor, JetEngine, The Events Calendar, WooCommerce, Directory Pro), bilingüe ES/EN. Promovida por el Consorcio Ruta del Vino Ribera del Duero (marca «Ribérate»); un folleto de 2025 cita **70 bodegas adheridas**.
- **robots.txt:** bloquea logs/uploads de WooCommerce, `wp-admin`, `wp-includes`, plugins y temas y, **desde la revisión del 2026-11-08, `/wp-json/` y `/?rest_route=`** (la API REST y la Store API **no se pueden usar**; la versión anterior de esta sección las daba por permitidas). Sí están permitidos los sitemaps (`product-sitemap.xml`, `directories-sitemap.xml`) y el HTML público de `/producto/<slug>/` y `/directories/<slug>/`.
- **Aviso legal:** todos los derechos reservados; la transmisión, reproducción, comunicación pública, transformación o almacenamiento, total o parcial, requiere permiso previo por escrito; fuera de eso, solo uso estrictamente privado. **No menciona** bases de datos, scraping ni minería. Contacto: `info@riberate.com`. Aplicación: hechos (nombre de actividad, precio, duración, enlace de reserva, bodega) con enlace; escribir al Consorcio para pedir conformidad antes de producción (tiene interés: les enviamos tráfico).
- **Rutas útiles:** `product-sitemap.xml` (171 URLs ≈ 85 productos ES+EN: **paquetes y experiencias**), `directories-sitemap.xml` (857 URLs ≈ 430 fichas ES: bodegas, restaurantes, alojamientos, patrimonio, municipios), `tribe_events-sitemap.xml` (679 eventos), `rutas-tematicas-sitemap.xml`. Tipos de contenido: `product`, `directories`, `tribe_events`, `rutas-tematicas`. ~~API REST/Store API~~: prohibidas por robots.txt (ver arriba). En el HTML de `/producto/<slug>/` están el título, el precio (`p.price`), la categoría (clase `product_cat-…`) y la URL de reserva externa (`form.cart[action]`); en `/directories/<slug>/`, la categoría (icono bajo el título) y el bloque de contacto y horario. Implementado en `scrapers/fuentes/ruta-ribera/`; la fuente nace con `activa = false` hasta tener el permiso escrito del Consorcio.
- **Campos frente al esquema (`servicios_bodega`):** tipo (visita, cata, maridaje, spa…) ~ (categoría/atributos), título ✔, descripción (reservada: solo extracto/enlace), `precio_desde` ✔ cuando no es 0 (muchos productos salen a 0 € porque el precio está en el enlace externo), duración/idiomas/horario ~ (texto), `url_reserva` ✔ (permalink o URL externa). Vínculo con la bodega: por la **web/dominio** de la ficha de `directories`.
- **Riesgos:** precios 0 € o caducados (promociones como «Noviembre Mes del Enoturismo»); duplicados ES/EN; los eventos tienen fecha y caducan. **Veredicto: apta con condiciones.**

### 6.2 Rutas del Vino de España (ACEVIN), Rioja Alavesa y similares — con condiciones, sin auditar a fondo

- **Rutas del Vino de España** (`wineroutesofspain.com`): `robots.txt` 200 vacío (todo permitido). Portal con **38 rutas** y un subdominio de experiencias (`experienciasrve.wineroutesofspain.com`) con reservas; las fichas por ruta y los términos no se han leído. Útil en cuanto se amplíe a más D.O. (cada ruta suele remitir a su propia web, ver §6.1 como modelo).
- **Rioja Alavesa** (`riojaalavesa.com`): WordPress con `robots.txt` por defecto. Las experiencias de Rioja ya vienen del Consejo (§5.1: 371 fichas con reserva), así que no es prioritaria.
- **Turismo Castilla y León** (`turismocastillayleon.com`): `robots.txt` bloquea el buscador interno y rutas de gestión; folletos PDF de las rutas del vino (no extraer: solo enlazar).

---

## 7. Fuentes abiertas

### 7.1 Wikidata (CC0) — apta

- Sin restricciones de licencia (**CC0**); API SPARQL (`query.wikidata.org/sparql`) y `Special:EntityData/<QID>.json`, con UA identificable y consultas ligeras.
- **Cobertura medida (2026-11-08):** 243 bodegas con `País = España` (clase *bodega*, `Q156362` y subclases): **55 con fecha de fundación (P571), 62 con web (P856), 168 con coordenadas (P625)**. Es decir, cubre sobre todo las bodegas famosas; en Ribera y Rioja será una fracción pequeña de las ~500 bodegas.
- **Uso recomendado:** (a) hechos de historia de bodegas notables (fundación, fundadores `P112`, propietario `P127`, sede `P159`, municipio `P131`) para el resumen propio; (b) **QID** y `P856` como clave de emparejamiento y como enlace «Wikipedia/Wikidata» desde la ficha; (c) sinónimos y color de **variedades de uva** y relaciones de las D.O. (para `variedades_uva`, `denominaciones`); no medido el volumen.
- **Riesgo:** datos escasos y desiguales; la calidad se verifica con la web de la bodega. **Veredicto: apta**, coste muy bajo.

### 7.2 Wikipedia (CC BY-SA 4.0) — con condiciones

Los textos son CC BY-SA: copiarlos obliga a atribuir y a compartir igual. Dado que el proyecto redacta resúmenes propios, usar Wikipedia solo como fuente de hechos (y enlazarla desde el resumen), vía la API de MediaWiki con UA propio; **no pegar fragmentos**.

### 7.3 Registros oficiales (MAPA, AESAN, comunidades) — por verificar

- **MAPA:** publica informes anuales de DOP/IGP de vinos (Word/PDF, agregados por D.O.: nº de bodegas, producción, comercialización). Útil como **contraste de volumen**, no como lista de bodegas. No hay un dataset de bodegas embotelladoras del MAPA localizado.
- **AESAN – RGSEAA:** su sección «Datos abiertos» enlaza `/registro-sanitario` y `/registro-sanitario/empresas-alimentarias` («empresas alimentarias establecidas en España»). **No se ha podido confirmar** formato, campos (razón social, nº RGSEAA, domicilio, actividad), actualización ni licencia. Si trae razón social + nº RGSEAA + municipio sería la mejor clave de emparejamiento oficial (los embotelladores llevan registro propio, p. ej. el nº de embotellador que figura en la etiqueta). Revisarlo antes de decidir.
- **Comunidades autónomas** (datos.gob.es): hay conjuntos con descarga (CSV/JSON/XLSX): *Bodegas* de la Región de Murcia (CSV), *Bodegas de vino y txakoli de Euskadi*, *Registro de industrias agroalimentarias de Castilla-La Mancha*. **No se localizó** uno de Castilla y León ni de La Rioja (queda revisar los portales de datos abiertos de la Junta de Castilla y León y del Gobierno de La Rioja). Licencias habituales: CC BY / reutilización de la Ley 37/2007; confirmar por conjunto.
- **Veredicto: con condiciones / por investigar**; prioridad baja (solo aportan claves de emparejamiento y verificación).

---

## 8. Recomendaciones técnicas para los scrapers

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

### Añadidos de la ola 4

- **Puerta de cumplimiento por sitio** para el crawler de webs de bodegas (§3): `robots.txt` + búsqueda de cláusulas anti-robot en el aviso legal + no continuar ante 401/403/429/desafío. Registrar el motivo en `fuentes.notas_robots` / `registros_fuente`.
- **Concurrencia:** una conexión y 3–5 s por dominio, pero varios dominios distintos en paralelo (≤ 8) para que el crawler de ~225 sitios quepa en jobs de < 60 min; partir en matriz de lotes.
- **Preferencia de datos:** API pública de WordPress/WooCommerce y sitemaps antes que HTML; JSON-LD antes que selectores; PDF y JavaScript fuera de la v1.
- **TDM:** respetar las reservas expresas de minería de textos y datos (p. ej. Lavinia, art. 4 de la Directiva 2019/790) como si fueran `Disallow`.
- **Auditar los términos cuando se implemente** cada fuente de §4–§6 marcada «pendiente»; este documento no sustituye esa lectura.
- **Fuentes de la ola 4 con aviso previo recomendado:** C.R. DOCa Rioja y Consorcio Ruta del Vino Ribera (reservan derechos y piden permiso para reproducir; ofrecemos atribución y enlace).
