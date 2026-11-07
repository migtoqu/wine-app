"use server";

import { redirect } from "next/navigation";
import type { AdminFormState } from "@/lib/admin/form-state";
import {
  adminAction,
  adminPath,
  catalogChanged,
  confirmed,
  dbErrorKey,
  failure,
  success,
} from "@/lib/admin/server";
import { isUuid, text, validateAnada } from "@/lib/admin/validation";

// Añada + composición de uvas (esta en una sola transacción, vía RPC). Al
// crear llega vino_id; al editar, id.
export async function guardarAnada(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const { lang, supabase } = await adminAction(form, "/admin/vinos");
  const id = text(form, "id") || null;
  const vinoId = text(form, "vino_id");
  if (id !== null ? !isUuid(id) : !isUuid(vinoId)) return failure(form, { message: "notFound" });

  const parsed = validateAnada(form);
  if (!parsed.ok) return failure(form, { errors: parsed.errors });
  const { uvas, ...campos } = parsed.data;

  const r = id
    ? await supabase.from("anadas").update(campos).eq("id", id).select("id").maybeSingle()
    : await supabase.from("anadas").insert({ ...campos, vino_id: vinoId }).select("id").single();
  if (r.error) {
    if (r.error.code === "23505") return failure(form, { errors: { anio: "vintageTaken" } });
    return failure(form, { message: dbErrorKey(r.error) });
  }
  if (!r.data) return failure(form, { message: "notFound" });

  const { error } = await supabase.rpc("admin_guardar_variedades_anada", {
    p_anada_id: r.data.id,
    p_variedades: uvas,
  });
  catalogChanged();
  if (error) {
    if (!id) redirect(adminPath(lang, `/anadas/${r.data.id}`, { error: dbErrorKey(error) }));
    return failure(form, { errors: { uvas: dbErrorKey(error) } });
  }
  if (!id) redirect(adminPath(lang, `/anadas/${r.data.id}`, { ok: "creado" }));
  return success();
}

// En cascada: composición de uvas e imágenes de la añada.
export async function borrarAnada(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, "/admin/vinos");
  const id = text(form, "id");
  if (!isUuid(id)) redirect(adminPath(lang, "/vinos", { error: "notFound" }));
  if (!confirmed(form)) redirect(adminPath(lang, `/anadas/${id}`, { error: "confirmRequired" }));

  const { data, error } = await supabase.from("anadas").delete().eq("id", id).select("vino_id").maybeSingle();
  if (error) redirect(adminPath(lang, `/anadas/${id}`, { error: dbErrorKey(error) }));
  catalogChanged();
  redirect(
    data ? adminPath(lang, `/vinos/${data.vino_id}`, { ok: "anadaBorrada" }) : adminPath(lang, "/vinos"),
  );
}
