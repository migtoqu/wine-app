// Decisión pura de la consolidación por campo (SCOPE §7.2): qué valor gana
// entre lo que dicen las fuentes y si se escribe en el catálogo. Sin BD: la
// usa Consolidador (consolidar.ts) y se prueba en decidir.test.ts.
import type { Database } from "../../../src/lib/supabase/database.types.ts";
import { igualesJson } from "../json.ts";

export type Origen = Database["public"]["Enums"]["origen_dato"];
export type TipoFuente = Database["public"]["Enums"]["tipo_fuente"];

/** admin > web oficial de la bodega > consejo regulador > guía > tienda > otra. */
export const PRIORIDAD: Record<Origen, number> = {
  admin: 6,
  bodega: 5,
  consejo_regulador: 4,
  guia: 3,
  tienda: 2,
  otra: 1,
};

/** Origen de un dato según el tipo de la fuente (`fuentes.tipo`). */
export function origenDeFuente(tipo: TipoFuente): Exclude<Origen, "admin"> {
  return tipo;
}

/** Lo que un registro de fuente dice de un campo (`valores_fuente`). */
export interface Candidato {
  registroId: string;
  fuenteId: string;
  origen: Exclude<Origen, "admin">;
  url: string | null;
  valor: unknown;
  observadoEn: string;
  /** Desde cuándo da la fuente este valor: desempata sin oscilar entre dos fuentes. */
  valorDesde: string;
  /**
   * Valor que tenía este candidato antes de esta ejecución (undefined si es nuevo). Si el ganador
   * es el mismo registro y su valor no cambió, no se reescribe la columna: así no hace falta
   * comparar con el formato de la BD (p. ej. geography frente a EWKT).
   */
  valorAnterior?: unknown;
}

/** Procedencia vigente de un campo (`procedencia_campos`). */
export interface Procedencia {
  origen: Origen;
  fuenteId: string | null;
  registroId: string | null;
  url: string | null;
  observadoEn: string;
}

export interface DecisionCampo {
  /** Escribir este valor en la columna (ausente = no tocarla). */
  escribir?: { valor: unknown };
  /** Nueva procedencia; null = borrarla; undefined = sin cambios. */
  procedencia?: Procedencia | null;
}

const vacio = (v: unknown) => v === null || v === undefined;

/** Orden de candidatos: prioridad del origen, después valor más reciente, después id (determinista). */
export function compararCandidatos(a: Candidato, b: Candidato): number {
  return (
    PRIORIDAD[b.origen] - PRIORIDAD[a.origen] ||
    b.valorDesde.localeCompare(a.valorDesde) ||
    b.observadoEn.localeCompare(a.observadoEn) ||
    a.registroId.localeCompare(b.registroId)
  );
}

export function mejorCandidato(candidatos: Candidato[]): Candidato | null {
  const validos = candidatos.filter((c) => !vacio(c.valor));
  return validos.sort(compararCandidatos)[0] ?? null;
}

function procedenciaDe(c: Candidato): Procedencia {
  return { origen: c.origen, fuenteId: c.fuenteId, registroId: c.registroId, url: c.url, observadoEn: c.observadoEn };
}

function mismaProcedencia(a: Procedencia, b: Procedencia): boolean {
  return a.origen === b.origen && a.fuenteId === b.fuenteId && a.registroId === b.registroId && a.url === b.url;
}

/**
 * Decide un campo:
 * 1. Procedencia 'admin' → nada (el admin siempre gana, también si lo dejó vacío).
 * 2. Sin procedencia y columna con valor: si coincide con el ganador se adopta su procedencia; si no,
 *    es un dato manual y se registra como 'admin'.
 * 3. Si no, gana el mejor candidato no vacío; se escribe si cambió el ganador o su valor.
 * 4. Sin candidatos y la procedencia era de una fuente → se vacía la columna.
 */
export function decidirCampo(
  actual: unknown,
  procedencia: Procedencia | null,
  candidatos: Candidato[],
  ahora: string,
): DecisionCampo {
  if (procedencia?.origen === "admin") return {};
  const mejor = mejorCandidato(candidatos);

  if (!procedencia) {
    if (vacio(actual)) {
      return mejor ? { escribir: { valor: mejor.valor }, procedencia: procedenciaDe(mejor) } : {};
    }
    if (mejor && igualesJson(actual, mejor.valor)) return { procedencia: procedenciaDe(mejor) };
    return { procedencia: { origen: "admin", fuenteId: null, registroId: null, url: null, observadoEn: ahora } };
  }

  if (!mejor) {
    return vacio(actual) ? { procedencia: null } : { escribir: { valor: null }, procedencia: null };
  }

  const nueva = procedenciaDe(mejor);
  const sinCambio =
    procedencia.registroId === mejor.registroId &&
    mejor.valorAnterior !== undefined &&
    igualesJson(mejor.valorAnterior, mejor.valor);
  const decision: DecisionCampo = {};
  if (!sinCambio && !igualesJson(actual, mejor.valor)) decision.escribir = { valor: mejor.valor };
  if (!mismaProcedencia(procedencia, nueva) || decision.escribir) decision.procedencia = nueva;
  return decision;
}

/** Decide todos los campos de una entidad. `candidatos` agrupados por campo. */
export function decidirCampos(
  actual: Record<string, unknown>,
  procedencias: Map<string, Procedencia>,
  candidatos: Map<string, Candidato[]>,
  campos: string[],
  ahora: string,
): Map<string, DecisionCampo> {
  const out = new Map<string, DecisionCampo>();
  for (const campo of campos) {
    const d = decidirCampo(actual[campo] ?? null, procedencias.get(campo) ?? null, candidatos.get(campo) ?? [], ahora);
    if (d.escribir || d.procedencia !== undefined) out.set(campo, d);
  }
  return out;
}
