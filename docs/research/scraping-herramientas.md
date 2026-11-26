# Herramientas y nuevas fuentes para los scrapers (investigación, fase 1)

> Investigación del 2026-11-08, sin código en `scrapers/`. Objetivo del usuario: **más bodegas y más vendedores con precio** para el comparador (Fase 2 del [ROADMAP](../ROADMAP.md)). Complementa [SOURCES.md](../SOURCES.md), que sigue siendo la referencia de cada fuente ya auditada.
>
> Método: búsqueda de herramientas en GitHub/npm/PyPI y en directorios de skills y MCP; consulta **de solo lectura** a Supabase (`registros_fuente`, `id_externo = 'sitio'`); auditoría ligera de 20 sitios con el UA del proyecto (`wine-app-bot/0.1 … contacto: …`), **≤ 5 peticiones por sitio y ≥ 12 s entre ellas**, sin escribir en la BD. Las licencias y el mantenimiento se tomaron de las fichas de npm/PyPI/GitHub a esta fecha: confirmarlos al instalar. No es asesoramiento jurídico.

## Resumen

1. **No hace falta cambiar de stack.** `fetch` + `cheerio` + `robots-parser` + nuestro `ClienteHttp` cubren el 95 % de los casos. Lo que más rinde son **piezas pequeñas** encima: extractor de microdatos/JSON-LD genérico, validación de EAN, peticiones condicionales (`ETag`/`Last-Modified`) y un registro de adaptadores por sitio.
2. **Crawlee y Playwright no compensan como base.** Crawlee trae por defecto cabeceras y huellas de navegador simuladas (choca con la regla del proyecto) y duplicaría lo que ya hace `ejecutar()`. Playwright solo como **último recurso por sitio**, desactivado por defecto (§1.1).
3. **Webs de bodegas con tienda y precio: ≈ 50–55 de las 160** (≈ 40 % de las 129 accesibles). 40 exponen la Store API de WooCommerce con precio y otras ~10–15 tienen WooCommerce con JSON-LD `Offer` en la ficha. **Hoy el crawler no guarda el precio de los vinos**: es la mejora con mejor relación coste/beneficio para el comparador (§3.2).
4. **Tiendas nuevas aptas a priori: Vinatis, Vila Viniteca, Mariskal, Coalla Gourmet y Vinorea** (re-auditadas el 2026-11-10: solo **Vinatis y Vinorea** quedan aptas; ver [SOURCES §4.6](../SOURCES.md)) (robots permisivo, sin anti-bot con nuestro UA, avisos legales sin cláusula anti-robots). **Bloqueadas**: Uvinum/Drinks&Co, Gourmet Hunters y Santa Cecilia (Cloudflare 403). Se suman a Vinissimus, ya apta.
5. **Afiliados:** la vía legítima para EAN y precio de las tiendas que bloquean. **Vinatis ES está en Tradedoubler con feed de producto**; Vinoselección también aparece en Tradedoubler; ECI y Carrefour en Awin. El alta la tiene que hacer el usuario y cada anunciante decide (§3.3).
6. **Directorios:** Toro, Cigales, Bierzo y Priorat responden con robots permisivo; Rías Baixas sigue en 403. Ninguno tiene un sitemap de bodegas; habrá que leer una página-listado por consejo (§3.4).

---

## 1. Herramientas

Leyenda de **encaje**: ✔ se integra sin tocar la arquitectura (`lib/http.ts`, `robots.ts`, `ejecutar()`, GitHub Actions); ~ se integra con adaptación; ✘ no encaja o choca con las reglas.

**Coste en Actions:** el repositorio es privado (plan gratuito: 2.000 min/mes en `ubuntu-latest`). Uso estimado hoy: webs-bodegas ≈ 3 jobs × ≤ 60 min por semana (≈ 600–720 min/mes) más ~5 fuentes × ~30 min por semana (≈ 500–600 min/mes) ⇒ **≈ 1.100–1.300 min/mes**. Quedan unos 700 min de margen; cualquier herramienta que añada navegador consume ese margen rápido. Si el repo se hace público, los minutos de runners estándar son gratis.

### 1.1 Renderizado de páginas con JavaScript

| Herramienta | Licencia | Mantenimiento | Encaje | Coste Actions | Veredicto |
| --- | --- | --- | --- | --- | --- |
| **Playwright** (`playwright`, Microsoft) | Apache-2.0 | Muy activo (versión mensual) | ~ Necesita su propio cliente: habría que envolverlo para que pase por `comprobarRobots`, el limitador por host y la parada ante 403/429, y **bloquear peticiones a terceros** (analítica, CDNs). El UA se puede fijar al nuestro (`userAgent` del contexto) | Instalar Chromium ≈ 1–2 min por job (cacheable con `actions/cache`); 2–6 s y 1 + N peticiones por página (subrecursos) | **Solo como último recurso**, por sitio y con lista blanca, para webs cuyo contenido no existe sin JS. Hoy no hay ningún caso confirmado: de los 16 sitios «genéricos sin vinos» hay que ver primero si es falta de sitemap o de JS (§4.2) |
| **Crawlee** (`crawlee`, Apify) | Apache-2.0 | Muy activo (3.x) | ✘ como base: duplica `ejecutar()`, la cola y el limitador; su `HttpCrawler`/`CheerioCrawler` usa `got-scraping`, que **genera cabeceras de navegador** y en los crawlers de navegador activa **huellas (fingerprints) por defecto**, justo lo que la regla prohíbe. Habría que desactivarlo todo y fijar nuestro UA. Las versiones recientes traen `respectRobotsTxtFile` | +30–60 MB de dependencias; mismo coste de red | **No adoptar.** Tomar ideas: `RequestQueue` persistente y `maxRequestsPerCrawl`, que ya tenemos de forma propia (`--presupuesto-min`, lotes) |
| Puppeteer | Apache-2.0 | Activo | ~ Igual que Playwright, menos ergonómico | Igual | Sin ventaja sobre Playwright |

