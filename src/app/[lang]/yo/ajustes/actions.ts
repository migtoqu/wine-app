"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { defaultLocale, hasLocale, localePath, type Locale } from "@/i18n/config";
import { setPreferenceCookies } from "@/lib/auth/cookies";
import type { FormState } from "@/lib/auth/form-state";
import { requireUser } from "@/lib/auth/server";
import {
  TEMA_A_COOKIE,
  validateProfile,
  validateWinePrefs,
  type ProfileField,
  type WinePrefsField,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

function formLocale(form: FormData): Locale {
  const value = form.get("lang");
  return typeof value === "string" && hasLocale(value) ? value : defaultLocale;
}

// Perfil: nombre, idioma, tema y preferencias de email. Sincroniza las cookies
// NEXT_LOCALE y theme; si cambia el idioma, lleva a los ajustes en el nuevo.
export async function updateProfile(
  _prev: FormState,
  form: FormData,
): Promise<FormState<ProfileField>> {
  const lang = formLocale(form);
  const user = await requireUser({ lang, next: localePath(lang, "/yo/ajustes") });
  const parsed = validateProfile(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const supabase = await createClient();
  const { error } = await supabase.from("perfiles").update(parsed.data).eq("id", user.id);
  if (error) return { status: "error", message: "generic" };

  await setPreferenceCookies(parsed.data.idioma, parsed.data.tema);
  if (parsed.data.idioma !== lang) redirect(localePath(parsed.data.idioma, "/yo/ajustes"));
  refresh();
  // El cliente aplica el tema en caliente con este valor.
  return { status: "success", values: { theme: TEMA_A_COOKIE[parsed.data.tema] } };
}

// Gustos de vino. Los ids de uvas y D.O. se filtran contra sus tablas (los arrays
// no tienen FK).
export async function updateWinePrefs(
  _prev: FormState,
  form: FormData,
): Promise<FormState<WinePrefsField>> {
  const lang = formLocale(form);
  const user = await requireUser({ lang, next: localePath(lang, "/yo/ajustes") });
  const parsed = validateWinePrefs(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const supabase = await createClient();
  const { variedad_uva_ids, denominacion_ids } = parsed.data;
  const [variedades, denominaciones] = await Promise.all([
    variedad_uva_ids.length
      ? supabase.from("variedades_uva").select("id").in("id", variedad_uva_ids)
      : { data: [], error: null },
    denominacion_ids.length
      ? supabase.from("denominaciones").select("id").in("id", denominacion_ids)
      : { data: [], error: null },
  ]);
  if (variedades.error || denominaciones.error) return { status: "error", message: "generic" };

  const { error } = await supabase.from("preferencias_vino").upsert({
    ...parsed.data,
    usuario_id: user.id,
    variedad_uva_ids: variedades.data.map((v) => v.id),
    denominacion_ids: denominaciones.data.map((d) => d.id),
  });
  if (error) return { status: "error", message: "generic" };

  refresh();
  return { status: "success" };
}
