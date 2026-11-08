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
import { isUuid, text, validateUva } from "@/lib/admin/validation";

const PATH = "/uvas";

export async function guardarUva(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id") || null;
  if (id !== null && !isUuid(id)) return failure(form, { message: "notFound" });

  const parsed = validateUva(form);
  if (!parsed.ok) return failure(form, { errors: parsed.errors });
  const { slug: slugPedido, ...campos } = parsed.data;
  const slug = await resolveSlug(supabase, "variedades_uva", { slug: slugPedido, nombre: campos.nombre, id: id ?? undefined });
  if ("error" in slug) return failure(form, { errors: { slug: slug.error } });

  const fila = { ...campos, slug: slug.slug };
  const r = id
    ? await supabase.from("variedades_uva").update(fila).eq("id", id).select("id").maybeSingle()
    : await supabase.from("variedades_uva").insert(fila).select("id").single();
  if (r.error) return saveFailure(form, r.error);
  if (!r.data) return failure(form, { message: "notFound" });

  catalogChanged();
  if (!id) redirect(adminPath(lang, `${PATH}/${r.data.id}`, { ok: "creado" }));
  return success();
}

// anada_variedades → variedades_uva es restrict: si alguna añada la usa falla (23503).
export async function borrarUva(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id");
  if (!isUuid(id)) redirect(adminPath(lang, PATH, { error: "notFound" }));
  if (!confirmed(form)) redirect(adminPath(lang, `${PATH}/${id}`, { error: "confirmRequired" }));

  const { error } = await supabase.from("variedades_uva").delete().eq("id", id);
  if (error) redirect(adminPath(lang, `${PATH}/${id}`, { error: dbErrorKey(error) }));
  catalogChanged();
  redirect(adminPath(lang, PATH, { ok: "borrado" }));
}
