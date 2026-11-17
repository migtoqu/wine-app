"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { defaultLocale, hasLocale, localePath, type Locale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { validateCava, type CavaErrorKey, type CavaField } from "./cava";
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

// Crea (sin id) o edita (con id) un lote y vuelve a la cava.
export async function saveCavaLote(_prev: CavaFormState, form: FormData): Promise<CavaFormState> {
  const lang = toLocale(form.get("lang"));
  await requireUser({ lang });
  const parsed = validateCava(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const supabase = await createClient();
  const id = form.get("id");
  const { error } = isUuid(id)
    ? await supabase.from("cava").update(parsed.data).eq("id", id)
    : await supabase.from("cava").insert(parsed.data);
  if (error) return { status: "error", message: "generic" };

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
    await supabase.from("cava").delete().eq("id", id);
  }
  refresh();
  redirect(localePath(lang, "/yo/cava"));
}