Política propuesta para JS: `renderizar: true` solo se activa en el adaptador de un sitio (§4), tras comprobar a mano que (a) `robots.txt` lo permite, (b) no hay sitemap ni API con el mismo contenido y (c) el aviso legal no lo prohíbe. Tope de 30 páginas renderizadas por ejecución y job aparte en Actions para no gastar minutos en el resto.

### 1.2 Datos estructurados (schema.org, JSON-LD, microdatos, OpenGraph)

| Herramienta | Lenguaje / licencia | Mantenimiento | Encaje | Veredicto |
| --- | --- | --- | --- | --- |
| **Extractor propio con cheerio** | TS / — | Nuestro | ✔ Ya leemos JSON-LD en `webs-bodegas/html.ts` | **Recomendado**: añadir microdatos (`itemscope`/`itemprop`, ~80 líneas) y `og:`/`product:price:*`, y moverlo a `scrapers/lib/estructurados.ts` para que lo usen tiendas y webs |
| `web-auto-extractor` (indix) y su fork `@marbec/web-auto-extractor` | JS / MIT | Original sin mantenimiento desde ~2017; el fork en beta y con poco uso | ~ | Útil como referencia de código, no como dependencia |
| **metascraper** (microlink) | JS / MIT | Activo | ~ Orientado a metadatos de artículo (título, imagen, autor, fecha). Tiene reglas para OpenGraph/JSON-LD | Solo si se quiere una cascada robusta de `og:image` para imágenes de bodega (fase B ya lo resuelve a mano). Opcional |
| **schema-dts** (Google) | TS / Apache-2.0 | Activo | ✔ Solo tipos | **Recomendado** (dev): tipar `Product`, `Offer`, `Organization`, `Event` del JSON-LD |
| **extruct** (Zyte) | Python / BSD-3 | Activo | ✘ Otro runtime en Actions | El de referencia en Python (JSON-LD, microdatos, RDFa, OpenGraph, microformatos). No compensa meter Python solo por esto |

### 1.3 Contenido principal (texto para extraer hechos)

| Herramienta | Lenguaje / licencia | Encaje | Veredicto |
| --- | --- | --- | --- |
| **@mozilla/readability** + `linkedom` | JS / Apache-2.0 (+ ISC) | ✔ Pura, sin red; recibe el HTML que ya descargamos | **Recomendado** para páginas de historia/enoturismo «genéricas», donde hoy el texto se saca con selectores por bloques. Medir antes con los fixtures: si no mejora la extracción de hechos, no se añade |
| **trafilatura** | Python / Apache-2.0 (desde 1.8; antes GPL) | ✘ Otro runtime | Mejor calidad que Readability en benchmarks, pero no justifica Python |
| `@extractus/article-extractor` | JS / MIT | ~ Hace la petición él mismo (saltaría nuestro `ClienteHttp`) | No: pasarle solo HTML es incómodo |

Recordatorio: el texto se usa **solo para extraer hechos**; no se guarda ni se muestra (SOURCES, «Política de textos»).

### 1.4 Detección de plataforma

| Herramienta | Licencia | Encaje | Veredicto |
| --- | --- | --- | --- |
| **Huella propia** (`webs-bodegas/clasificar.ts`) | — | ✔ | **Mantener y ampliar** con las reglas de abajo |
| `enthec/webappanalyzer` (fork comunitario de las reglas de Wappalyzer) | **GPL-3.0** | ~ Son JSON con miles de reglas; copiarlas a nuestro repo arrastra la GPL | **No** como dependencia. Consultarlo a mano para escribir nuestras reglas |
| `simple-wappalyzer`, `wappalyzer-js-cli` | GPL-3.0 | Igual | No |

Reglas mínimas a añadir (todas sobre la portada, sin peticiones extra salvo la última columna):

