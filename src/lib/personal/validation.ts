// Validación de las acciones del espacio personal (favoritos y notas). Módulo
// puro (sin Supabase ni Next) para poder testearlo. Las Server Actions reciben
// datos del cliente, así que nada se da por bueno.

export const NOTA_MAX = 5000;

export const ENTIDADES_FAVORITO = ["vino", "bodega"] as const;
export const ENTIDADES_NOTA = ["vino", "anada", "bodega"] as const;

export type EntidadFavorito = (typeof ENTIDADES_FAVORITO)[number];
export type EntidadNota = (typeof ENTIDADES_NOTA)[number];

export type NoteErrorKey = "required" | "tooLong";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseEntity<T extends string>(
  tipo: unknown,
  id: unknown,
  allowed: readonly T[],
): { tipo: T; id: string } | null {
  if (typeof tipo !== "string" || !(allowed as readonly string[]).includes(tipo)) return null;
  if (!isUuid(id)) return null;
  return { tipo: tipo as T, id: id.toLowerCase() };
}

// Normaliza los saltos de línea y quita el espacio sobrante de los extremos.
export function validateNote(
  value: unknown,
): { ok: true; texto: string } | { ok: false; error: NoteErrorKey } {
  const texto = (typeof value === "string" ? value : "").replace(/\r\n?/g, "\n").trim();
  if (texto === "") return { ok: false, error: "required" };
  if (texto.length > NOTA_MAX) return { ok: false, error: "tooLong" };
  return { ok: true, texto };
}
