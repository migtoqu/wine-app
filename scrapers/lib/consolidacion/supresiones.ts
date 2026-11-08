// Supresiones del admin y decisiones de la cola de revisión, tal como las ven
// los scrapers. Ver la migración 20261110090000_consolidacion.
import type { SupresionBodega } from "../../emparejamiento/entidades.ts";
import type { SupresionVino } from "../../emparejamiento/vinos.ts";
import { sinError, type ClienteDb } from "../db.ts";

type Entidad = "bodega" | "vino" | "anada" | "imagen" | "servicio_bodega";

export interface FilaSupresion {
  id: string;
  entidad_id: string;
  motivo: string;
  fusionada_en: string | null;
  claves: Record<string, unknown>;
}

/** Todas las supresiones de un tipo (unos cientos como mucho). */
export async function cargarSupresiones(db: ClienteDb, tipo: Entidad): Promise<FilaSupresion[]> {
  const out: FilaSupresion[] = [];
  for (let desde = 0; ; desde += 1000) {
    const filas = sinError(
      await db
        .from("supresiones")
        .select("id, entidad_id, motivo, fusionada_en, claves")
        .eq("entidad_tipo", tipo)
        .order("id")
        .range(desde, desde + 999),
      "leer supresiones",
    );
    out.push(...filas.map((f) => ({ ...f, claves: (f.claves ?? {}) as Record<string, unknown> })));
    if (filas.length < 1000) return out;
  }
}

const texto = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

export function aSupresionBodega(f: FilaSupresion): SupresionBodega | null {
  const nombre = texto(f.claves.nombre);
  if (!nombre) return null;
  return {
    supresionId: f.id,
    entidadId: f.entidad_id,
    motivo: f.motivo === "fusion" ? "fusion" : "borrado",
    destinoId: f.fusionada_en,
    nombre,
    municipio: texto(f.claves.municipio),
    web: texto(f.claves.web),
    nif: texto(f.claves.nif),
    registroEmbotellador: texto(f.claves.registro_embotellador),
  };
}

export function aSupresionVino(f: FilaSupresion): SupresionVino | null {
  const nombre = texto(f.claves.nombre);
  if (!nombre) return null;
  return {
    supresionId: f.id,
    motivo: f.motivo === "fusion" ? "fusion" : "borrado",
    destinoId: f.fusionada_en,
    bodegaId: texto(f.claves.bodega_id),
    nombre,
    eans: Array.isArray(f.claves.eans) ? (f.claves.eans as unknown[]).filter((e): e is string => typeof e === "string") : [],
  };
}

/** Claves «vino_id|año» de añadas borradas por el admin (null = sin añada). */
export function clavesAnadasSuprimidas(filas: FilaSupresion[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of filas) {
    if (f.motivo !== "borrado") continue;
    const vino = texto(f.claves.vino_id);
    if (vino) m.set(`${vino}|${f.claves.anio ?? "null"}`, f.id);
  }
  return m;
}

/** Claves «entidad_id|url» de imágenes borradas por el admin. */
export function clavesImagenesSuprimidas(filas: FilaSupresion[]): Set<string> {
  const s = new Set<string>();
  for (const f of filas) {
    if (f.motivo !== "borrado") continue;
    const url = texto(f.claves.url);
    for (const k of ["anada_id", "vino_id", "bodega_id", "servicio_id"]) {
      const id = texto(f.claves[k]);
      if (url && id) s.add(`${id}|${url}`);
    }
  }
  return s;
}

/** Campos de registros_fuente que dicen qué ha decidido el admin. */
export interface EstadoAdminRegistro {
  supresion_id?: string | null;
  decision?: string | null;
  decision_tipo?: string | null;
  decision_id?: string | null;
}

export type DecisionAdmin =
  | { tipo: "suprimido"; supresionId: string }
  | { tipo: "descartar" }
  | { tipo: "asociar"; entidad: string; id: string }
  | { tipo: "crear"; entidad: string | null; id: string | null }
  | null;

/** Lo que el admin decidió sobre un registro (null = nada: el scraper empareja como siempre). */
export function decisionAdmin(r: EstadoAdminRegistro | null | undefined): DecisionAdmin {
  if (!r) return null;
  if (r.supresion_id) return { tipo: "suprimido", supresionId: r.supresion_id };
  if (r.decision === "descartar") return { tipo: "descartar" };
  if (r.decision === "asociar" && r.decision_tipo && r.decision_id) {
    return { tipo: "asociar", entidad: r.decision_tipo, id: r.decision_id };
  }
  if (r.decision === "crear") return { tipo: "crear", entidad: r.decision_tipo ?? null, id: r.decision_id ?? null };
  return null;
}
