import { capitalizarSiMayusculas, limpiarEspacios } from "../../../lib/texto.ts";
import { crianzaDe } from "../extraer.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodegas Mazuela (Cenicero, D.O.Ca. Rioja). WordPress con WPBakery: `/vinos/` es una página vacía
 * que redirige por JavaScript a la primera ficha, y la tienda WooCommerce solo tiene un producto
 * «Vino» sin datos. Las fichas `/vinos/<vino>/` tienen el h1 «NUESTROS VINOS» y el nombre solo en el
 * <title>, con el número de orden, la añada y el formato de venta («3.- LIANTE SEMICRIANZA 2023
 * (Caja de 6 Botellas de 0,75 l) - Bodegas Mazuela»): el genérico lo descarta por «caja». Se descubren
 * por el menú. No necesita navegador.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["bodegasmazuela.com"],
  version: 1,
  modo: "completa",
  notas: "2026-11-27. /vinos/ redirige por JS y el nombre solo está en el <title> con «Caja de 6»: 0 vinos con el genérico.",
  rutas: {
    listados: ["/la-bodega/"],
    patronFicha: /^https:\/\/www\.bodegasmazuela\.com\/vinos\/[a-z0-9-]+\/?$/,
    excluir: /\/en\//,
  },
  selectores: { imagen: "img[alt^='Botella']" },
  evidenciasMin: 1,
  extraerVino: (f) => {
    const { nombre, anio } = nombreMazuela(f.$("title").first().text());
    if (!nombre) return null;
    // La Hoya no lleva añada en el título, sino en el texto: «RESERVA 2014 40 MESES EN BARRICA».
    const enTexto = f.texto.match(/\b(?:reserva|crianza|añada|cosecha)\s+((?:19|20)\d\d)\b/i);
    return {
      nombre,
      anio: anio ?? (enTexto ? Number(enTexto[1]) : f.vino.anio),
      crianza: crianzaDe(nombre, f.texto) ?? f.vino.crianza,
    };
  },
  minimoVinos: 4,
};
export default adaptador;

/**
 * «3.- LIANTE SEMICRIANZA 2023 (Caja de 6 Botellas de 0,75 l) - Bodegas Mazuela» → nombre «Liante
 * Semicrianza» y añada 2023. Sin el número de orden, el formato de venta ni la bodega; la añada
 * final puede venir en dos cifras («ROSADO ESPECIAL 24»).
 */
export function nombreMazuela(titulo: string): { nombre: string; anio: number | null } {
  let n = limpiarEspacios(titulo
    .replace(/\s+[-–|]\s+Bodegas Mazuela\s*$/i, "")
    .replace(/^\s*\d+\s*\.?-?\s*/, "")
    .replace(/\(\s*caja[^)]*\)?/gi, " "));
  let anio: number | null = null;
  const m = n.match(/\s((?:19|20)\d\d|[0-4]\d)$/);
  if (m) {
    anio = m[1]!.length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
    n = n.slice(0, m.index).trim();
  }
  return { nombre: capitalizarSiMayusculas(n), anio };
}
