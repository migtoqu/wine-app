// Punto de entrada: node scrapers/cli.ts <fuente> [--dry-run] [--limit N] [--out ruta] [--verbose]
import { parseArgs } from "node:util";
import { ejecutar, type Scraper } from "./lib/ejecucion.ts";
import { scraperRibera, SLUG_FUENTE as SLUG_RIBERA } from "./fuentes/ribera/index.ts";
import { scraperRutaRibera, SLUG_FUENTE as SLUG_RUTA_RIBERA } from "./fuentes/ruta-ribera/index.ts";
import { scraperRioja, SLUG_FUENTE as SLUG_RIOJA } from "./fuentes/rioja/index.ts";
import { scraperVinoseleccion, SLUG_FUENTE as SLUG_VINOSELECCION } from "./fuentes/vinoseleccion/index.ts";
import { scraperVinopremier, SLUG_FUENTE as SLUG_VINOPREMIER } from "./fuentes/vinopremier/index.ts";
import { scraperWebsBodegas, SLUG_FUENTE as SLUG_WEBS_BODEGAS } from "./fuentes/webs-bodegas/index.ts";
import { scraperComprobadorEnlaces, SLUG_FUENTE as SLUG_ENLACES } from "./comprobador-enlaces/index.ts";
import { SCRAPERS_CONSEJOS } from "./fuentes/consejos/index.ts";
import { SCRAPERS_TIENDAS } from "./fuentes/tiendas/index.ts";
import { scraperOsm, SLUG_FUENTE as SLUG_OSM } from "./fuentes/osm/index.ts";
import { scraperGooglePlaces, SLUG_FUENTE as SLUG_GOOGLE_PLACES } from "./fuentes/google-places/index.ts";
import { scraperNavarra, SLUG_FUENTE as SLUG_NAVARRA } from "./fuentes/consejos/navarra/index.ts";
import { scraperWikimedia, SLUG_FUENTE as SLUG_WIKIMEDIA } from "./fuentes/wikimedia/index.ts";
import { scraperConcoursMondial, SLUG_FUENTE as SLUG_CONCOURS_MONDIAL } from "./fuentes/concours-mondial/index.ts";

// Alias de línea de comandos → slug de `fuentes` + scraper.
const FUENTES: Record<string, { slug: string; scraper: Scraper }> = {
  ribera: { slug: SLUG_RIBERA, scraper: scraperRibera },
  vinoseleccion: { slug: SLUG_VINOSELECCION, scraper: scraperVinoseleccion },
  vinopremier: { slug: SLUG_VINOPREMIER, scraper: scraperVinopremier },
  "ruta-ribera": { slug: SLUG_RUTA_RIBERA, scraper: scraperRutaRibera },
  rioja: { slug: SLUG_RIOJA, scraper: scraperRioja },
  "webs-bodegas": { slug: SLUG_WEBS_BODEGAS, scraper: scraperWebsBodegas },
  // No es una fuente: comprueba los enlaces del catálogo (se registra igual en ejecuciones_scraper).
  enlaces: { slug: SLUG_ENLACES, scraper: scraperComprobadorEnlaces },
  // Consejos con directorio de bodegas (núcleo común en fuentes/consejos/).
  ...SCRAPERS_CONSEJOS,
  // Navarra: bodegas, vinos y experiencias (guardado compartido con Rioja).
  "consejo-navarra": { slug: SLUG_NAVARRA, scraper: scraperNavarra },
  // Fotos de bodega con licencia libre (Wikimedia Commons), enlazadas con atribución.
  wikimedia: { slug: SLUG_WIKIMEDIA, scraper: scraperWikimedia },
  // Tiendas con precio, scraper parametrizado por plataforma (fuentes/tiendas/).
  ...SCRAPERS_TIENDAS,
  // Geocodificación y POI de OpenStreetMap (Nominatim + Overpass).
  osm: { slug: SLUG_OSM, scraper: scraperOsm },
  // Google Places API (New): desactivado si falta GOOGLE_PLACES_API_KEY.
  "google-places": { slug: SLUG_GOOGLE_PLACES, scraper: scraperGooglePlaces },
  // Premios: medallas de vinos españoles en el Concours Mondial de Bruxelles.
  "concours-mondial": { slug: SLUG_CONCOURS_MONDIAL, scraper: scraperConcoursMondial },
};