| Plataforma | Señal en HTML / cabeceras | API pública a probar (si `robots.txt` la permite) |
| --- | --- | --- |
| WooCommerce | `woocommerce` en clases/`wp-content/plugins/woocommerce`, `<link rel="https://api.w.org/">` | `/wp-json/wc/store/v1/products` (ya implementado) |
| Shopify | `cdn.shopify.com`, `Shopify.theme`, cabecera `x-shopify-stage` | `/products.json?limit=250` (fase B) |
| PrestaShop | `<meta name="generator" content="PrestaShop">`, `prestashop` en JS global, sitemaps `1_es_0_sitemap.xml` | No hay API pública: sitemap + JSON-LD/microdatos de la ficha |
| Magento 2 | `mage-init`, `Magento_` en scripts, `/static/version…/frontend/` | No (la REST requiere token): sitemap + JSON-LD |
| Wix | `static.wixstatic.com`, `X-Wix-Request-Id` | `store-products-sitemap.xml` (fase B) |
| Squarespace | `static1.squarespace.com`, `Squarespace.` en JS | `?format=json` existe pero no está documentada como pública: **no usar**; sitemap + JSON-LD |
| VTEX / SFCC | `vteximg`, `demandware.static` | No: suelen ir con anti-bot (ECI) |

### 1.5 Normalización de productos y EAN

| Herramienta | Licencia | Encaje | Veredicto |
| --- | --- | --- | --- |
| **Función propia `validarGtin()`** | — | ✔ | **Recomendado**: módulo 10 GS1 en ~15 líneas; normalizar a GTIN-13 (quitar ceros a la izquierda de GTIN-14, rechazar códigos internos 20–29 y 02/04 de uso interno) |
| `gtin` (npm) | MIT | ✔ | Alternativa si se prefiere dependencia (valida GTIN-8/12/13/14) |
| `cdigit` | MIT | ✔ | Más general (ISBN, IBAN…); de más |

Normalización del producto (sin librería: no hay una buena para vino). Proponer en `scrapers/lib/emparejamiento/` (lo lleva otra sesión, aquí solo se recomienda): formato en ml a partir de «75 cl», «0,75 L», «Magnum», «1,5 L»; añada separada del nombre («Aalto 2021»); «estuche», «pack 6», «caja de 3» → `unidades`; precio por botella = precio / unidades; marcas de crianza (joven, roble, crianza, reserva, gran reserva). Prefijo **84** = empresa registrada en GS1 España (indicio útil, no prueba de origen).

### 1.6 Programación del rastreo: colas, caché y condicionales

| Herramienta | Licencia | Encaje | Veredicto |
| --- | --- | --- | --- |
| **`ETag`/`Last-Modified` a mano en `ClienteHttp`** | — | ✔ Guardar por URL en `registros_fuente.datos` y enviar `If-None-Match`/`If-Modified-Since`; un **304** reutiliza los hechos sin reprocesar | **Recomendado**. Encaja con el «incremental semanal» de la fase B (que ya usa `lastmod`/`modified`) |
| `undici` (interceptor `cache`, RFC 9111) | MIT | ~ Hay que pasar un `Agent` propio a `fetch` y persistir el almacén entre ejecuciones (Actions no guarda disco salvo con `actions/cache`) | Innecesario si se hace lo anterior |
| `make-fetch-happen` (npm) | ISC | ~ Caché HTTP en disco | Igual que undici |
| `p-queue` | MIT | ✔ | Ya tenemos `LimitadorPorHost`; solo si se necesita prioridad por cola |
| `sitemapper` / `sitemap-stream-parser` | MIT | ~ | Ya parseamos sitemaps; no aporta |
| `actions/cache` | MIT | ✔ | Para cachear Chromium si algún día se usa Playwright |

Ahorro estimado del condicional: en las webs WordPress, la mayoría de servidores devuelven `ETag` o `Last-Modified` en el HTML y en `wp-json`. Tras la primera pasada, un 304 cuesta lo mismo en peticiones pero **nada en proceso ni en escrituras**; el ahorro real de peticiones viene de no pedir lo que el sitemap marca sin cambios (fase B).

### 1.7 Skills de Claude Code y servidores MCP

Para **desarrollo y auditoría** (no para producción, donde todo corre en Actions con nuestro cliente):

| Herramienta | Licencia | Para qué | Veredicto |
| --- | --- | --- | --- |
| **Playwright MCP** (`@playwright/mcp`, Microsoft) | Apache-2.0 | Ver una web como la ve un navegador al diseñar un adaptador | **Útil** (ya instalado como plugin en este entorno). Ojo: usa UA de navegador, así que **no** sirve para auditar si una web nos bloquea; para eso, `curl`/script con nuestro UA |
| **Chrome DevTools MCP** (Google) | Apache-2.0 | Inspeccionar red y DOM de una ficha | Útil, mismo matiz |
| **Fetch MCP** (`modelcontextprotocol/servers`) | MIT | Descargar y pasar a markdown una página | Útil para lecturas sueltas; respeta `robots.txt` por defecto en peticiones iniciadas por el modelo |
| **context7** | MIT | Documentación actualizada de librerías | Útil (ya instalado) |
| **Skill propia `auditar-fuente`** (`.claude/skills/auditar-fuente/SKILL.md`) | — | Fijar el protocolo: ≤ 5 peticiones, ≥ 10 s, robots + aviso legal + anti-bot + plataforma + nº de referencias + EAN + precio, salida en tabla para SOURCES | **Recomendado**: es lo que hemos hecho a mano en tres sesiones; el script de esta auditoría puede ser su base |
| Skills comunitarias de crawl4ai (p. ej. `brettdavies/crawl4ai-skill`), `web-scraper` (Igosuki) | Varias (MIT/Apache) | Rastreo genérico | No: añaden Python y no siguen nuestra puerta legal |
| **Firecrawl** (MCP y API) | AGPL-3.0 (self-host) / API de pago | Rastreo con JS y extracción | **Descartado**: servicio en la nube con modos «stealth» y proxies; las peticiones no salen con nuestro UA |
| **Scrapling** y su skill | BSD-3 | Fetchers «stealthy», resolución de Turnstile | **Descartado** (fin: eludir bloqueos) |
| **Crawl4AI** (y MCP) | Apache-2.0 | Crawler con navegador | **Descartado** como dependencia: trae modo «stealth»/navegador no detectable; el resto no aporta frente a lo nuestro |
| Apify MCP, Bright Data MCP, ScraperAPI, ZenRows, Oxylabs… | Comerciales | Actores/«unblockers» con proxies residenciales | **Descartados** (regla del proyecto) |
| Tavily crawl | API de pago | Rastreo como servicio | Descartado: no controlamos UA ni ritmo |

