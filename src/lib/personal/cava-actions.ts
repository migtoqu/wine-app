"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { defaultLocale, hasLocale, localePath, type Locale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { parseFoto, validateCava, type CavaErrorKey, type CavaField } from "./cava";
import { CAVA_FOTOS_BUCKET } from "./queries";
import { isUuid } from "./validation";

// Server Actions de Mi cava. La RLS es la barrera real (cada usuario solo toca
// sus lotes); aquí se valida la entrada y se exige sesión.

function toLocale(value: unknown): Locale {
  return typeof value === "string" && hasLocale(value) ? value : defaultLocale;
}

export type CavaFormState = {
  status: "idle" | "error";
  errors?: Partial<Record<CavaField, CavaErrorKey>>;
  message?: "generic";
};

// Crea (sin id) o edita (con id) un lote y vuelve a la cava. La foto, si la
// hay, se sube primero a Storage; si la fila no se guarda, se borra.
export async function saveCavaLote(_prev: CavaFormState, form: FormData): Promise<CavaFormState> {
  const lang = toLocale(form.get("lang"));
  const user = await requireUser({ lang });
  const parsed = validateCava(form);
  const foto = parseFoto(form);
  if (!parsed.ok || !foto.ok) {
    return {
      status: "error",
      errors: {
        ...(parsed.ok ? {} : parsed.errors),
        ...(foto.ok ? {} : { foto: foto.error }),
      },
    };
  }

  const supabase = await createClient();
  const rawId = form.get("id");
  const editing = isUuid(rawId);
  const id = editing ? rawId.toLowerCase() : crypto.randomUUID();

  let previa: string | null = null;
  if (editing) {
    const { data, error } = await supabase.from("cava").select("foto_path").eq("id", id).maybeSingle();
    if (error || !data) return { status: "error", message: "generic" };
    previa = data.foto_path;
  }

  const bucket = supabase.storage.from(CAVA_FOTOS_BUCKET);
  let foto_path: string | null = foto.quitar ? null : previa;
  let subida: string | null = null;
  if (foto.file) {
    const ext = foto.file.type === "image/png" ? "png" : foto.file.type === "image/webp" ? "webp" : "jpg";
    subida = `${user.id}/${id}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await bucket.upload(subida, foto.file, {
      contentType: foto.file.type,
      upsert: false,
    });
    if (error) return { status: "error", errors: { foto: "photo" } };
    foto_path = subida;
  }

  const row = { ...parsed.data, foto_path };
  const { error } = editing
    ? await supabase.from("cava").update(row).eq("id", id)
    : await supabase.from("cava").insert({ ...row, id });
  if (error) {
    if (subida) await bucket.remove([subida]);
    return { status: "error", message: "generic" };
  }
  if (previa && previa !== foto_path) await bucket.remove([previa]);

  refresh();
  redirect(localePath(lang, "/yo/cava"));
}

// Suma o resta botellas (p. ej. «Abrir una»). Nunca baja de 0.
export async function adjustCantidad(input: { lang: string; id: string; delta: number }): Promise<{ ok: boolean }> {
  if (!isUuid(input.id) || ![-1, 1].includes(input.delta)) return { ok: false };
  await requireUser({ lang: toLocale(input.lang) });
  const supabase = await createClient();
  const { data, error } = await supabase.from("cava").select("cantidad").eq("id", input.id).maybeSingle();
  if (error || !data) return { ok: false };
  const cantidad = Math.min(9999, Math.max(0, data.cantidad + input.delta));
  const { error: updateError } = await supabase.from("cava").update({ cantidad }).eq("id", input.id);
  if (updateError) return { ok: false };
  refresh();
  return { ok: true };
}

export async function deleteCavaLote(form: FormData) {
  const lang = toLocale(form.get("lang"));
  const id = form.get("id");
  await requireUser({ lang });
  if (isUuid(id)) {
    const supabase = await createClient();
    const { data } = await supabase.from("cava").delete().eq("id", id).select("foto_path").maybeSingle();
    if (data?.foto_path) await supabase.storage.from(CAVA_FOTOS_BUCKET).remove([data.foto_path]);
  }
  refresh();
  redirect(localePath(lang, "/yo/cava"));
}
