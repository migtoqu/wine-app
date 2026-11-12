// Piezas compartidas por varios adaptadores.
import { limpiarEspacios } from "../../../lib/texto.ts";
import { VARIEDADES } from "../diccionarios.ts";
import type { TipoVino, VariedadWeb } from "../extraer.ts";
import type { FichaAdaptador } from "./tipos.ts";

/**
 * Grado de un texto: «14º», «13,5 % vol», «Vol. 15%», «Alcohol: 14.5%»; null si no es plausible
 * (5–22 %). Un «%» suelto solo cuenta tras «alcohol», «grado» o «vol» (en «95% Tempranillo» no).
 */
export function grado(texto: string | null | undefined): number | null {
  const t = texto ?? "";
  const num = (x: string) => Number(x.replace(",", "."));
  const pasadas = [
    /(?<![\d.,])(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:º|°|grados|% ?vol)/gi,
    /(?:alcoh[oó]l\w*|grado\w*|vol\.?)\s*:?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%?/gi,
  ];
  for (const re of pasadas) {
    for (const m of t.matchAll(re)) {
      const n = num(m[1]!);
      if (n >= 5 && n <= 22) return n;
    }
  }
  return null;
}

/** Tipo por la uva principal (la primera citada) cuando la ficha no lo dice: tinta → tinto, blanca → blanco. */
export function tipoPorUvaPrincipal(variedades: VariedadWeb[]): TipoVino | null {
  const color = VARIEDADES.find((v) => v.nombre === variedades[0]?.nombre)?.color;
  return color === "tinta" ? "tinto" : color === "blanca" ? "blanco" : null;
}

/** Texto de un selector dentro de la ficha (vacío si no está). */
export function texto(f: FichaAdaptador, sel: string): string {
  return limpiarEspacios(f.$(sel).first().text());
}

/** Valor de una ficha técnica «Etiqueta: valor» o «Etiqueta ⏎ valor» en el texto de la ficha. */
export function campo(textoFicha: string, etiqueta: RegExp): string | null {
  const lineas = textoFicha.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]!;
    const m = l.match(new RegExp(`^(?:${etiqueta.source})\\s*:?\\s*(.*)$`, "i"));
    if (!m) continue;
    const resto = m[1]!.trim();
    if (resto) return resto;
    if (lineas[i + 1]) return lineas[i + 1]!;
  }
  return null;
}