### 1.8 Descartadas por la regla del proyecto (no probadas)

Stealth/anti-detección (`puppeteer-extra-plugin-stealth`, `playwright-extra`, `undetected-chromedriver`, `camoufox`, `nodriver`), suplantación de huella TLS/HTTP2 (`curl_cffi`, `curl-impersonate`, `tls-client`, `got-scraping` con huellas, `header-generator`, `fingerprint-generator`), rotación de proxies o IP residenciales (Bright Data, Oxylabs, Smartproxy, ScraperAPI, ZenRows), resolutores de captcha (2Captcha, CapSolver, Anti-Captcha) y cualquier «unblocker». **Si una web nos bloquea, no se usa** (SCOPE §7.3).

---

## 2. Arquitectura: qué cambiaría

Propuesta mínima, por orden (cada punto es un PR pequeño; ninguno se implementa en esta sesión):

1. `lib/estructurados.ts`: JSON-LD + microdatos + OpenGraph de producto → `{ nombre, marca, gtin, precio, moneda, disponibilidad, imagen, url }`. Lo usan webs-bodegas y las tiendas nuevas.
2. `lib/gtin.ts`: validar y normalizar EAN.
3. `ClienteHttp.get(url, { condicional })`: envía `If-None-Match`/`If-Modified-Since` si se le pasan; devuelve `status: 304` sin lanzar.
4. **Precio en webs-bodegas**: guardar `precio`, `moneda`, `disponible` y `ean` del vino que ya llega por la Store API o por JSON-LD `Offer` → tabla de ofertas de la Fase 2, con la bodega como «tienda».
5. Registro de adaptadores (§4).
6. Fuentes de tienda genéricas por plataforma: un **scraper de tienda PrestaShop/Magento/WooCommerce** parametrizado (sitemap de productos + ficha con JSON-LD/microdatos) que sirva para Vinatis, Coalla, Vinorea, Mariskal y Vila Viniteca con un fichero de configuración cada una, en vez de cinco scrapers a medida.

---

## 3. Nuevas fuentes

### 3.1 Tiendas: auditoría ligera (2026-11-08)

Peticiones por sitio entre paréntesis (máx. 5), ≥ 12 s entre ellas, UA del proyecto. «Ribera/Rioja» es el nº de referencias si se pudo medir sin pasar de 5 peticiones.

