// Alta de una fila con slug propio y estable: prueba candidatos en orden y
// reintenta si otra fila tomó el slug entretanto (23505).
import { sinError, type ClienteDb } from "../db.ts";

export async function insertarConSlug(
  db: ClienteDb,
  tabla: "bodegas" | "vinos",
  fila: Record<string, unknown>,
  candidatos: string[],
  usados: Set<string>,
): Promise<{ id: string; slug: string }> {
  for (const slug of candidatos) {
    if (usados.has(slug)) continue;
    const r = await db
      .from(tabla)
      .insert({ ...fila, slug } as never)
      .select("id")
      .single();
    if (r.error?.code === "23505" && r.error.message.includes("slug")) {
      usados.add(slug);
      continue;
    }
    const creada = sinError(r, `crear en ${tabla}`) as { id: string };
    usados.add(slug);
    return { id: creada.id, slug };
  }
  throw new Error(`Sin slug libre en ${tabla} (${candidatos[0] ?? "?"})`);
}
