// Cliente de Supabase con la service role key (se salta la RLS). Solo se crea
// en ejecuciones reales: el modo --dry-run nunca llama a esta función.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types.ts";

export type ClienteDb = SupabaseClient<Database>;
export type Tablas = Database["public"]["Tables"];

export function crearClienteDb(): ClienteDb {
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    throw new Error(
      "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (o usa --dry-run para no tocar la BD)",
    );
  }
  return createClient<Database>(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ConError = { error: { message: string } };

/** Lanza si la respuesta de Supabase trae error; devuelve los datos (ya sin el caso de error). */
export function sinError<R extends { data: unknown; error: { message: string } | null }>(
  r: R,
  que: string,
): Exclude<R, ConError>["data"] {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data as Exclude<R, ConError>["data"];
}

/** Nº de registros (no descartados) de una fuente: base para detectar volúmenes anómalos. */
export async function registrosConocidos(db: ClienteDb, fuenteId: string): Promise<number> {
  const r = await db
    .from("registros_fuente")
    .select("id", { count: "exact", head: true })
    .eq("fuente_id", fuenteId)
    .neq("estado_emparejamiento", "descartado");
  if (r.error) throw new Error(`contar registros: ${r.error.message}`);
  return r.count ?? 0;
}
