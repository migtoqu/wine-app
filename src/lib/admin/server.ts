import "server-only";
import { updateTag } from "next/cache";
import { defaultLocale, hasLocale, localePath, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/server";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/text";
import type { AdminFormState } from "./form-state";
import { formValues, nextFreeSlug, text, type AdminErrorKey, type Form } from "./validation";

// Piezas comunes de las Server Actions del admin. Cada acción vuelve a
// comprobar el rol (el layout no protege las acciones) y usa el cliente de
// sesión: la RLS de admin es la barrera real. Nunca la service role key.

export type Supabase = Awaited<ReturnType<typeof createClient>>;

export function formLocale(form: Pick<FormData, "get">): Locale {
  const value = form.get("lang");
  return typeof value === "string" && hasLocale(value) ? value : defaultLocale;
}

export async function adminAction(form: Pick<FormData, "get">, path = "/admin") {
  const lang = formLocale(form);
  const user = await requireAdmin({ lang, next: localePath(lang, path) });
  return { lang, user, supabase: await createClient() };
}

export { adminPath } from "./paths";

// Invalida todas las lecturas cacheadas del catálogo público
// (src/lib/catalog/queries.ts): el admin ve su cambio al momento.
export function catalogChanged() {
  updateTag(CATALOG_TAG);
}

type SlugTable = "bodegas" | "vinos" | "denominaciones" | "variedades_uva";

/**
 * Slug a guardar: el que puso el admin (si está libre) o uno generado a partir
 * del nombre con -2, -3… si ya existe. null + error si el elegido está ocupado.
 */
export async function resolveSlug(
  supabase: Supabase,
  table: SlugTable,
  { slug, nombre, id }: { slug: string | null; nombre: string; id?: string },
): Promise<{ slug: string } | { error: AdminErrorKey }> {
  if (slug) {
    let query = supabase.from(table).select("id").eq("slug", slug);
    if (id) query = query.neq("id", id);
    const { data, error } = await query.limit(1);
    if (error) return { error: "generic" };
    return data.length > 0 ? { error: "slugTaken" } : { slug };
  }
  const base = slugify(nombre) || "ficha";
  let query = supabase.from(table).select("slug").like("slug", `${base}%`);
  if (id) query = query.neq("id", id);
  const { data, error } = await query.limit(1000);
  if (error) return { error: "generic" };
  return { slug: nextFreeSlug(base, data.map((r) => r.slug)) };
}

type DbError = { code?: string; message?: string } | null;

// Traduce errores de Postgres a claves de dict.admin.errors.
export function dbErrorKey(error: DbError): AdminErrorKey {
  if (!error) return "generic";
  if (error.message?.includes("ultimo_admin")) return "lastAdmin";
  if (error.message?.includes("porcentaje_excedido")) return "grapesOver100";
  if (error.message?.includes("principal_invalida")) return "principalNotSelected";
  switch (error.code) {
    case "23505":
      return error.message?.includes("slug") ? "slugTaken" : "generic";
    case "23503":
      return "inUse";
    case "23514":
      return "outOfRange";
    default:
      return "generic";
  }
}

export function confirmed(form: Pick<FormData, "get">): boolean {
  return text(form, "confirmar") === "on";
}

// Respuesta de error de un formulario: con lo enviado para volver a rellenarlo.
export function failure(
  form: Form,
  state: Pick<AdminFormState, "errors" | "message">,
): AdminFormState {
  return { status: "error", values: formValues(form), seq: Date.now(), ...state };
}

export function success(): AdminFormState {
  return { status: "success", seq: Date.now() };
}

// Error al guardar una ficha: el slug duplicado va al campo slug.
export function saveFailure(form: Form, error: DbError): AdminFormState {
  const key = dbErrorKey(error);
  return failure(form, key === "slugTaken" ? { errors: { slug: key } } : { message: key });
}
