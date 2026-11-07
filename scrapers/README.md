# Scrapers

Llenan el catálogo con datos factuales de las fuentes del MVP (ver [`docs/SOURCES.md`](../docs/SOURCES.md) y SCOPE §7). Cada fuente sigue el mismo flujo: **extraer → normalizar → emparejar → guardar**, con upsert idempotente y un registro por ejecución en `ejecuciones_scraper`.

| Alias | Fuente (`fuentes.slug`) | Qué escribe | Workflow |
| --- | --- | --- | --- |
| `ribera` | `cr-ribera-del-duero` | `bodegas`, `bodega_denominaciones`, `registros_fuente` | `scrape-ribera.yml` (lunes 03:17 UTC) |
| `vinoseleccion` | `vinoseleccion` | `vinos`, `anadas`, `anada_variedades`, `imagenes`, `registros_fuente` | `scrape-vinoseleccion.yml` (miércoles 03:47 UTC) |

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
- Vinculación: registro existente → su bodega; si no, bodega con la misma clave de nombre (p. ej. creada a mano; solo se rellenan sus huecos); si no, bodega nueva.
- En ejecuciones posteriores solo se reescriben los campos cuyo valor normalizado cambió respecto a lo que esta fuente escribió la vez anterior (`datos.campos`). Así no se pisan correcciones del admin, y sí llegan los cambios de la fuente y las mejoras de normalización. Los registros de la primera carga no tienen `campos` y se reescriben enteros una vez.
- Ribera del Duero se añade como D.O. de la bodega (principal si no tiene otra).
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
  - Al volver a ejecutar, solo se reescriben los campos de la añada que cambiaron en la fuente.

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
