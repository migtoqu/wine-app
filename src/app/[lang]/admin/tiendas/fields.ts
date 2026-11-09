import "server-only";
import type { FieldDef, Option } from "@/components/admin/entity-form";
import { enumOptions } from "@/components/admin/labels";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { Supabase } from "@/lib/admin/server";
import { SI_NO, TIPOS_TIENDA } from "@/lib/admin/validation";
import type { Database } from "@/lib/supabase/database.types";

type Row = Database["public"]["Tables"]["tiendas"]["Row"];
export type TiendaOptions = { bodegas: Option[]; fuentes: Option[] };

// Bodegas y fuentes para los desplegables (~500 + ~10 filas).
export async function tiendaOptions(supabase: Supabase): Promise<TiendaOptions> {
  const [bodegas, fuentes] = await Promise.all([
    supabase.from("bodegas").select("id, nombre").order("nombre").limit(5000),
    supabase.from("fuentes").select("id, nombre").order("nombre"),
  ]);
  if (bodegas.error || fuentes.error) throw new Error((bodegas.error ?? fuentes.error)!.message);
  return {
    bodegas: bodegas.data.map((b) => ({ value: b.id, label: b.nombre })),
    fuentes: fuentes.data.map((f) => ({ value: f.id, label: f.nombre })),
  };
}

export function tiendaFields({ admin }: Dictionary, opciones: TiendaOptions, row?: Row): FieldDef[] {
  const f = admin.fields;
  return [
    { kind: "text", name: "nombre", label: f.nombre, required: true, maxLength: 200, defaultValue: row?.nombre },
    { kind: "text", name: "slug", label: f.slug, hint: admin.common.slugHint, defaultValue: row?.slug },
    {
      kind: "select",
      name: "tipo",
      label: f.tipo,
      required: true,
      options: enumOptions(TIPOS_TIENDA, admin.enums.tipoTienda),
      defaultValue: row?.tipo ?? "online",
    },
    {
      kind: "select",
      name: "activa",
      label: f.activa,
      hint: admin.hints.activa,
      required: true,
      options: enumOptions(SI_NO, admin.enums.siNo),
      defaultValue: row ? (row.activa ? "si" : "no") : "si",
    },
    { kind: "url", name: "web", label: f.web, required: true, wide: true, defaultValue: row?.web },
    { kind: "url", name: "logo_url", label: f.logo_url, wide: true, defaultValue: row?.logo_url },
    { kind: "text", name: "info_envio", label: f.info_envio, maxLength: 300, defaultValue: row?.info_envio },
    {
      kind: "number",
      name: "envio_gratis_desde",
      label: f.envio_gratis_desde,
      defaultValue: row?.envio_gratis_desde == null ? null : String(row.envio_gratis_desde),
    },
    {
      kind: "select",
      name: "bodega_id",
      label: f.tiendaBodega,
      wide: true,
      options: opciones.bodegas,
      emptyLabel: admin.common.noneOption,
      defaultValue: row?.bodega_id,
    },
    {
      kind: "select",
      name: "fuente_id",
      label: f.fuente_id,
      hint: admin.hints.fuente_id,
      options: opciones.fuentes,
      emptyLabel: admin.common.noneOption,
      defaultValue: row?.fuente_id,
    },
    { kind: "text", name: "afiliacion_programa", label: f.afiliacion_programa, maxLength: 120, defaultValue: row?.afiliacion_programa },
    {
      kind: "text",
      name: "afiliacion_plantilla",
      label: f.afiliacion_plantilla,
      hint: admin.hints.afiliacion_plantilla,
      wide: true,
      maxLength: 500,
      defaultValue: row?.afiliacion_plantilla,
    },
  ];
}
