"use server";

import { redirect } from "next/navigation";
import { comprobarUrl, vistaEnlaces } from "@/lib/admin/enlaces";
import { adminAction, adminPath, catalogChanged } from "@/lib/admin/server";
import { isUuid, text } from "@/lib/admin/validation";

const PATH = "/enlaces";

// Acciones sobre una fila de comprobaciones_enlace. Cliente de sesión: la RLS
// de admin protege la tabla y las funciones son security invoker.

function volver(form: FormData) {
  const vista = vistaEnlaces(text(form, "vista"));
  const pagina = text(form, "pagina");
  return (params: Record<string, string>) => ({
    vista,
    ...(/^\d+$/.test(pagina) && pagina !== "1" ? { pagina } : {}),
    ...params,
  });
}

const MODOS = { ocultar: "oculto", mostrar: "auto", ignorar: "ignorado", restaurar: "auto" } as const;
type Accion = keyof typeof MODOS | "reintentar";

export async function accionEnlace(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const params = volver(form);
  const fail = (error: string) => redirect(adminPath(lang, PATH, params({ error })));

  const id = text(form, "id");
  const accion = text(form, "accion") as Accion;
  if (!isUuid(id) || !(accion === "reintentar" || accion in MODOS)) fail("notFound");

  if (accion === "reintentar") {
    const { data: fila } = await supabase.from("comprobaciones_enlace").select("url").eq("id", id).maybeSingle();
    if (!fila) fail("notFound");
    const r = await comprobarUrl(fila!.url);
    const { error } = await supabase.rpc("registrar_comprobacion_enlace", {
      p_id: id,
      p_resultado: r.resultado,
      p_http: r.http ?? undefined,
      p_error: r.error ?? undefined,
      p_url_final: r.urlFinal ?? undefined,
      p_metodo: r.metodo,
    });
    if (error) fail("generic");
    catalogChanged();
    redirect(adminPath(lang, PATH, params({ ok: "reintentado" })));
  }

  const modo = MODOS[accion as keyof typeof MODOS];
  // Mostrar = el admin da el enlace por bueno: se borra el recuento de fallos.
  const cambios = accion === "mostrar" ? { modo, fallos_consecutivos: 0 } : { modo };
  const { data, error } = await supabase.from("comprobaciones_enlace").update(cambios).eq("id", id).select("id");
  if (error) fail("generic");
  if (!data?.length) fail("notFound");
  catalogChanged();
  redirect(adminPath(lang, PATH, params({ ok: "actualizado" })));
}

export async function editarUrlEnlace(form: FormData): Promise<void> {
  const { lang, supabase } = await adminAction(form, `/admin${PATH}`);
  const params = volver(form);
  const fail = (error: string) => redirect(adminPath(lang, PATH, params({ error })));

  const id = text(form, "id");
  const url = text(form, "url");
  if (!isUuid(id)) fail("notFound");
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) fail("invalidUrl");

  const { error } = await supabase.rpc("admin_editar_url_enlace", { p_id: id, p_url: url });
  if (error) {
    fail(
      error.message.includes("url_invalida")
        ? "invalidUrl"
        : error.message.includes("no_encontrado")
          ? "notFound"
          : error.code === "23514"
            ? "invalidUrl"
            : "generic",
    );
  }
  catalogChanged();
  redirect(adminPath(lang, PATH, params({ ok: "url" })));
}
