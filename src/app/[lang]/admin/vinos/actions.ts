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
  resolveSlug,
  saveFailure,
  success,
} from "@/lib/admin/server";
import { isUuid, text, validateVino } from "@/lib/admin/validation";

const PATH = "/vinos";

export async function guardarVino(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id") || null;
  if (id !== null && !isUuid(id)) return failure(form, { message: "notFound" });

  const parsed = validateVino(form);
  if (!parsed.ok) return failure(form, { errors: parsed.errors });
  const { slug: slugPedido, ...campos } = parsed.data;
  const slug = await resolveSlug(supabase, "vinos", { slug: slugPedido, nombre: campos.nombre, id: id ?? undefined });
  if ("error" in slug) return failure(form, { errors: { slug: slug.error } });

  const fila = { ...campos, slug: slug.slug };
  const r = id
    ? await supabase.from("vinos").update(fila).eq("id", id).select("id").maybeSingle()
    : await supabase.from("vinos").insert(fila).select("id").single();
  if (r.error) {
    // FK a una bodega o D.O. que ya no existe.
    if (r.error.code === "23503") return failure(form, { errors: { bodega_id: "invalidOption" } });
    return saveFailure(form, r.error);
  }
  if (!r.data) return failure(form, { message: "notFound" });

  catalogChanged();
  if (!id) redirect(adminPath(lang, `${PATH}/${r.data.id}`, { ok: "creado" }));
  return success();
}

// En cascada: añadas (con sus uvas e imágenes) e imágenes del vino.
export async function borrarVino(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id");
  if (!isUuid(id)) redirect(adminPath(lang, PATH, { error: "notFound" }));
  if (!confirmed(form)) redirect(adminPath(lang, `${PATH}/${id}`, { error: "confirmRequired" }));

  const { data, error } = await supabase.from("vinos").delete().eq("id", id).select("bodega_id").maybeSingle();
  if (error) redirect(adminPath(lang, `${PATH}/${id}`, { error: dbErrorKey(error) }));
  catalogChanged();
  redirect(
    data ? adminPath(lang, `/bodegas/${data.bodega_id}`, { ok: "vinoBorrado" }) : adminPath(lang, PATH, { ok: "borrado" }),
  );
}
