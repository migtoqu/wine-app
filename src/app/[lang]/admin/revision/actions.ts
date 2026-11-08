"use server";

import { redirect } from "next/navigation";
import { adminAction, adminPath, catalogChanged, confirmed, dbErrorKey, type Supabase } from "@/lib/admin/server";
import { isUuid, SLUG_RE, text } from "@/lib/admin/validation";

const PATH = "/revision";

type Tipo = "bodega" | "vino";
const esTipo = (v: string): v is Tipo => v === "bodega" || v === "vino";

/** id de una bodega o un vino a partir de un uuid o un slug del formulario. */
async function resolver(supabase: Supabase, tipo: Tipo, id: string, slug: string): Promise<string | null> {
  const tabla = tipo === "bodega" ? "bodegas" : "vinos";
  if (isUuid(id)) {
    const { data } = await supabase.from(tabla).select("id").eq("id", id).maybeSingle();
    return data?.id ?? null;
  }
  if (!SLUG_RE.test(slug)) return null;
  const { data } = await supabase.from(tabla).select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

/**
 * Resuelve un registro de la cola: asociar (a una bodega o un vino), crear o descartar.
 * Queda en registros_fuente.decision y la aplica el scraper en su siguiente ejecución. Asociar
 * una ficha de bodega a una bodega se aplica ya (el scraper reutiliza el vínculo).
 */
export async function decidirRegistro(form: FormData): Promise<void> {
  const { lang, user, supabase } = await adminAction(form, `/admin${PATH}`);
  const fail = (error: string) => redirect(adminPath(lang, PATH, { error }));

  const registroId = text(form, "registro");
  const decision = text(form, "decision");
  const tipo = text(form, "tipo");
  const fichaBodega = text(form, "ficha") === "bodega";
  if (!isUuid(registroId) || !["asociar", "crear", "descartar"].includes(decision)) fail("notFound");

  let destino: string | null = null;
  if (decision === "asociar" || (decision === "crear" && !fichaBodega)) {
    if (!esTipo(tipo)) fail("invalidOption");
    destino = await resolver(supabase, tipo as Tipo, text(form, "destino"), text(form, "slug"));
    if (!destino) fail("notFound");
  }

  const vincularYa = decision === "asociar" && fichaBodega && tipo === "bodega";
  const { data, error } = await supabase
    .from("registros_fuente")
    .update({
      decision,
      decision_tipo: destino ? (tipo as Tipo) : null,
      decision_id: destino,
      decidido_por: user.id,
      decidido_en: new Date().toISOString(),
      estado_emparejamiento: decision === "descartar" ? "descartado" : vincularYa ? "emparejado" : "pendiente",
      ...(vincularYa ? { entidad_tipo: "bodega" as const, entidad_id: destino } : {}),
    })
    .eq("id", registroId)
    .select("id");
  if (error) fail(dbErrorKey(error));
  if (!data?.length) fail("notFound");
  redirect(adminPath(lang, PATH, { ok: "decidido" }));
}

/**
 * Fusiona dos bodegas o dos vinos (admin_fusionar) y, si viene de un registro de la cola, lo
 * asocia al superviviente.
 */
export async function fusionar(form: FormData): Promise<void> {
  const { lang, user, supabase } = await adminAction(form, `/admin${PATH}`);
  const fail = (error: string) => redirect(adminPath(lang, PATH, { error }));

  const tipo = text(form, "tipo");
  if (!esTipo(tipo)) fail("invalidOption");
  if (!confirmed(form)) fail("confirmRequired");
  const origen = await resolver(supabase, tipo as Tipo, text(form, "origen"), text(form, "origen_slug"));
  const destino = await resolver(supabase, tipo as Tipo, text(form, "destino"), text(form, "destino_slug"));
  if (!origen || !destino) fail("notFound");
  if (origen === destino) fail("sameEntity");

  const { error } = await supabase.rpc("admin_fusionar", { p_tipo: tipo, p_origen: origen!, p_destino: destino! });
  if (error) fail(error.message.includes("misma_entidad") ? "sameEntity" : dbErrorKey(error));

  const registroId = text(form, "registro");
  if (isUuid(registroId)) {
    await supabase
      .from("registros_fuente")
      .update({
        decision: "asociar",
        decision_tipo: tipo as Tipo,
        decision_id: destino,
        decidido_por: user.id,
        decidido_en: new Date().toISOString(),
        estado_emparejamiento: "pendiente",
      })
      .eq("id", registroId);
  }
  catalogChanged();
  redirect(adminPath(lang, PATH, { ok: "fusionado" }));
}
