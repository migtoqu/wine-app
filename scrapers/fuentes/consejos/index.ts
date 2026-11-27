// Consejos reguladores con directorio de bodegas: una definición por consejo sobre el núcleo común.
import type { Scraper } from "../../lib/ejecucion.ts";
import { consejoBierzo } from "./bierzo.ts";
import { consejoCigales } from "./cigales.ts";
import { crearScraperConsejo } from "./comun/ejecutar.ts";
import type { DefinicionConsejo } from "./comun/tipos.ts";
import { consejoJerez } from "./jerez.ts";
import { consejoPenedes } from "./penedes.ts";
import { consejoPriorat } from "./priorat.ts";
import { consejoRibeiro } from "./ribeiro.ts";
import { consejoRueda } from "./rueda.ts";
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
};

export const SCRAPERS_CONSEJOS: Record<string, { slug: string; scraper: Scraper }> = Object.fromEntries(
  Object.entries(CONSEJOS).map(([alias, def]) => [alias, { slug: def.slug, scraper: crearScraperConsejo(def) }]),
);
