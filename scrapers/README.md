# Scrapers

Llenan el catálogo con datos factuales de las fuentes del MVP (ver [`docs/SOURCES.md`](../docs/SOURCES.md) y SCOPE §7). Cada fuente sigue el mismo flujo: **extraer → normalizar → emparejar → guardar**, con upsert idempotente y un registro por ejecución en `ejecuciones_scraper`.

| Alias | Fuente (`fuentes.slug`) | Qué escribe | Workflow |
| --- | --- | --- | --- |
| `ribera` | `cr-ribera-del-duero` | `bodegas`, `bodega_denominaciones`, `registros_fuente` | `scrape-ribera.yml` (lunes 03:17 UTC) |

## Requisitos

- Node 24 (`.nvmrc`). Los `.ts` se ejecutan con el *type stripping* nativo de Node, sin build ni `tsx`: solo sintaxis borrable (nada de `enum` ni *parameter properties*) e imports relativos con extensión `.ts`. Lo comprueba `tsc -p scrapers` (incluido en `npm run typecheck`).
- `npm install` en la raíz (usa `cheerio` y `robots-parser`).

## Ejecutar en local

```bash
# Sin tocar la BD: escribe el resultado normalizado en scrapers/out/ (ignorado por git)
node scrapers/cli.ts ribera --dry-run --limit 5

# Ejecución real (escribe en Supabase con la service role key)
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scrapers/cli.ts ribera
```

Opciones: `--dry-run`, `--limit N` (máximo de fichas), `--out ruta.json` (salida del dry-run), `--verbose` (logs de cada petición). También vale `npm run scrape -- ribera --dry-run`.

El modo `--dry-run` **nunca crea el cliente de BD** (no hacen falta las variables). La ejecución real necesita la migración de semillas aplicada (fila en `fuentes` y la D.O. `ribera-del-duero`).

Código de salida: `0` ok · `2` parcial (errores en alguna ficha o volumen anómalo) · `1` error (fuente detenida, robots.txt, fallo inesperado) · `64` uso incorrecto.

## Ejecutar en GitHub Actions

Cada fuente tiene su workflow con `schedule` semanal en una franja propia y `workflow_dispatch` (Actions → *Scraper …* → *Run workflow*), con entradas `dry_run` y `limit`. En dry-run el JSON se sube como artefacto de la ejecución.

- Secretos del repositorio: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Solo se leen vía `secrets.*` y solo en ejecuciones reales.
- Nunca se ejecutan en pull requests (los secretos no llegan a forks), `permissions: contents: read`, `timeout-minutes: 60` y `concurrency` por fuente.
- `ejecuciones_scraper.run_url` enlaza a la ejecución de Actions.

## Reglas de rastreo (comunes, `lib/http.ts`)

- User-Agent `wine-app-bot/0.1 (+https://github.com/migtoqu/wine-app; contacto: …)` y `Accept-Language: es-ES`.
- `robots.txt` descargado una vez por ejecución y evaluado con `robots-parser` antes de cada URL; si excluye una URL necesaria, la fuente se aborta. 4xx = sin restricciones; 5xx = no se rastrea.
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
- En ejecuciones posteriores solo se reescriben los campos cuyo valor **en la fuente** cambió desde la anterior, para no pisar correcciones del admin.
- Ribera del Duero se añade como D.O. de la bodega (principal si no tiene otra).
- Si el listado trae menos del 50 % de las bodegas conocidas, la ejecución queda `parcial`.