| Tienda | Plataforma | robots.txt | Términos | Anti-bot con nuestro UA | Ribera / Rioja | EAN | Precio visible | Veredicto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Vinatis** (`vinatis.es`) (5) | Propia (sitemaps `5_es_*`) tras Cloudflare | Mínimo: solo `Sitemap:` (todo permitido) | `/condiciones-generales` leído: sin cláusula contra robots ni minería | No (200 en portada, sitemap y términos) | Sin medir (sitemap de categorías con 2.454 URL; ~5.000 referencias según su ficha de afiliado) | Sin comprobar | Sí (portada) | **Apta a priori**. Alternativa preferente: **feed de Tradedoubler** (§3.3) |
| **Vila Viniteca** (`vilaviniteca.es`) (5) | Magento 2 tras Cloudflare | Permisivo; bloquea carrito, cuenta, buscador `?q=`, `SID` | No localizado en la portada; **pendiente** | No (el «captcha» detectado es la config. del login de Magento: falso positivo) | Sin medir; sitemap ES de productos, categorías y CMS actualizado a diario | Sin comprobar | Sí | **Apta a priori**; leer términos antes de implementar. Tienda grande y de referencia (fundada en 1932) |
| **Mariskal** (`mariskal.es` → `mariskal.com`) (5) | WordPress + WooCommerce | Por defecto de Woo | Aviso legal leído: prohíbe la difusión con fin «pública o comercial» sin consentimiento; **no menciona robots** | No | Sin medir; 2 sitemaps de productos | Sin comprobar | Sí | **Apta con condiciones** (solo hechos, privado). La Store API responde **401**: ir por sitemap + JSON-LD |
| **Coalla Gourmet** (`coallagourmet.com`) (5) | PrestaShop | Permisivo para `*` (bloquea facetas, buscador, carrito); `Crawl-delay` solo para bots concretos | Aviso legal leído: propiedad intelectual reservada; **sin cláusula anti-robots** | No | Categoría «Vinos Ribera del Duero» (`/es/1406-…`) existe; recuento no fiable | Sin comprobar | Sí | **Apta a priori** |
| **Vinorea** (`vinorea.com`) (5) | PrestaShop | Permisivo (PrestaShop por defecto) | Aviso legal leído: reproducción requiere consentimiento; **sin cláusula anti-robots** | No | **Ribera ≈ 140** productos (categoría `/vino/espana/ribera-de-duero/`) | No visto en JSON-LD (la página probada era un listado) | Sí | **Apta a priori** |
| **Vinissimus** | Propia | Muy permisivo | **Pendiente** (ver SOURCES §4.2) | No | ~5.000 vinos en total | No | Sí | Ya apta (SOURCES §4.2) |
| Uvinum / Drinks&Co (`uvinum.es`) (2) | WordPress tras Cloudflare | 200 | — | **403** en portada | — | — | — | **No apta** (confirma SOURCES §4.4) |
| Gourmet Hunters (`gourmethunters.com`) (2) | — tras Cloudflare | 200, con `Content-Signal` y `crawl-delay: 1` | — | **403** en portada | — | — | — | **No apta** |
| Bodegas Santa Cecilia (`santacecilia.es`) (2) | — tras Cloudflare | 200 | — | **403** en portada | — | — | — | **No apta** |
| Lavinia | — | — | Reserva TDM | Desafío | — | — | — | No apta (SOURCES §4.3) |
| Vinomanos (`vinomanos.com`) (3) | WordPress tras Cloudflare | Permisivo, `Content-Signal` todo `yes` | — | No | Sus sitemaps son de entradas: **es un blog**, no tienda | — | — | Descartada (no aporta) |
| La Enoteca (`laenoteca.es`) (4) | WordPress + WooCommerce | Por defecto | — | No | Su sitemap solo tiene entradas, páginas y categorías: **no parece tienda online** | — | — | Descartada (no aporta) |
| Bodega Online (`bodegaonline.es`) (2) | — | Timeout de conexión | — | — | — | — | — | No verificable; reintentar otro día |
| Vinos Online (`vinosonline.es`) (2) | — | Certificado TLS inválido | — | — | — | — | — | No verificable |
| Licores Mundo | — | El dominio `licoresmundo.com/.es` no resuelve | — | — | — | — | — | No localizada; hace falta la URL correcta |
| Enoteca (genérica) | — | `enoteca.es` es un dominio aparcado | — | — | — | — | — | Hace falta saber a qué tienda se refiere |

Notas: (1) «Apta a priori» = robots y avisos sin objeción y sin bloqueo con nuestro UA; antes de implementar hay que medir referencias de Ribera/Rioja, EAN en la ficha y leer términos completos (protocolo de SOURCES). (2) Todas son comercios con ánimo de lucro: mismas condiciones que Vinopremier (solo hechos y precio, enlace, imagen enlazada, rate limit 10–14 s tras el incidente de Vinopremier). (3) Para un comparador, **precio + disponibilidad + URL + EAN** es lo único que necesitamos de cada tienda.

**Volumen esperable** (estimación, a confirmar): Vinatis y Vila Viniteca son las de más catálogo (miles de referencias, probablemente 200–400 de Ribera/Rioja cada una); Vinorea ≈ 140 de Ribera; Mariskal y Coalla, decenas a un par de centenares. Con alto solapamiento entre sí y con Vinoselección/Vinopremier/Vinissimus: el valor está en el **número de precios por vino**, no en vinos nuevos.

### 3.2 Tiendas online de las propias bodegas

Datos de Supabase (solo lectura, `registros_fuente` con `id_externo = 'sitio'`, 160 webs):

| Medida | Webs |
| --- | --- |
| Total registradas | 160 |
| Pasaron la puerta (con huella) | **129** (31 fuera: 12 inaccesibles, 10 bloqueo HTTP, 4 cláusula legal, 3 anti-bot, 1 robots, 1 exclusión manual) |
| WordPress / genérico / Wix / Shopify | 91 / 34 / 4 / 0 |
| Con WooCommerce en la huella | **63** |
| Con Store API de WooCommerce pública (extractor `wordpress+woocommerce`) | **40** (38 con vinos desde la API) |
| Con algún vino detectado | 106 |
| Con URLs de tienda (`/producto/`, `/tienda/`, `/shop/`, `/comprar/`) | 48 |
| Registros de vino de webs | 536 (74 dominios), **12 con EAN** |

**Estimación: ≈ 50–55 webs con tienda y precio** (las 40 de la Store API, que siempre devuelve `prices.price`, más ~10–15 de las 23 WooCommerce sin API pública, que suelen publicar JSON-LD `Product`/`Offer` en la ficha). Es ≈ 33 % de las 160 y ≈ 40 % de las accesibles. Matiz: en la Store API también salen experiencias de enoturismo y lotes; hay que filtrar por clase «vino» (ya se hace) y por formato.

