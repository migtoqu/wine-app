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
import { isUuid, REDES, text, validateBodega } from "@/lib/admin/validation";
import type { Json } from "@/lib/supabase/database.types";

const PATH = "/bodegas";

// bodegas.redes con las redes del formulario; las demás claves se conservan.
function mergeRedes(actual: Json | undefined, nuevas: Record<(typeof REDES)[number], string | null>) {
  const base =
    actual && typeof actual === "object" && !Array.isArray(actual) ? { ...actual } : ({} as Record<string, Json>);
  for (const red of REDES) {
    if (nuevas[red]) base[red] = nuevas[red];
    else delete base[red];
  }
  return base;
}

// Ficha de bodega + sus D.O. (estas en una sola transacción, vía RPC).
export async function guardarBodega(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id") || null;
  if (id !== null && !isUuid(id)) return failure(form, { message: "notFound" });

  const parsed = validateBodega(form);
  if (!parsed.ok) return failure(form, { errors: parsed.errors });
  const { slug: slugPedido, denominaciones, principal, instagram, facebook, x, ...campos } = parsed.data;

  const slug = await resolveSlug(supabase, "bodegas", { slug: slugPedido, nombre: campos.nombre, id: id ?? undefined });
  if ("error" in slug) return failure(form, { errors: { slug: slug.error } });

  let redesActuales: Json | undefined;
  if (id) {
    const { data, error } = await supabase.from("bodegas").select("redes").eq("id", id).maybeSingle();
    if (error) return failure(form, { message: "generic" });
    if (!data) return failure(form, { message: "notFound" });
    redesActuales = data.redes;
  }

  const fila = { ...campos, slug: slug.slug, redes: mergeRedes(redesActuales, { instagram, facebook, x }) };
  const r = id
    ? await supabase.from("bodegas").update(fila).eq("id", id).select("id").maybeSingle()
    : await supabase.from("bodegas").insert(fila).select("id").single();
  if (r.error) return saveFailure(form, r.error);
  if (!r.data) return failure(form, { message: "notFound" });

  const { error: errorDo } = await supabase.rpc("admin_guardar_denominaciones_bodega", {
    p_bodega_id: r.data.id,
    p_denominacion_ids: denominaciones,
    ...(principal ? { p_principal: principal } : {}),
  });
  catalogChanged();
  if (errorDo) {
    // La ficha ya se guardó: al crear se lleva a la edición para reintentar las D.O.
    if (!id) redirect(adminPath(lang, `${PATH}/${r.data.id}`, { error: dbErrorKey(errorDo) }));
    return failure(form, { errors: { denominaciones: dbErrorKey(errorDo) } });
  }
  if (!id) redirect(adminPath(lang, `${PATH}/${r.data.id}`, { ok: "creado" }));
  return success();
}

// vinos → bodegas es restrict (decisión explícita): con vinos falla (23503).
// En cascada: bodega_denominaciones, servicios_bodega e imagenes.
export async function borrarBodega(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id");
  if (!isUuid(id)) redirect(adminPath(lang, PATH, { error: "notFound" }));
  if (!confirmed(form)) redirect(adminPath(lang, `${PATH}/${id}`, { error: "confirmRequired" }));

  const { error } = await supabase.from("bodegas").delete().eq("id", id);
  if (error) redirect(adminPath(lang, `${PATH}/${id}`, { error: dbErrorKey(error) }));
  catalogChanged();
  redirect(adminPath(lang, PATH, { ok: "borrado" }));
}
