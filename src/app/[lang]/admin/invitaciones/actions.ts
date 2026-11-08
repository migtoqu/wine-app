"use server";

import { redirect } from "next/navigation";
import type { AdminFormState } from "@/lib/admin/form-state";
import { adminAction, adminPath, dbErrorKey, failure } from "@/lib/admin/server";
import { estadoInvitacion, isUuid, text, validateInvitacion } from "@/lib/admin/validation";

const PATH = "/invitaciones";

// Alta de invitación. Si el email tiene una sin usar ya caducada, se sustituye
// (el índice único solo deja una sin usar por email); si está pendiente, error.
export async function crearInvitacion(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const { lang, user, supabase } = await adminAction(form, `/admin${PATH}`);
  const fail = (s: Parameters<typeof failure>[1]) => failure(form, s);

  const parsed = validateInvitacion(form);
  if (!parsed.ok) return fail({ errors: parsed.errors });
  const { email, rol, caduca } = parsed.data;

  const { data: previa, error: errorPrevia } = await supabase
    .from("invitaciones")
    .select("id, usada_en, caduca")
    .eq("email", email)
    .is("usada_en", null)
    .maybeSingle();
  if (errorPrevia) return fail({ message: "generic" });
  if (previa) {
    if (estadoInvitacion(previa) === "pendiente") return fail({ errors: { email: "pendingInvite" } });
    const { error } = await supabase.from("invitaciones").delete().eq("id", previa.id);
    if (error) return fail({ message: dbErrorKey(error) });
  }

  const { error } = await supabase
    .from("invitaciones")
    .insert({ email, rol, caduca: caduca?.toISOString() ?? null, creada_por: user.id });
  if (error) {
    return error.code === "23505"
      ? fail({ errors: { email: "pendingInvite" } })
      : fail({ message: dbErrorKey(error) });
  }
  redirect(adminPath(lang, PATH, { ok: "creada" }));
}

// Revocar = borrar una invitación sin usar. Las usadas se conservan como historial.
export async function revocarInvitacion(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id");
  if (!isUuid(id)) redirect(adminPath(lang, PATH, { error: "notFound" }));
  const { data, error } = await supabase
    .from("invitaciones")
    .delete()
    .eq("id", id)
    .is("usada_en", null)
    .select("id");
  if (error) redirect(adminPath(lang, PATH, { error: dbErrorKey(error) }));
  if (data.length === 0) redirect(adminPath(lang, PATH, { error: "notFound" }));
  redirect(adminPath(lang, PATH, { ok: "revocada" }));
}