**Hoy el precio no se guarda** en los vinos de webs (solo en servicios: 84 con precio). Guardarlo da **≈ 300–400 precios de bodega** (precio de referencia de la propia bodega) sin peticiones nuevas. El EAN sale poco (12/536): WooCommerce lo guarda en campos de plugins (`_alg_ean`, `global_unique_id` en Woo ≥ 9.2) que la Store API no siempre expone; con el JSON-LD de la ficha (`gtin13`) sube algo.

### 3.3 Feeds de afiliados

| Red | Tiendas de vino localizadas | Feed | Alta |
| --- | --- | --- | --- |
| **Tradedoubler** | **Vinatis ES** (programa 353874, desde enero de 2024: «feed de producto: sí», *deep linking* sí, cookie 15 días); Vinoselección (programa CPC ES) | Sí en Vinatis (CSV/XML con EAN y precio habitualmente; formato no verificado) | Cuenta de *publisher* con web; solicitud a cada programa; el anunciante aprueba |
| **Awin** | El Corte Inglés (perfil 13075), Carrefour Supermercado (25399) — ver SOURCES §4.3/§4.5; Lavinia y Vinoteca Central del Maresme aparecen en directorios de afiliados (red no confirmada) | *Create-a-feed* por anunciante, tras aprobación | Formulario en `ui.awin.com/publisher-signup`, **depósito reembolsable** (1 € según su centro de ayuda; fuentes antiguas dicen 5 €), perfil completo con web; cada anunciante aprueba |
| **Admitad** | Drinks&Co aparece solo con su programa **italiano, cerrado** | — | No compensa por ahora |
| Otras | Bodeboca en **TradeTracker** (cerrado); Vintae en Daisycon; Vinatis también en FlexOffers | — | — |

Condiciones y riesgos: (1) **el alta la hace el usuario**, no nosotros (no creamos cuentas); (2) los programas piden una web pública que promocione: la app es privada, así que **probablemente nos rechacen** hasta la fase pública; (3) el feed se licencia para mostrar productos **con el enlace de afiliado**: encaja con un comparador, pero hay que mostrar la oferta con ese enlace y respetar sus normas (marca, precios actualizados); (4) ganar comisión cambiaría el carácter «sin ánimo de lucro»: se puede renunciar o donarla, pero es decisión del usuario. **Recomendación:** pedir el alta en Tradedoubler para Vinatis cuando haya una URL pública mínima; mientras, scraper educado de Vinatis (§3.1) o esperar.

### 3.4 Directorios de bodegas permitidos

| Fuente | Acceso (2026-11-08) | Qué hay | Veredicto |
| --- | --- | --- | --- |
| **D.O. Toro** (`dotoro.es` → `dotoro.com`) (3) | robots mínimo; WordPress; sitemaps de entradas, páginas y categorías | Sin sitemap de bodegas: listado en una página | **Apta a priori**; leer `/aviso-legal/` |
| **D.O. Cigales** (`do-cigales.es`) (3) | robots mínimo; WordPress con CPT `cpt_portfolio` y `cpt_services` en el sitemap del núcleo | Bodegas probablemente en `cpt_portfolio` (sin confirmar) | **Apta a priori**; probar `wp-json/wp/v2/types` |
| **D.O. Bierzo** (`crdobierzo.es`) (2) | `robots.txt` **404** (= todo permitido); HTML propio (Apache) | Sitio pequeño; bodegas en una sección | **Apta a priori** |
| **D.O.Q. Priorat** (`doqpriorat.org`) (3) | robots mínimo; WordPress + Yoast | **99 bodegas inscritas** según su web; sin sitemap de bodegas | **Apta a priori**; leer `/legal/` |
| **D.O. Rías Baixas** (`doriasbaixas.com`) (1) | **403** en `robots.txt` | — | **No apta** (confirma SOURCES §5.2) |
| D.O. Rueda, D.O. Navarra | Ya auditadas (SOURCES §5.2): Rueda 74 bodegas con web; Navarra con sitemaps por tipo y WP REST | | Aptas con condiciones |
| Ruta del Vino de Rueda (`rutadelvinoderueda.com`) (2) | `/robots.txt` redirige a `index.php` (no hay robots) | Web antigua | Baja prioridad |
| Ruta del Vino de Toro (`rutadelvinodetoro.com`) (2) | Conexión rechazada | — | No verificable |
| Rutas del Vino de España (`wineroutesofspain.com`) (2) | robots vacío; WAF BitNinja delante pero 200 | 38 rutas, WooCommerce de experiencias | Con condiciones (SOURCES §6.2) |
| **Wikidata** | CC0, SPARQL | ~243 bodegas españolas | Apta (SOURCES §7.1) |
| **datos.gob.es / autonomías** | Euskadi (bodegas y txakoli), Murcia, Castilla-La Mancha (industrias agroalimentarias) con CSV/JSON | Razón social, municipio, a veces registro | Con condiciones; sin dataset de Castilla y León ni La Rioja localizado. Castilla y León lleva un **registro de envasadores/embotelladores** (Orden AYG/2054/2006, Ley 24/2003) sin descarga pública encontrada: se podría pedir por transparencia |
| **MAPA** | Informes anuales de DOP (Word/PDF) | Nº de bodegas por D.O. | Solo contraste de volumen |

