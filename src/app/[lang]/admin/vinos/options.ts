import "server-only";
import type { Option } from "@/components/admin/entity-form";
import type { Supabase } from "@/lib/admin/server";

// Bodegas y D.O. para los desplegables del formulario de vino (~300 + ~100 filas).
export async function vinoOptions(supabase: Supabase): Promise<{ bodegas: Option[]; denominaciones: Option[] }> {
  const [bodegas, denominaciones] = await Promise.all([
    supabase.from("bodegas").select("id, nombre").order("nombre").limit(5000),
    supabase.from("denominaciones").select("id, nombre").order("nombre"),
  ]);
  if (bodegas.error || denominaciones.error) throw new Error((bodegas.error ?? denominaciones.error)!.message);
  return {
    bodegas: bodegas.data.map((b) => ({ value: b.id, label: b.nombre })),
    denominaciones: denominaciones.data.map((d) => ({ value: d.id, label: d.nombre })),
  };
}
