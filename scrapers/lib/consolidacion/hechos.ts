// Hechos extraídos: valores atómicos y factuales que una fuente afirma sobre
// una entidad (registros_fuente.hechos). Son la única materia prima de los
// resúmenes propios: nunca se guarda ni se reescribe el texto de la fuente.
import { createHash } from "node:crypto";
import { PRIORIDAD, type Origen } from "./decidir.ts";

/** Vocabulario cerrado: cada clave tiene un tipo de valor y un sentido fijo. */
export type ClaveHecho =
  | "bodega.nombre"          // string
  | "bodega.municipio"       // string
  | "bodega.provincia"       // string
  | "bodega.denominacion"    // string (una por hecho: «Ribera del Duero»)
  | "bodega.fundacion_anio"  // number
  | "bodega.hectareas"       // number, unidad «ha»
  | "bodega.enoturismo"      // boolean: ofrece visitas
  | "bodega.horario_visitas" // string: «Lunes a Viernes: 10:00 h - 17:00 h; …»
  | "vino.nombre"            // string
  | "vino.tipo"              // enum tipo_vino
  | "vino.crianza"           // enum crianza_vino
  | "vino.denominacion"      // string
  | "anada.anio"             // number
  | "anada.variedad"         // number (porcentaje) o null, sujeto = nombre de la uva
  | "anada.barrica_meses"    // number, unidad «meses»
  | "anada.grado"            // number, unidad «%»
  | "anada.temperatura_min"  // number, unidad «ºC»
  | "anada.temperatura_max"  // number, unidad «ºC»
  | "anada.cata.vista"       // string: descriptor breve («rojo picota»)
  | "anada.cata.nariz"       // string: descriptor breve («frutos negros»)
  | "anada.cata.boca"        // string: descriptor breve («taninos pulidos»)
  | "vino.maridaje";         // string: plato o categoría («carnes rojas»)

export interface FuenteHecho {
  fuente_id: string;
  /** null hasta que el registro existe (se completa al guardar). */
  registro_id: string | null;
  url: string | null;
  origen: Exclude<Origen, "admin">;
}

export interface Hecho {
  clave: ClaveHecho;
  valor: string | number | boolean | null;
  /** De qué es el hecho cuando hay varios del mismo tipo (la uva en «anada.variedad»). */
  sujeto?: string;
  unidad?: string;
  fuente: FuenteHecho;
  /** ISO. */
  observado_en: string;
}

/** Atajo para construir los hechos de un registro con una misma fuente y fecha. */
export function hechosDe(
  fuente: FuenteHecho,
  observadoEn: string,
  lista: { clave: ClaveHecho; valor: Hecho["valor"] | undefined; sujeto?: string; unidad?: string }[],
): Hecho[] {
  return lista
    .filter((h) => h.valor !== undefined && h.valor !== "" && (h.valor !== null || h.sujeto))
    .map((h) => ({
      clave: h.clave,
      valor: h.valor as Hecho["valor"],
      ...(h.sujeto ? { sujeto: h.sujeto } : {}),
      ...(h.unidad ? { unidad: h.unidad } : {}),
      fuente,
      observado_en: observadoEn,
    }));
}

/**
 * Hechos de varias fuentes sobre una entidad → un hecho por clave (y sujeto), el de la fuente más
 * prioritaria (después el más reciente). Las claves con sujeto (uvas) se toman todas de la mejor
 * fuente que las dé, para no mezclar composiciones de fuentes distintas.
 */
export function consolidarHechos(hechos: Hecho[]): Hecho[] {
  const orden = (a: Hecho, b: Hecho) =>
    PRIORIDAD[b.fuente.origen] - PRIORIDAD[a.fuente.origen] ||
    b.observado_en.localeCompare(a.observado_en) ||
    a.fuente.fuente_id.localeCompare(b.fuente.fuente_id);
  const ordenados = [...hechos].sort(orden);
  const out: Hecho[] = [];
  const vistos = new Set<string>();
  const fuenteConSujeto = new Map<string, string>(); // clave → fuente elegida
  for (const h of ordenados) {
    if (h.sujeto !== undefined) {
      const elegida = fuenteConSujeto.get(h.clave);
      if (elegida && elegida !== h.fuente.fuente_id) continue;
      fuenteConSujeto.set(h.clave, h.fuente.fuente_id);
    }
    const k = `${h.clave}|${h.sujeto ?? ""}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(h);
  }
  return out.sort((a, b) => a.clave.localeCompare(b.clave) || (a.sujeto ?? "").localeCompare(b.sujeto ?? ""));
}

/** Hash estable de los hechos (sin fechas ni fuentes: solo lo que afecta al texto). */
export function hashHechos(hechos: Hecho[], extra: string): string {
  const canonico = consolidarHechos(hechos).map((h) => [h.clave, h.sujeto ?? null, h.valor, h.unidad ?? null]);
  return createHash("sha256").update(JSON.stringify([extra, canonico])).digest("hex");
}
