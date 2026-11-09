// Vinos de consejos reguladores: tipo, crianza y añada a partir de los textos de la ficha.
// Extraído de fuentes/rioja/normalizar.ts (mismo comportamiento); lo comparten Rioja y Navarra.
import { claveTexto, limpiarEspacios } from "../../../lib/texto.ts";

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

/** Quita una añada final del nombre («Irujo Crianza 2018» → «Irujo Crianza», 2018). */
export function separarAnada(nombre: string, anadaTexto: string | null): { nombre: string; anio: number | null } {
  const limpio = limpiarEspacios(nombre);
  const m = /^(.*\S)\s+((?:19|20)\d\d)$/.exec(limpio);
  const delCampo = /^(?:19|20)\d\d$/.test((anadaTexto ?? "").trim()) ? Number(anadaTexto!.trim()) : null;
  if (m) return { nombre: m[1]!, anio: delCampo ?? Number(m[2]) };
  return { nombre: limpio, anio: delCampo };
}
