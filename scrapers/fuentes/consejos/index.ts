// Consejos reguladores con directorio de bodegas: una definición por consejo sobre el núcleo común.
import type { Scraper } from "../../lib/ejecucion.ts";
import { consejoAlicante } from "./alicante.ts";
import { consejoArlanza } from "./arlanza.ts";
import { consejoBierzo } from "./bierzo.ts";
import { consejoBinissalem } from "./binissalem.ts";
import { consejoBullas } from "./bullas.ts";
import { consejoCalatayud } from "./calatayud.ts";
import { consejoCarinena } from "./carinena.ts";
import { consejoCava } from "./cava.ts";
import { consejoCigales } from "./cigales.ts";
import { crearScraperConsejo } from "./comun/ejecutar.ts";
import type { DefinicionConsejo } from "./comun/tipos.ts";
import { consejoCostersSegre } from "./costers-segre.ts";
import { consejoEmporda } from "./emporda.ts";
import { consejoJerez } from "./jerez.ts";
import { consejoJumilla } from "./jumilla.ts";
import { consejoLaMancha } from "./la-mancha.ts";
import { consejoLeon } from "./leon.ts";
import { consejoMonterrei } from "./monterrei.ts";
import { consejoPenedes } from "./penedes.ts";
import { consejoPriorat } from "./priorat.ts";
import { consejoRibeiro } from "./ribeiro.ts";
import { consejoRiberaGuadiana } from "./ribera-guadiana.ts";
import { consejoRueda } from "./rueda.ts";
import { consejoSomontano } from "./somontano.ts";
import { consejoToro } from "./toro.ts";
import { consejoYecla } from "./yecla.ts";

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
  "consejo-costers-segre": consejoCostersSegre,
  "consejo-monterrei": consejoMonterrei,
  "consejo-bullas": consejoBullas,
  "consejo-arlanza": consejoArlanza,
  "consejo-leon": consejoLeon,
  "consejo-yecla": consejoYecla,
  "consejo-binissalem": consejoBinissalem,
  "consejo-carinena": consejoCarinena,
};

export const SCRAPERS_CONSEJOS: Record<string, { slug: string; scraper: Scraper }> = Object.fromEntries(
  Object.entries(CONSEJOS).map(([alias, def]) => [alias, { slug: def.slug, scraper: crearScraperConsejo(def) }]),
);