const AYUDA = `Uso: node scrapers/cli.ts <fuente> [opciones]

Fuentes: ${Object.keys(FUENTES).join(", ")}

Opciones:
  --dry-run      no toca la BD; escribe el resultado normalizado en scrapers/out/
  --limit N      procesa como mucho N fichas
  --out RUTA     fichero JSON de salida del dry-run
  --bodegas RUTA (vinoseleccion, ruta-ribera, vinopremier, tienda-* y wikimedia, dry-run) JSON de un dry-run de Ribera con las bodegas para emparejar
  --verbose      muestra también los logs de depuración

Webs de bodegas (webs-bodegas):
  --webs RUTA|URLS     (dry-run) fichero .txt con una URL por línea, JSON de un dry-run de ribera o URLs separadas por comas
  --dominio DOMINIO    solo ese sitio (p. ej. aalto.es)
  --lote I/N           solo los sitios del lote I de N (reparto estable por hash del dominio)
  --presupuesto-min N  no empieza sitios nuevos pasados N minutos (por defecto 45)
  --descubrir-webs     prueba también la web del dominio del email de las bodegas sin web
  --sin-adaptadores    solo el extractor genérico (para comparar con los adaptadores por sitio)

OpenStreetMap (osm):
  --bodegas RUTA       (dry-run) JSON con las bodegas (consulta de exportación en docs/SOURCES.md)
  --cache RUTA|no      caché de Nominatim (por defecto scrapers/.cache/osm/nominatim.json)
  --presupuesto-min N  no geocodifica bodegas nuevas pasados N minutos (por defecto 50)

Google Places (google-places), solo con GOOGLE_PLACES_API_KEY:
  --presupuesto N      máximo de peticiones a la API por ejecución (por defecto 100)

Concours Mondial de Bruxelles (concours-mondial):
  --ediciones A[-B],…  ediciones a leer (2019-2026, 2025,2026 o «todas»); por defecto, la del año y la anterior
  --bodegas RUTA       (dry-run) instantánea del catálogo {bodegas, vinos} para emparejar

Comprobador de enlaces (enlaces):
  --urls RUTA|URLS     (dry-run) fichero con una URL por línea o URLs separadas por comas
  --presupuesto-min N  no comprueba enlaces nuevos pasados N minutos (por defecto 150)
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      limit: { type: "string" },
      out: { type: "string" },
      bodegas: { type: "string" },
      verbose: { type: "boolean", default: false },
      webs: { type: "string" },
      dominio: { type: "string" },
      lote: { type: "string" },
      "presupuesto-min": { type: "string" },
      "descubrir-webs": { type: "boolean", default: false },
      "sin-adaptadores": { type: "boolean", default: false },
      urls: { type: "string" },
      cache: { type: "string" },
      presupuesto: { type: "string" },
      ediciones: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const nombre = positionals[0];
  if (values.help || !nombre || positionals.length > 1 || !FUENTES[nombre]) {
    console.error(AYUDA);
    return values.help ? 0 : 64;
  }

  let limite: number | null = null;
  if (values.limit !== undefined && values.limit !== "") {
    if (!/^\d+$/.test(values.limit) || Number(values.limit) < 1) {
      console.error("--limit debe ser un entero positivo");
      return 64;
    }
    limite = Number(values.limit);
  }

  const { slug, scraper } = FUENTES[nombre]!;
  return ejecutar(slug, scraper, {
    dryRun: values["dry-run"],
    limite,
    rutaSalida: values.out,
    rutaBodegas: values.bodegas,
    verbose: values.verbose,
    opciones: {
      webs: values.webs,
      dominio: values.dominio,
      lote: values.lote,
      presupuestoMin: values["presupuesto-min"],
      descubrirWebs: values["descubrir-webs"] ? "1" : undefined,
      sinAdaptadores: values["sin-adaptadores"] ? "1" : undefined,
      urls: values.urls,
      cache: values.cache,
      presupuesto: values.presupuesto,
      ediciones: values.ediciones,
    },
  });
}

main().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  },
);
