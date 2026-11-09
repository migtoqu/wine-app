// Experiencias de enoturismo de consejos reguladores: tipo, precio, duración e idiomas.
// Extraído de fuentes/rioja (mismo comportamiento); lo comparten Rioja y Navarra.
import { claveTexto } from "../../../lib/texto.ts";

/** «€60,00» / «1.200,50 €» → número. */
export function parsearPrecio(s: string | null | undefined): number | null {
  const m = /\d[\d.,]*/.exec(s ?? "");
  if (!m) return null;
  // «1.200,50» (es) → 1200.5; «60,00» → 60; «25.5» → 25.5.
  const n = Number(m[0].includes(",") ? m[0].replace(/\./g, "").replace(",", ".") : m[0].replace(/[.,]$/, ""));
  return Number.isFinite(n) ? n : null;
}

export type TipoServicio = "cata" | "visita" | "restaurante" | "alojamiento" | "evento" | "otra" | "actividad";

const reglas: [TipoServicio, RegExp][] = [
  ["alojamiento", /alojamiento|hotel|duerm|pernoct|noche en/],
  ["visita", /\bvisita/],
  ["cata", /\b(cata|catas|degustaci|maridaje)/],
  ["restaurante", /comida|restaurante|gastronom|almuerzo|men[uú]|cena|brunch|desayuno/],
  ["evento", /evento|mice|empresa|boda|celebraci|team|incentivo|profesional/],
];

/** Tipo a partir del título (manda) y de lo que incluye; sin pistas, «actividad». */
export function tipoServicio(titulo: string, incluye: string[]): TipoServicio {
  for (const texto of [claveTexto(titulo), claveTexto(incluye.join(" "))]) {
    for (const [tipo, re] of reglas) if (re.test(texto)) return tipo;
  }
  return "actividad";
}

/** Precio más bajo de una fila PVP («Desde 25€», «Niños: 8€», «Adultos: 26€»). Gratuito = 0. */
export function precioDesde(filas: string[] | undefined): number | null {
  if (!filas || filas.length === 0) return null;
  if (filas.every((f) => /gratuit|gratis/i.test(f))) return 0;
  const precios = filas.map((f) => parsearPrecio(f.replace(/^[^:]*:/, ""))).filter((n): n is number => n != null && n >= 0);
  return precios.length ? Math.min(...precios) : null;
}

/** «2h», «1h 30min», «90 min», «2 horas» → minutos. */
export function duracionMinutos(filas: string[] | undefined): number | null {
  const texto = (filas ?? []).join(" ").toLowerCase();
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h\b|hs?\b|horas?)/.exec(texto);
  const m = /(\d+)\s*(?:min|m\b|minutos?)/.exec(texto);
  let min = 0;
  if (h) min += Math.round(Number(h[1]!.replace(",", ".")) * 60);
  if (m) min += Number(m[1]);
  if (!h && !m) return null;
  return min > 0 && min <= 24 * 60 ? min : null;
}

const IDIOMAS: Record<string, string> = {
  castellano: "es", espanol: "es", spanish: "es", ingles: "en", english: "en", frances: "fr", aleman: "de",
  italiano: "it", portugues: "pt", euskera: "eu", vasco: "eu", catalan: "ca", chino: "zh", japones: "ja",
  ruso: "ru", holandes: "nl", neerlandes: "nl",
};

export function idiomasDe(filas: string[] | undefined): string[] {
  const out: string[] = [];
  for (const parte of (filas ?? []).join(",").split(/[,/;]|\s+y\s+/)) {
    const codigo = IDIOMAS[claveTexto(parte)];
    if (codigo && !out.includes(codigo)) out.push(codigo);
  }
  return out;
}
