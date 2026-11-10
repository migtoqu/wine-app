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
import { isUuid, text, validateTienda } from "@/lib/admin/validation";

const PATH = "/tiendas";

export async function guardarTienda(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id") || null;
  if (id !== null && !isUuid(id)) return failure(form, { message: "notFound" });

  const parsed = validateTienda(form);
  if (!parsed.ok) return failure(form, { errors: parsed.errors });
  const { slug: slugPedido, ...campos } = parsed.data;
  const slug = await resolveSlug(supabase, "tiendas", { slug: slugPedido, nombre: campos.nombre, id: id ?? undefined });
  if ("error" in slug) return failure(form, { errors: { slug: slug.error } });

  const fila = { ...campos, slug: slug.slug };
  const r = id
    ? await supabase.from("tiendas").update(fila).eq("id", id).select("id").maybeSingle()
    : await supabase.from("tiendas").insert(fila).select("id").single();
  if (r.error) return saveFailure(form, r.error);
  if (!r.data) return failure(form, { message: "notFound" });

  catalogChanged();
  if (!id) redirect(adminPath(lang, `${PATH}/${r.data.id}`, { ok: "creado" }));
  return success();
}

// Borra la tienda con sus ofertas e historial (cascade). Para dejar de mostrarla sin perder
// el historial basta con desactivarla.
export async function borrarTienda(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id");
  if (!isUuid(id)) redirect(adminPath(lang, PATH, { error: "notFound" }));
  if (!confirmed(form)) redirect(adminPath(lang, `${PATH}/${id}`, { error: "confirmRequired" }));

  const { error } = await supabase.from("tiendas").delete().eq("id", id);
  if (error) redirect(adminPath(lang, `${PATH}/${id}`, { error: dbErrorKey(error) }));
  catalogChanged();
  redirect(adminPath(lang, PATH, { ok: "borrado" }));
}

// Ocultar o volver a mostrar una oferta (oculta_admin: ningún scraper la toca).
export async function ocultarOferta(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const tiendaId = text(form, "tienda_id");
  const id = text(form, "id");
  if (!isUuid(tiendaId) || !isUuid(id)) redirect(adminPath(lang, PATH, { error: "notFound" }));
  const oculta = text(form, "oculta") === "si";

  const { error } = await supabase
    .from("ofertas")
    .update({ oculta_admin: oculta })
    .eq("id", id)
    .eq("tienda_id", tiendaId);
  if (error) redirect(adminPath(lang, `${PATH}/${tiendaId}`, { error: dbErrorKey(error) }));
  catalogChanged();
  redirect(adminPath(lang, `${PATH}/${tiendaId}`, { ok: "guardado" }));
}
