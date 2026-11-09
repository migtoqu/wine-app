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
import { scraperNavarra, SLUG_FUENTE as SLUG_NAVARRA } from "./fuentes/consejos/navarra/index.ts";

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
};

const AYUDA = `Uso: node scrapers/cli.ts <fuente> [opciones]

Fuentes: ${Object.keys(FUENTES).join(", ")}

Opciones:
  --dry-run      no toca la BD; escribe el resultado normalizado en scrapers/out/
  --limit N      procesa como mucho N fichas
  --out RUTA     fichero JSON de salida del dry-run
  --bodegas RUTA (vinoseleccion y ruta-ribera, dry-run) JSON de un dry-run de Ribera con las bodegas para emparejar
  --verbose      muestra también los logs de depuración

Webs de bodegas (webs-bodegas):
  --webs RUTA|URLS     (dry-run) fichero .txt con una URL por línea, JSON de un dry-run de ribera o URLs separadas por comas
  --dominio DOMINIO    solo ese sitio (p. ej. aalto.es)
  --lote I/N           solo los sitios del lote I de N (reparto estable por hash del dominio)
  --presupuesto-min N  no empieza sitios nuevos pasados N minutos (por defecto 45)

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
      urls: { type: "string" },
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
      urls: values.urls,
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
