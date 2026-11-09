// Comparador de precios de la ficha de vino: elegir formato, ordenar ofertas, mínimos y serie
// del historial para la gráfica. Funciones puras (sin Supabase) para poder probarlas.
import type { Oferta, PuntoPrecio } from "./types";

export const FORMATO_POR_DEFECTO = 750;

/** Formatos con ofertas, con 75 cl primero y el resto de menor a mayor. */
export function formatosDisponibles(ofertas: Pick<Oferta, "formato_ml">[]): number[] {
  const set = [...new Set(ofertas.map((o) => o.formato_ml))];
  return set.sort((a, b) =>
    a === FORMATO_POR_DEFECTO ? -1 : b === FORMATO_POR_DEFECTO ? 1 : a - b,
  );
}

/** Formato pedido en ?formato= si existe; si no, 75 cl o el primero disponible. */
export function pickFormato(raw: string | string[] | undefined, formatos: number[]): number | null {
  const v = Number(Array.isArray(raw) ? raw[0] : raw);
  if (Number.isInteger(v) && formatos.includes(v)) return v;
  return formatos[0] ?? null;
}

/** Ofertas de un formato: primero las disponibles, después por precio y tienda. */
export function ofertasDelFormato(ofertas: Oferta[], formato: number | null): Oferta[] {
  return ofertas
    .filter((o) => o.formato_ml === formato)
    .sort(
      (a, b) =>
        Number(b.disponible) - Number(a.disponible) ||
        a.precio - b.precio ||
        a.tienda.nombre.localeCompare(b.tienda.nombre),
    );
}

export type ResumenPrecios = {
  /** Oferta disponible más barata ahora (null si no hay ninguna disponible). */
  minimoActual: Oferta | null;
  /** Precio más bajo registrado en el historial de estas ofertas y cuándo empezó. */
  minimoHistorico: { precio: number; desde: string } | null;
};

export function resumenPrecios(ofertas: Oferta[]): ResumenPrecios {
  const disponibles = ofertas.filter((o) => o.disponible);
  const minimoActual = disponibles.reduce<Oferta | null>((m, o) => (!m || o.precio < m.precio ? o : m), null);
  let minimoHistorico: ResumenPrecios["minimoHistorico"] = null;
  for (const o of ofertas) {
    for (const h of o.historial) {
      if (!minimoHistorico || h.precio < minimoHistorico.precio ||
          (h.precio === minimoHistorico.precio && h.desde < minimoHistorico.desde)) {
        minimoHistorico = { precio: h.precio, desde: h.desde };
      }
    }
  }
  return { minimoActual, minimoHistorico };
}

const DIA = 86_400_000;

/**
 * Serie del precio mínimo entre tiendas, un punto por día con cambios (yyyy-mm-dd UTC), desde el
 * primer tramo hasta `hoy`. En cada día cuenta el precio vigente de cada oferta al final del día.
 */
export function serieMinimo(ofertas: Oferta[], hoy: Date = new Date()): PuntoPrecio[] {
  const tramos = ofertas.flatMap((o) => o.historial);
  if (tramos.length === 0) return [];
  const dia = (t: string | number | Date) => Math.floor(new Date(t).getTime() / DIA);
  const inicio = Math.min(...tramos.map((t) => dia(t.desde)));
  const fin = Math.max(dia(hoy), ...tramos.map((t) => dia(t.desde)));
  // Días en los que algo cambia: inicios y finales de tramo.
  const cambios = new Set<number>([inicio]);
  for (const t of tramos) {
    cambios.add(dia(t.desde));
    if (t.hasta) cambios.add(dia(t.hasta));
  }
  const puntos: PuntoPrecio[] = [];
  for (const d of [...cambios].filter((d) => d <= fin).sort((a, b) => a - b)) {
    const finDia = (d + 1) * DIA - 1;
    const vigentes = tramos.filter(
      (t) => new Date(t.desde).getTime() <= finDia && (!t.hasta || new Date(t.hasta).getTime() > finDia),
    );
    if (vigentes.length === 0) continue;
    const precio = Math.min(...vigentes.map((t) => t.precio));
    if (puntos.at(-1)?.precio === precio) continue;
    puntos.push({ fecha: new Date(d * DIA).toISOString().slice(0, 10), precio });
  }
  return puntos;
}

/** Enlace a la tienda: con la plantilla de afiliación si la tienda la tiene. */
export function urlOferta(o: Pick<Oferta, "url"> & { tienda: { afiliacion_plantilla: string | null } }): string {
  const p = o.tienda.afiliacion_plantilla;
  return p ? p.replace("{url}", encodeURIComponent(o.url)) : o.url;
}
