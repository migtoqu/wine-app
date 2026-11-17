// Registro explícito de adaptadores por sitio (sin autodescubrimiento de ficheros). Uno por dominio.
// Ola D (2026-11-12): webs que pasan la puerta legal y de las que el genérico no saca vinos.
import { dominioBase } from "../dominio.ts";
import ajv from "./ajv.wine.ts";
import alegrevalganon from "./alegrevalganon.com.ts";
import arrocal from "./arrocal.com.ts";
import bodegamartinezyebra from "./bodegamartinezyebra.es.ts";
import bodegasLozano from "./bodegas-lozano.com.ts";
import bodegasanmiguelsc from "./bodegasanmiguelsc.es.ts";
import bodegascampillo from "./bodegascampillo.com.ts";
import bodegasdiezgomez from "./bodegasdiezgomez.com.ts";
import bodegasfaustino from "./bodegasfaustino.com.ts";
import bodegasgarciadeolano from "./bodegasgarciadeolano.com.ts";
import dominiodecair from "./dominiodecair.com.ts";
import luiscanas from "./luiscanas.com.ts";
import milenico from "./milenico.com.ts";
import obac from "./obac.es.ts";
import pagodecirsus from "./pagodecirsus.com.ts";
import ribasdelcua from "./ribasdelcua.com.ts";
import senoriodelibano from "./senoriodelibano.com.ts";
import sierracantabria from "./sierracantabria.com.ts";
import sinforianobodegas from "./sinforianobodegas.com.ts";
import tomaspostigo from "./tomaspostigo.es.ts";
import vinazorzalwines from "./vinazorzalwines.com.ts";
import type { AdaptadorSitio } from "./tipos.ts";

export const ADAPTADORES: AdaptadorSitio[] = [
  ajv, alegrevalganon, arrocal, bodegamartinezyebra, bodegasLozano, bodegasanmiguelsc, bodegascampillo, bodegasdiezgomez, bodegasfaustino, bodegasgarciadeolano, dominiodecair, luiscanas, milenico, obac, pagodecirsus, ribasdelcua, senoriodelibano, sierracantabria, sinforianobodegas, tomaspostigo, vinazorzalwines,
];

const porDominio = new Map(ADAPTADORES.flatMap((a) => a.dominios.map((d) => [d, a] as const)));

/** Adaptador del dominio (o de su dominio registrable: «tienda.x.es» → «x.es»). */
export function adaptadorPara(dominio: string): AdaptadorSitio | null {
  const d = dominio.toLowerCase().replace(/^www\d*\./, "");
  return porDominio.get(d) ?? porDominio.get(dominioBase(d)) ?? null;
}