Las bodegas de estos consejos entran sin `web` o con ella; con `web` alimentan el crawler (y su tienda, §3.2). Tamaños orientativos (sin medir, salvo Priorat y Rueda): Toro ~60, Cigales ~35, Bierzo ~75, Priorat 99, Rueda 74 (de SOURCES), Navarra ~29 publicadas ⇒ **≈ 370 bodegas nuevas** si se hacen las seis.

---

## 4. Adaptadores por bodega (diseño; no se toca `fuentes/webs-bodegas/`)

La fase B (rama `claude/webs-bodegas-fase-b`) ya convierte el crawler en «puerta → huella → extractor por plataforma (`EXTRACTORES`) → clasificación → hechos». Un **adaptador** es un extractor más, pero elegido por dominio en vez de por plataforma, y con la misma puerta legal delante.

### 4.1 Interfaz y registro

```ts
// scrapers/fuentes/webs-bodegas/adaptadores/tipos.ts (propuesta)
export interface AdaptadorSitio {
  /** Dominios registrables a los que aplica (sin www). */
  dominios: string[];
  /** Sube al cambiar selectores; se guarda en registros_fuente.datos.adaptador. */
  version: number;
  /** Qué hace: reemplaza el descubrimiento o lo completa tras el extractor de plataforma. */
  modo: "reemplaza" | "completa";
  /** Declarativo primero: la mayoría de adaptadores solo necesitan esto. */
  rutas?: {
    sitemaps?: string[];             // p. ej. ["/vinos-sitemap.xml"]
    listados?: string[];             // páginas con enlaces a fichas
    patronFicha?: RegExp;            // /\/vinos\/[^/]+\/$/
    excluir?: RegExp;                // /\/(en|fr)\//
  };
  selectores?: Partial<Record<"nombre" | "precio" | "anada" | "variedades" | "graduacion" | "crianza" | "ean", string>>;
  /** Solo si lo declarativo no basta. Recibe el mismo ContextoDescubrimiento (pedir() con presupuesto). */
  descubrir?: Extractor["descubrir"];
  extraerVino?: (html: string, url: string) => Partial<VinoWeb> | null;
  /** Último recurso, ver §1.1: false por defecto y revisado a mano. */
  renderizar?: false | { maxPaginas: number };
  /** Evidencia mínima que debe dar: si da menos, se avisa y se cae al genérico. */
  minimoVinos?: number;
  notas: string;                     // por qué existe, fecha, quién lo revisó
}

// adaptadores/index.ts: registro explícito (sin autodescubrimiento de ficheros)
export const ADAPTADORES: AdaptadorSitio[] = [aalto, matarromera /* … */];
export function adaptadorPara(dominio: string) { /* busca por dominio registrable */ }
```

Encaje en `sitio.ts` (un punto, en la elección de extractor): `const extractor = adaptadorPara(dominio) ?? EXTRACTORES[huella.plataforma]`. Con `modo: "completa"` se ejecuta el de plataforma y luego el adaptador. La puerta (`puerta.ts`), el presupuesto por sitio, `robots.txt` y la parada ante 401/403/429 **no cambian**: el adaptador nunca hace peticiones por fuera de `ctx.pedir`.

Cada adaptador lleva **fixture** (HTML mínimo factual) y un test en `adaptadores/<dominio>.test.ts`; el CI ya corre vitest.

### 4.2 Cómo detectar qué sitios lo necesitan

Consulta semanal (o vista en el panel de admin) sobre `registros_fuente` con `id_externo = 'sitio'`:

| Señal | Hoy | Acción |
| --- | --- | --- |
| Pasa la puerta, **0 vinos** | **23** (16 genéricos sin sitemap, 5 WP+sitemap, 2 WP) | Candidatos principales. Revisar a mano: ¿la web lista vinos? ¿en otra ruta o subdominio? ¿solo con JS? |
| Vinos con < 50 % de campos clave (tipo, añada, variedades) frente a la media | por medir | Adaptador `completa` con selectores |
| WooCommerce sin Store API (401/404) | 23 | Ya cubierto si el JSON-LD de la ficha basta; adaptador solo si no |
| Bodega con vinos en tiendas/Consejo pero 0 en su web | por medir (cruce con `anadas` de otras fuentes) | Prioriza qué webs mirar primero |
| Caída brusca: vinos(ejecución) < 50 % de vinos(anterior) | — | Aviso «adaptador roto» y caer al genérico |

Criterio para crear uno: la bodega es relevante (tiene vinos en ≥ 1 tienda o es de Ribera/Rioja), la web lo permite (puerta OK y aviso legal leído) y el genérico da < 2 vinos o datos claramente incompletos.

### 4.3 Coste de mantenimiento

- **Crear**: 30–60 min el declarativo (ver la web, sitemap, 1 fixture, test); 1–2 h si necesita código.
- **Romper**: una web de bodega se rediseña cada 2–4 años; con 20 adaptadores, ~5–10 roturas al año. El aviso de §4.2 las detecta sin mirar.
- **Tope sugerido: 20–30 adaptadores** y revisión anual; por encima, mejor invertir en el genérico (microdatos, Readability, sitemaps de subdominio).
- Renderizado JS: cada sitio con `renderizar` añade ~1–2 min por ejecución y el coste fijo de instalar Chromium; no más de 5 sitios así.

