// Marcas registradas de cada bodega según el Consejo Regulador de Ribera del Duero
// (`registros_fuente.datos.claves_marcas`): sirven para emparejar razón social y marca
// («Bodegas Durón» → Grupo Solar de Samaniego).
import { sinError, type ClienteDb } from "./db.ts";

export const SLUG_CR_RIBERA = "cr-ribera-del-duero";

/** bodega_id → claves de sus marcas. Vacío si la fuente no existe. */
export async function cargarMarcasCR(db: ClienteDb): Promise<Map<string, string[]>> {
  const marcas = new Map<string, string[]>();
  const fuente = sinError(await db.from("fuentes").select("id").eq("slug", SLUG_CR_RIBERA).maybeSingle(), "leer fuente C.R. Ribera");
  if (!fuente) return marcas;
  for (let desde = 0; ; desde += 1000) {
    const filas = sinError(
      await db
        .from("registros_fuente")
        .select("entidad_id, datos")
        .eq("fuente_id", fuente.id)
        .eq("entidad_tipo", "bodega")
        .order("id")
        .range(desde, desde + 999),
      "leer marcas del C.R.",
    );
    for (const r of filas) {
      const claves = (r.datos as { claves_marcas?: unknown } | null)?.claves_marcas;
      if (r.entidad_id && Array.isArray(claves)) {
        marcas.set(r.entidad_id, claves.filter((m): m is string => typeof m === "string"));
      }
    }
    if (filas.length < 1000) return marcas;
  }
}
