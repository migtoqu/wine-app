# Scrapers

Llenan el catálogo con datos factuales de las fuentes del MVP (ver [`docs/SOURCES.md`](../docs/SOURCES.md) y SCOPE §7). Cada fuente sigue el mismo flujo: **extraer → normalizar → emparejar → consolidar**, con upsert idempotente y un registro por ejecución en `ejecuciones_scraper`. Emparejar y consolidar son comunes a todas las fuentes (ver [Consolidación](#consolidación)).

| Alias | Fuente (`fuentes.slug`) | Qué escribe | Workflow |
| --- | --- | --- | --- |
| `ribera` | `cr-ribera-del-duero` | `bodegas`, `bodega_denominaciones`, `registros_fuente` | `scrape-ribera.yml` (lunes 03:17 UTC) |
| `vinoseleccion` | `vinoseleccion` | `vinos`, `anadas`, `anada_variedades`, `imagenes`, `registros_fuente` | `scrape-vinoseleccion.yml` (miércoles 03:47 UTC) |
| `ruta-ribera` | `ruta-vino-ribera` | `servicios_bodega`, contacto/fundación de `bodegas` existentes, `registros_fuente` | `scrape-ruta-ribera.yml` (viernes 04:27 UTC) |

Vinoselección empareja cada vino con una bodega ya cargada, así que **Ribera debe ejecutarse antes** (por eso va el lunes).

## Requisitos

- Node 24 (`.nvmrc`). Los `.ts` se ejecutan con el *type stripping* nativo de Node, sin build ni `tsx`: solo sintaxis borrable (nada de `enum` ni *parameter properties*) e imports relativos con extensión `.ts`. Lo comprueba `tsc -p scrapers` (incluido en `npm run typecheck`).
- `npm install` en la raíz (usa `cheerio` y `robots-parser`).

## Ejecutar en local

```bash
# Sin tocar la BD: escribe el resultado normalizado en scrapers/out/ (ignorado por git)
node scrapers/cli.ts ribera --dry-run --limit 5

# Vinoselección en dry-run, emparejando con las bodegas de un dry-run completo de Ribera
node scrapers/cli.ts ribera --dry-run --out scrapers/out/ribera.json
node scrapers/cli.ts vinoseleccion --dry-run --limit 10 --bodegas scrapers/out/ribera.json

# Ejecución real (escribe en Supabase con la service role key)
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scrapers/cli.ts ribera
```

Opciones: `--dry-run`, `--limit N` (máximo de fichas), `--out ruta.json` (salida del dry-run), `--bodegas ruta.json` (solo `vinoseleccion` en dry-run: bodegas candidatas desde el JSON de un dry-run de Ribera; sin él, todo va a revisión), `--verbose` (logs de cada petición). También vale `npm run scrape -- ribera --dry-run`.

El modo `--dry-run` **nunca crea el cliente de BD** (no hacen falta las variables). La ejecución real necesita la migración de semillas aplicada (fila en `fuentes` y la D.O. `ribera-del-duero`).

Código de salida: `0` ok · `2` parcial (errores en alguna ficha o volumen anómalo, < 50 % de los registros conocidos) · `1` error (fuente detenida, robots.txt, fallo inesperado) · `64` uso incorrecto.

## Ejecutar en GitHub Actions

Cada fuente tiene su workflow con `schedule` semanal en una franja propia y `workflow_dispatch` (Actions → *Scraper …* → *Run workflow*), con entradas `dry_run` y `limit`. En dry-run el JSON se sube como artefacto de la ejecución (en Vinoselección, sin `--bodegas`, todo sale «a revisión»: sirve para revisar extracción y normalización).

- Secretos del repositorio: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Solo se leen vía `secrets.*` y solo en ejecuciones reales.
- Nunca se ejecutan en pull requests (los secretos no llegan a forks), `permissions: contents: read`, `timeout-minutes: 60` y `concurrency` por fuente.
- `ejecuciones_scraper.run_url` enlaza a la ejecución de Actions.

## Reglas de rastreo (comunes, `lib/http.ts`)

- User-Agent `wine-app-bot/0.1 (+https://github.com/migtoqu/wine-app; contacto: …)` y `Accept-Language: es-ES`.
- `robots.txt` descargado una vez por ejecución y evaluado con `robots-parser` antes de cada URL. Si excluye las URLs de entrada (listado, paginación), la fuente se aborta; si excluye una ficha suelta enlazada desde el listado (p. ej. bajo `/app/` en Vinoselección), esa ficha se omite y se cuenta como «omitida por robots.txt». 4xx = sin restricciones; 5xx = no se rastrea.
- Una conexión por dominio y 3–5 s (con *jitter*) entre peticiones.
- Reintentos (10 s, 30 s, 90 s) solo ante 5xx, timeouts y errores de red. **403/429 detienen la fuente** sin insistir. Redirecciones a otro dominio se rechazan.
- Solo datos factuales: nunca descripciones, notas de cata ni imágenes copiadas (las imágenes solo se enlazan).

## Estructura

```
scrapers/
  cli.ts                 punto de entrada y registro de fuentes
  lib/                   http (UA, robots, reintentos), rate-limit, log, ejecucion (ejecuciones_scraper,
                         dry-run), db (cliente service role), texto/contacto/geo (normalización), json
  fuentes/<fuente>/      parsear.ts (HTML → datos crudos) · normalizar.ts · guardar.ts · index.ts
                         fixtures/ (HTML mínimo, solo la parte factual) · *.test.ts
```

## Ribera del Duero

- Recorre `/bodegas/resultados?termino=&page=0..N` (N del enlace «Última») y cada `/bodegas/<slug>` (~26 + ~312 peticiones, ~25 min).
- `registros_fuente.id_externo` = `nodo:<id de nodo Drupal>` (estable aunque cambie el slug; si falta, `slug:<slug>`). `datos` guarda la ficha cruda (dirección, contacto, coordenadas, **marcas**) y las claves normalizadas `clave_nombre` / `claves_marcas` para emparejar vinos después.
- `bodegas.nombre` es la razón social sin forma societaria (S.L., S.A., S.L.U., Soc. Coop.…) y sin mayúsculas forzadas. El slug es propio y estable: se fija al crear (`nombre` → `nombre-municipio` → `nombre-2`…) y no se regenera.
- Vinculación: registro existente → su bodega; si no, la decisión del admin en la cola de revisión; si no, `EmparejadorBodegas` (vincula, manda a revisión o crea; ver [Consolidación](#consolidación)). Se excluyen las bodegas ya vinculadas a otro registro de Ribera.
- Los campos pasan por `Consolidador` con origen `consejo_regulador`: la web oficial de la bodega y el admin le ganan; una tienda no. `datos.campos` se sigue guardando como auditoría.
- Hechos: nombre, municipio, provincia y D.O. → resumen propio `descripcion` de la bodega (es/en).
- Ribera del Duero se añade como D.O. de la bodega (principal si no tiene otra) solo al vincularla por primera vez: si después el admin se la quita, no se vuelve a poner.
- Si el listado trae menos del 50 % de las bodegas conocidas, la ejecución queda `parcial`.

## Vinoselección

- Recorre la categoría `/vinos/espana/ribera-duero` y `?p=2..N` (solo URLs limpias y `?p=N`, como exige su robots.txt). Para al repetir productos o al pasar el máximo del paginador (por encima de la última página la web devuelve productos repetidos). Unas 30 páginas + unas 350 fichas.
- De la ficha: JSON-LD `Product` (nombre, SKU, precio, disponibilidad, imagen sin `/cache/`), «Características generales» (tipo, variedades, barrica, capacidad), temperatura de servicio y bloque «La bodega». De la tarjeta del listado, el JSON de analítica (`grape_variety_wine`, `vintage_year_wine`, `capacity`, `num_bottles`, `item_brand`…). **Nunca** descripción, notas de cata ni maridaje.
- **Descartes** (`registros_fuente.estado_emparejamiento = 'descartado'`, sin vino): packs y lotes («| 2 botellas», «+ copas», dos añadas en el nombre), colecciones y selecciones mensuales, y productos cuya ficha no es de la D.O. Ribera del Duero. Un mágnum «| Estuche» sin número sí es un vino.
- **Normalización**:
  - Vino: nombre sin añada ni formato («La Capilla Crianza Mágnum 2022» → «La Capilla Crianza»).
  - Tipo: sale de «Tipo de vino». Si no se encuentra, la ficha va a revisión.
  - Crianza: se deduce de las palabras del nombre o del tipo. Si no aparece ninguna, queda null: no se adivina.
  - Añada: año, temperatura «15-16 ºC» → 15/16, meses de barrica solo si es un número único, y grado.
  - Variedades: «Tinta del País 90%, Merlot 10%» se mapea a `variedades_uva` por nombre, sinónimo o un alias de tienda pequeño. Las desconocidas se omiten y se registran en el log.
- **Escritura** (solo si se empareja):
  - `vinos` (bodega, nombre, slug, tipo, crianza, D.O. Ribera, fuente).
  - `anadas` (upsert por vino + año).
  - `anada_variedades`.
  - `imagenes`: solo la URL, tipo `botella`, en la **añada**, con atribución «Vinoselección».
  - `registros_fuente` con `entidad_tipo = 'anada'`. Precio, formato, disponibilidad, SKU y URL se quedan en `datos` hasta la Fase 2 (ofertas).
  - El precio del JSON-LD puede ser el de la variante por defecto (a veces una caja). Por eso `datos.tarjeta` guarda también el precio, el nº de botellas y el precio por botella de la tarjeta.
- **Idempotencia**:
  - `id_externo` es la ruta del producto. Una ficha ya vinculada a una añada, por una ejecución anterior o porque el admin resolvió una revisión, reutiliza esa añada sin volver a emparejar.
  - Los campos de la añada (temperatura, barrica, grado) pasan por `Consolidador` con origen `tienda`. La composición de uvas se sigue comparando con lo escrito la vez anterior (`datos.variedades`); en registros anteriores a ese campo solo se rellena una añada sin uvas.
  - El vino se busca dentro de su bodega con `EmparejadorVinos` (EAN, nombre normalizado); uno muy parecido va a revisión. Si la ficha trae EAN, se guarda en `codigos_ean`.
  - Lo que el admin borra (bodega, vino, añada, imagen) o fusiona no se recrea: ver supresiones.
  - Hechos: tipo, uvas, barrica, grado y temperatura → resumen propio `elaboracion` de la añada (es/en).

## Ruta del Vino Ribera del Duero (`ruta-ribera`)

- **Fuente inactiva** (`fuentes.activa = false`, migración `20261111100000`): su aviso legal exige permiso previo por escrito. Mientras esté inactiva, `ejecutar()` sale con 0 sin llamar al scraper (ni siquiera crea la ejecución); solo `--dry-run` funciona. Activarla es decisión del admin una vez resuelto el permiso.
- **Sin API**: el `robots.txt` de la Ruta prohíbe `/wp-json/` y `/?rest_route=` (la auditoría de SOURCES §6.1 lo daba por permitido), así que se usan solo los sitemaps que anuncia (`product-sitemap.xml`, `directories-sitemap.xml`) y el HTML público: `/producto/<slug>/` (título, precio, URL de reserva en el `form.cart`, categoría en la clase `product_cat-…`) y `/directories/<slug>/` (categoría = icono bajo el título; teléfono, email, web, dirección y «Horario de visitas»). ~430 fichas de directorio (hay que abrirlas para saber si son bodega: unas 80) + ~85 productos: ~515 peticiones, ~40 min.
- **Servicios**: la bodega es el prefijo del nombre del producto («Bodegas Pradorey Visita premium»); gana el prefijo más largo entre los nombres del directorio y del catálogo. Sin prefijo o ambiguo → `revision` (el admin puede asociar una bodega); packs («AA.VV. Top Ribera…», «Ribiértete…») y spa/bienestar sin bodega → `descartado`. Las URLs en inglés (`/en/`) se ignoran. Tipo `visita`/`cata`/`otra` por palabras del nombre; `precio_desde` (0 → null); duración e idiomas solo si la descripción los dice claramente («Duración: 2 horas», «Idiomas: …»); `horario` solo para las categorías de temporada («Noviembre, Mes del Enoturismo», «Vendimia»); sin descripción. Un servicio que deja de aparecer se marca `activo = false`.
- **Fichas**: se emparejan con `EmparejadorBodegas` (dominio web, nombre + municipio). **Nunca crea bodegas**: dudoso → `revision`; sin candidata (restaurantes, hoteles, bodegas fuera de la D.O.) → `descartado` y se reevalúa cada semana. Con origen `guia` (por debajo de la web de la bodega y del Consejo Regulador) aporta teléfono, email, web, dirección, código postal y año de fundación (solo si la prosa dice «fundada en AAAA» una sola vez); hechos `bodega.enoturismo`, `bodega.fundacion_anio` y `bodega.horario_visitas`.
- **Eventos fechados** (`tribe_events`, 679): fuera del MVP. Caducan, se duplican en ES/EN y no son catálogo estable; exigirían agenda y caducidad.
- Cargar **después de Ribera** (lunes) para tener las bodegas. Dry-run: `node scrapers/cli.ts ruta-ribera --dry-run --bodegas scrapers/out/ribera.json`.

## Emparejamiento vino → bodega (`emparejamiento/bodegas.ts`)

Se calcula en TypeScript con el mismo algoritmo de trigramas que `pg_trgm` (`lib/trigram.ts`), así que da lo mismo en dry-run que en una ejecución real y no hace falta una función SQL.

1. Las claves de nombre se normalizan: sin tildes ni mayúsculas, sin forma societaria y sin palabras genéricas (bodega(s), viñedos, vinos, de, la…). Por ejemplo, «BODEGAS Y VIÑEDOS CONDE DE SAN CRISTÓBAL, S.L.» → «conde san cristobal».
2. Señales y puntuación (gana la mejor):

   | Señal | Puntuación |
   | --- | --- |
   | Nombre de bodega de la tienda idéntico a la clave | 1 |
   | Uno contenido en el otro | 0,9 |
   | Si no, similitud por trigramas | trigramas |
   | Nombre del vino igual a una **marca** del Consejo Regulador exclusiva de una bodega | 1 |
   | Nombre del vino que empieza por esa marca | 0,9 + 0,05 × parte del nombre que cubre (gana la más específica) |
   | Ídem con una marca compartida por varias bodegas | 0,8 |
   | Nombre de bodega de la tienda que es una marca exclusiva de la bodega («Bodegas Briego» → marca BRIEGO de Alberto y Benito) | 0,9 |
   | Grupo o propietario de la tienda («Bodeguero», `item_brand`) | 0,8 como mucho: por sí solo nunca basta |

   Se ignoran las marcas genéricas («RIBERA DUERO») y los años dentro de las marcas. La marca registrada en el Consejo Regulador manda aunque la tienda atribuya el vino a otra bodega o filial: por ejemplo, «Emina Pasión» es marca de Bodega Matarromera, y en una ficha la tienda pone «Bodega Lagarde» para un Legaris.

3. Se empareja si la puntuación es **≥ UMBRAL y saca ≥ MARGEN a la segunda bodega**. Si no, **no se crea el vino**: el registro queda `revision` con `confianza` y los 3 mejores candidatos en `datos.emparejamiento`, para la cola del admin.

Valores: **`UMBRAL = 0.85`, `MARGEN = 0.05`**. Se calibraron con un dry-run de toda la categoría (2026-11-07, 355 productos frente a las 302 bodegas de Ribera):

- Todos los emparejados puntúan ≥ 0,90.
- En revisión, la mejor puntuación es 0,8 (solo el grupo), salvo empates reales a 1 entre dos bodegas, como Bardos, que figura como bodega propia y como marca de otra.
- 0,85 queda en ese hueco. Si se baja de 0,8, los vinos con solo la señal de grupo (p. ej. Viña Mayor → Entrecanales Domecq e Hijos) se emparejarían sin otra prueba.

## Consolidación

Núcleo común (`lib/consolidacion/`, `emparejamiento/entidades.ts`, `emparejamiento/vinos.ts`) para que muchas fuentes alimenten el mismo catálogo sin duplicar bodegas ni vinos. Esquema en la migración `20261110090000_consolidacion.sql`.

### Prioridad por campo (`decidir.ts`, `consolidar.ts`)

Cada registro de fuente deja en `valores_fuente` lo que dice de cada campo (con `valor_desde`: desde cuándo lo dice). `Consolidador.consolidar(tipo, id, campos, aporte)` elige el ganador y lo escribe en la columna y en `procedencia_campos` (la ficha lo atribuye: «Fuente: … · actualizado …»).

1. **admin > web oficial de la bodega (`bodega`) > consejo regulador > guía > tienda > otra.** El origen sale de `fuentes.tipo`.
2. A igual prioridad gana el valor más reciente por `valor_desde` (no por la última visita), así dos tiendas que discrepan no se alternan cada semana.
3. Toda edición de un admin desde la app (rol `authenticated`, solo si el valor cambia) deja la procedencia en `admin` mediante un trigger, y ninguna fuente la pisa. Vaciar un campo también cuenta como decisión del admin.
4. Columna con valor sin procedencia que no coincide con ninguna fuente → dato manual → `admin`.
5. Si la fuente ganadora deja de dar el dato y no hay otra, la columna se vacía.

### Emparejamiento

| Bodegas (`EmparejadorBodegas`) | Puntuación |
| --- | --- |
| NIF o registro de embotellador iguales | 1 |
| Dominio web igual y exclusivo (`dominioWeb`; se ignoran redes, constructores de webs y tiendas: `esDominioGenerico`) | 0,97 (0,8 si lo comparten varias bodegas) |
| Clave de nombre exacta: mismo municipio / falta en un lado / otro municipio | 0,97 / 0,9 / 0,5 |
| Clave contenida | 0,92 / 0,8 / 0,4 |
| Trigramas `s` sobre la clave | 0,5 + 0,45·s / 0,9·s / 0,6·s |
| Nombre = marca exclusiva del CR de la candidata | 0,85 |
| En contra: NIF distinto → máx. 0,3; dominios propios distintos → máx. 0,85 | |

≥ **0,90** con margen ≥ **0,05** → vinculada · **0,60–0,90** (o empate) → `revision`, sin crear nada · < 0,60 → bodega nueva.

Vinos dentro de su bodega (`EmparejadorVinos`): EAN de la misma bodega o nombre normalizado igual → mismo vino; trigramas ≥ 0,8 con el mismo tipo y crianza → `revision`; si no, vino nuevo. El emparejamiento vino de tienda → bodega (`emparejamiento/bodegas.ts`) no cambia.

### Supresiones y fusiones

- Borrar como admin una bodega, un vino, una añada, un servicio o una imagen deja una fila en `supresiones` con sus claves, también para los hijos que caen en cascada. Además, marca los registros que apuntaban a ella (`supresion_id`, `descartado`). Los scrapers no la recrean: el emparejador la recibe como candidata «suprimida».
- `admin_fusionar(tipo, origen, destino)` (RPC, `security invoker`) pasa todo al destino y deja una supresión `fusion`, que los emparejadores usan como alias del superviviente.
- Cola de revisión en `/admin/revision`: asociar, crear, descartar o fusionar. La decisión queda en `registros_fuente.decision*` y la aplica el scraper en la siguiente ejecución (`decisionAdmin()`).

### Hechos y resúmenes propios (`hechos.ts`, `resumen.ts`, `plantillas.ts`)

Los textos de la ficha nunca se copian: cada fuente guarda en `registros_fuente.hechos` hechos atómicos (`{ clave, valor, sujeto?, unidad?, fuente, observado_en }`, con vocabulario cerrado en `ClaveHecho`). `Resumidor` consolida los hechos de todos los registros de la entidad (por prioridad de fuente) y genera el texto en es/en con un `GeneradorResumen`. Hoy usa `PlantillasEsEn` (determinista; no puede afirmar nada que no esté en los hechos). El resultado se cachea en `resumenes` por el hash de los hechos más el id del generador: si nada cambia, no se regenera. Un generador con LLM entraría detrás de la misma interfaz. En la ficha, el texto curado por el admin (columna) tiene preferencia sobre el resumen.

### Añadir una fuente nueva

1. Fila en `fuentes` con su `tipo` (decide la prioridad).
2. `parsear.ts` + `normalizar.ts` → campos por entidad + hechos.
3. En `guardar.ts`: `decisionAdmin(registro)` → `EmparejadorBodegas` / `EmparejadorVinos` (con supresiones) → upsert del registro → `Consolidador.consolidar()` → `Resumidor.resumir()`.
