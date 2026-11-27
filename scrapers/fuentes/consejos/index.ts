// Consejos reguladores con directorio de bodegas: una definición por consejo sobre el núcleo común.
import type { Scraper } from "../../lib/ejecucion.ts";
import { consejoAlicante } from "./alicante.ts";
import { consejoBierzo } from "./bierzo.ts";
import { consejoCalatayud } from "./calatayud.ts";
import { consejoCava } from "./cava.ts";
import { consejoCigales } from "./cigales.ts";
import { crearScraperConsejo } from "./comun/ejecutar.ts";
import type { DefinicionConsejo } from "./comun/tipos.ts";
import { consejoEmporda } from "./emporda.ts";
import { consejoJerez } from "./jerez.ts";
import { consejoJumilla } from "./jumilla.ts";
import { consejoLaMancha } from "./la-mancha.ts";
import { consejoPenedes } from "./penedes.ts";
import { consejoPriorat } from "./priorat.ts";
import { consejoRiberaGuadiana } from "./ribera-guadiana.ts";
import { consejoRibeiro } from "./ribeiro.ts";
import { consejoRueda } from "./rueda.ts";
import { consejoSomontano } from "./somontano.ts";
import { consejoToro } from "./toro.ts";

/** Alias de línea de comandos → definición. */
export const CONSEJOS: Record<string, DefinicionConsejo> = {
  "consejo-toro": consejoToro,
  "consejo-cigales": consejoCigales,
  "consejo-bierzo": consejoBierzo,
  "consejo-priorat": consejoPriorat,
  "consejo-rueda": consejoRueda,
  "consejo-penedes": consejoPenedes,
  "consejo-jerez": consejoJerez,
  "consejo-ribeiro": consejoRibeiro,
  "consejo-cava": consejoCava,
  "consejo-la-mancha": consejoLaMancha,
  "consejo-jumilla": consejoJumilla,
  "consejo-somontano": consejoSomontano,
  "consejo-emporda": consejoEmporda,
  "consejo-ribera-guadiana": consejoRiberaGuadiana,
  "consejo-calatayud": consejoCalatayud,
  "consejo-alicante": consejoAlicante,
};

export const SCRAPERS_CONSEJOS: Record<string, { slug: string; scraper: Scraper }> = Object.fromEntries(
  Object.entries(CONSEJOS).map(([alias, def]) => [alias, { slug: def.slug, scraper: crearScraperConsejo(def) }]),
);
