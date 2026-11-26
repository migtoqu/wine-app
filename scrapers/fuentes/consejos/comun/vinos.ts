// Vinos de consejos reguladores: tipo, crianza y añada a partir de los textos de la ficha.
// Extraído de fuentes/rioja/normalizar.ts (mismo comportamiento); lo comparten Rioja y Navarra.
import { capitalizarSiMayusculas, claveTexto, limpiarEspacios } from "../../../lib/texto.ts";

export type TipoVino = "tinto" | "blanco" | "rosado" | "espumoso" | "generoso" | "dulce" | "naranja";
export type Crianza = "joven" | "roble" | "crianza" | "reserva" | "gran_reserva" | "otra";

const TIPOS: Record<string, TipoVino> = {
  tinto: "tinto", blanco: "blanco", rosado: "rosado", espumoso: "espumoso", generoso: "generoso",
  dulce: "dulce", naranja: "naranja", clarete: "rosado",
};

export function tipoVino(texto: string | null): TipoVino | null {
  const c = claveTexto(texto ?? "");
  return TIPOS[c] ?? Object.entries(TIPOS).find(([k]) => c.split(" ").includes(k))?.[1] ?? null;
}

/** Crianza por palabras («Gran Reserva», «Crianza», «Roble», «Joven»); «Genérico» no dice nada. */
export function crianzaDe(...textos: (string | null)[]): Crianza | null {
  for (const texto of textos) {
    const c = ` ${claveTexto(texto ?? "")} `;
    if (/ gran reserva /.test(c)) return "gran_reserva";
    if (/ reserva /.test(c)) return "reserva";
    if (/ crianza /.test(c)) return "crianza";
    if (/ (roble|semicrianza|semi crianza|barrica) /.test(c)) return "roble";
    if (/ (joven|sin crianza|cosecha) /.test(c)) return "joven";
  }
  return null;
}

/** Partículas que los consejos ponen en mayúscula en mitad del nombre («Alma Bohemia De Altanza»). */
const PARTICULA_MAYUSCULA = /(?<=\S\s)(De|Del|Y|E|En|Con)(?=\s)/g;

/**
 * Nombre de un vino tal como lo publican los consejos, sin sus restos de formato: la D.O. al
 * final («Homenaje Blanco D.O Navarra»), porcentajes de uva («BERAMENDI ROBLE – 100% MERLOT»,
 * «(80% TEMPRANILLO- 20% GRACIANO)», «Pagos de Obanos 100% Merlot Roble»), comillas y «!»,
 * todo en mayúsculas («PALACIO DE SADA GARNACHA» → «Palacio de Sada Garnacha») y partículas en
 * mayúscula en mitad del nombre («Barranco Del Prado» → «Barranco del Prado»).
 */
export function limpiarNombreVinoConsejo(nombre: string): string {
  let s = limpiarEspacios(nombre)
    .replace(/\s*[-–]?\s*\bD\.?\s?O\.?\s?(?:Ca\.?)?\s+(?:Navarra|Rioja|Calificada\s+Rioja)\s*$/i, "")
    .replace(/\s*\(\s*\d{1,3}\s?%[^)]*\)\s*$/, "")
    .replace(/\s+[-–]\s+\d{1,3}\s?%\s+[\p{L} ]+$/u, "")
    .replace(/\b100\s?%\s+/g, "")
    // Comillas fuera; la palabra que abrían, con mayúscula: «El Regalo "viñedo Singular"».
    .replace(/["“”«»]\s*(\p{Ll})/gu, (_m, c: string) => c.toLocaleUpperCase("es"))
    .replace(/["“”«»]/g, "")
    .replace(/(\d)!/g, "$1");
  // Siglas sueltas («XR», «CVNE») se quedan en mayúsculas: solo se capitaliza si hay palabras largas.
  s = limpiarEspacios(s);
  if (/\p{L}{4}/u.test(s) && !/\p{Ll}/u.test(s)) {
    // Mayúscula tras una cifra solo en nombres que venían en mayúsculas: «3FLORES» → «3Flores» (no «Tarón 4m»).
    s = capitalizarSiMayusculas(s).replace(/(\d)(\p{Ll})/gu, (_m, d: string, c: string) => d + c.toLocaleUpperCase("es"));
  }
  s = s.replace(PARTICULA_MAYUSCULA, (p) => p.toLocaleLowerCase("es"))
    // Artículo tras «de/del»: «Señorío de la Estrella», «Finca de los Arandinos».
    .replace(/(?<=\b(?:de|del)\s)(La|Las|Los|El)(?=\s)/g, (p) => p.toLocaleLowerCase("es"))
    // Artículo que empieza un nombre propio: «Garnacha La Cantera» (no «Garnacha la Cantera»).
    .replace(/(?<=\S\s)(la|las|los|el)(?=\s)/g, (p, _a, i: number, todo: string) =>
      /\b(?:de|del|a|al|en|y|e|con|por|para)\s$/i.test(todo.slice(0, i)) ? p : p[0]!.toLocaleUpperCase("es") + p.slice(1));
  return limpiarEspacios(s);
}

/** Quita una añada final del nombre («Irujo Crianza 2018» → «Irujo Crianza», 2018) y lo limpia. */
export function separarAnada(nombre: string, anadaTexto: string | null): { nombre: string; anio: number | null } {
  let limpio = limpiarNombreVinoConsejo(nombre);
  const delCampo = /^(?:19|20)\d\d$/.test((anadaTexto ?? "").trim()) ? Number(anadaTexto!.trim()) : null;
  // Añada dentro del nombre tras «Añada/Cosecha/Vendimia» («… Gran Añada 2020 Rosé»). Un año suelto
  // en mitad del nombre es marca («F. Olimpia 1917 Reserva», «1925 Laderas de San Quilez»).
  const dentro = /\b(?:añada|cosecha|vendimia)\s+((?:19|20)\d\d)\b/i.exec(limpio);
  if (dentro) {
    limpio = limpiarEspacios(limpio.replace(` ${dentro[1]}`, ""));
    return { nombre: limpio, anio: delCampo ?? Number(dentro[1]) };
  }
  const m = /^(.*\S)\s+((?:19|20)\d\d)$/.exec(limpio);
  if (m) return { nombre: m[1]!, anio: delCampo ?? Number(m[2]) };
  return { nombre: limpio, anio: delCampo };
}
