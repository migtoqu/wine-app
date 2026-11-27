import type { Medalla, Premio } from "./types";

// Orden y selección de premios para las fichas. Módulo puro (lo prueba awards.test.ts).

const RANGO: Record<Medalla, number> = { gran_oro: 0, oro: 1, plata: 2, bronce: 3 };

/** Puntuación normalizada a 100 (null si el premio no puntúa). */
function sobre100(p: Premio): number | null {
  if (p.puntos === null) return null;
  const max = p.certamen.escala_max ?? 100;
  return (p.puntos / max) * 100;
}

/** Más recientes primero; en la misma edición, la mejor distinción. */
export function sortPremios(premios: Premio[]): Premio[] {
  return [...premios].sort(
    (a, b) =>
      b.edicion - a.edicion ||
      (a.medalla ? RANGO[a.medalla] : 9) - (b.medalla ? RANGO[b.medalla] : 9) ||
      (sobre100(b) ?? 0) - (sobre100(a) ?? 0) ||
      a.certamen.orden - b.certamen.orden ||
      (b.anio ?? 0) - (a.anio ?? 0),
  );
}

/** Los mejores primero (para destacar en la ficha de bodega): distinción, puntos y edición. */
export function destacarPremios(premios: Premio[], n: number): Premio[] {
  return [...premios]
    .sort(
      (a, b) =>
        (a.medalla ? RANGO[a.medalla] : 9) - (b.medalla ? RANGO[b.medalla] : 9) ||
        (sobre100(b) ?? 0) - (sobre100(a) ?? 0) ||
        Number(Boolean(b.mencion)) - Number(Boolean(a.mencion)) ||
        b.edicion - a.edicion,
    )
    .slice(0, n);
}

/** Premios de una añada concreta (null = el vino sin añada). */
export function premiosDeAnada(premios: Premio[], anio: number | null): Premio[] {
  return premios.filter((p) => p.anio === anio);
}
