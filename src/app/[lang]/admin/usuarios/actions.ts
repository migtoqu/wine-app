"use server";

import { redirect } from "next/navigation";
import { adminAction, adminPath, dbErrorKey } from "@/lib/admin/server";
import { isUuid, ROLES, text } from "@/lib/admin/validation";

const PATH = "/usuarios";

// Cambio de rol. El trigger proteger_ultimo_admin impide dejar la app sin
// admins (también si es el propio admin quien se quita el rol).
export async function cambiarRol(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const id = text(form, "id");
  const rol = ROLES.find((r) => r === text(form, "rol"));
  if (!isUuid(id) || !rol) redirect(adminPath(lang, PATH, { error: "invalidOption" }));

  const { data, error } = await supabase.from("perfiles").update({ rol }).eq("id", id).select("id");
  if (error) redirect(adminPath(lang, PATH, { error: dbErrorKey(error) }));
  if (data.length === 0) redirect(adminPath(lang, PATH, { error: "notFound" }));
  redirect(adminPath(lang, PATH, { ok: "rol" }));
}