---

## 5. Plan priorizado en olas

Impactos estimados sobre el catálogo actual (**511 bodegas, 1.204 vinos**) y la Fase 2 (**tiendas con precio**). Las cifras son órdenes de magnitud.

### Ola A — sin fuentes nuevas, máximo rendimiento (1–2 semanas)

| Qué | Herramienta | Impacto |
| --- | --- | --- |
| Guardar **precio, moneda, disponibilidad y EAN** de los vinos de webs de bodega (Store API + JSON-LD `Offer`) | `lib/estructurados.ts`, `lib/gtin.ts` | **+≈ 50 «tiendas» (las propias bodegas)**, ≈ 300–400 precios de referencia; 0 peticiones nuevas |
| Microdatos + OpenGraph de producto en el extractor genérico | cheerio (propio) | +EAN y precio en sitios PrestaShop/Magento/a medida |
| Peticiones condicionales | `ClienteHttp` | Menos proceso y escrituras por pasada (en la línea del incremental de fase B) |
| Skill `auditar-fuente` | Claude Code | Auditorías repetibles y baratas |

### Ola B — tiendas nuevas con precio (2–4 semanas)

| Qué | Herramienta | Impacto |
| --- | --- | --- |
| Scraper de tienda **parametrizado por plataforma** (PrestaShop / Magento / WooCommerce por sitemap + ficha) | §2.6 | — |
| Vinorea, Coalla Gourmet, Mariskal, Vila Viniteca, Vinatis (en ese orden: de menos a más volumen y riesgo) | ídem, 10–14 s entre peticiones y tope por ejecución (lección de Vinopremier) | **+5 tiendas**, ≈ +800–1.500 precios; +100–300 vinos nuevos (resto, solapamiento). **Hecho (2026-11-10):** el re-audit dejó **2** (Vinatis y Vinorea); Vila Viniteca, Coalla y Mariskal descartadas ([SOURCES §4.6](../SOURCES.md)) |
| Vinissimus (ya apta) | ídem | +1 tienda, miles de precios |
| Emparejamiento por EAN y nombre normalizado (lo lleva otra sesión) | `lib/emparejamiento/` | Requisito para que esos precios caigan en el vino correcto |

### Ola C — más bodegas (3–5 semanas, en paralelo con B)

| Qué | Herramienta | Impacto |
| --- | --- | --- |
| Consejos de **Rueda y Navarra** (ya auditados) | Scrapers de consejo (patrón Rioja) | +≈ 100 bodegas, +≈ 250 vinos (Navarra) |
| Consejos de **Toro, Cigales, Bierzo y Priorat** | ídem; una página-listado cada uno | +≈ 270 bodegas |
| Sus webs al crawler (fase B ya escala a ~350 webs) | webs-bodegas | +≈ 1.000–1.500 vinos y ≈ +40 tiendas de bodega con precio |
| Wikidata para bodegas notables | SPARQL | Hechos de historia y QID |

### Ola D — adaptadores y casos difíciles (continuo)

| Qué | Herramienta | Impacto |
| --- | --- | --- |
| Registro de adaptadores + vista de «sitios sin vinos» | §4 | Recuperar parte de las 23 webs sin vinos (+≈ 50–100 vinos) |
| Readability para páginas de historia/enoturismo genéricas (si mejora los fixtures) | `@mozilla/readability` + `linkedom` | Más hechos de historia |
| Playwright solo para ≤ 5 sitios justificados | Playwright | Marginal; coste en minutos de Actions |

### Ola E — vías que dependen del usuario

| Qué | Requisito | Impacto |
| --- | --- | --- |
| **Tradedoubler → Vinatis** (feed con EAN y precio) | Alta del usuario + web pública; aceptar mostrar con enlace de afiliado | Sustituye el scraping de Vinatis con datos más completos |
| Awin → El Corte Inglés, Carrefour | Ídem; verificar que el vino esté en su feed | +2 tiendas grandes, hoy bloqueadas |
| Pedir permiso/feed a Bodeboca, Lavinia, Decántalo, Drinks&Co, Gourmet Hunters | Correo del usuario ofreciendo atribución y enlace | Hoy bloquean: 0 hasta que respondan |
| Registro de embotelladores de Castilla y León | Solicitud de acceso a información pública | Claves de emparejamiento (NIF/registro) |

**Resultado esperable tras A–C:** ≈ 880 bodegas (511 + ≈ 370), ≈ 2.500–3.000 vinos y **≈ 10 tiendas + ≈ 90 bodegas con precio**, frente a las 2 tiendas actuales (Vinoselección y Vinopremier, esta en pausa).

---

## Anexo: peticiones de esta auditoría

20 sitios, 60 peticiones en total, ninguna por encima de 5 por sitio, ≥ 12 s entre peticiones del mismo sitio, sin reintentos, sin cambiar UA ni IP ante 403. Los cuerpos descargados se quedaron en el directorio temporal de la sesión (no se suben al repo). Consultas a Supabase: solo `select`.
