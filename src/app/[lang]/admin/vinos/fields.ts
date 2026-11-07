import type { FieldDef, Option } from "@/components/admin/entity-form";
import { enumOptions } from "@/components/admin/labels";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CRIANZAS_VINO, TIPOS_VINO } from "@/lib/admin/validation";
import type { Database } from "@/lib/supabase/database.types";

type Row = Database["public"]["Tables"]["vinos"]["Row"];

export function vinoFields(
  { admin, settings }: Dictionary,
  opciones: { bodegas: Option[]; denominaciones: Option[] },
  row?: Partial<Row>,
): FieldDef[] {
  const f = admin.fields;
  return [
    { kind: "text", name: "nombre", label: f.nombre, required: true, maxLength: 200, defaultValue: row?.nombre },
    { kind: "text", name: "slug", label: f.slug, hint: admin.common.slugHint, defaultValue: row?.slug },
    {
      kind: "select",
      name: "bodega_id",
      label: f.bodega_id,
      required: true,
      wide: true,
      options: opciones.bodegas,
      emptyLabel: "",
      defaultValue: row?.bodega_id,
    },
    {
      kind: "select",
      name: "tipo",
      label: f.tipo,
      required: true,
      options: enumOptions(TIPOS_VINO, settings.tiposVino),
      defaultValue: row?.tipo ?? "tinto",
    },
    {
      kind: "select",
      name: "crianza",
      label: f.crianza,
      options: enumOptions(CRIANZAS_VINO, settings.crianzasVino),
      emptyLabel: admin.common.noneOption,
      defaultValue: row?.crianza,
    },
    {
      kind: "select",
      name: "denominacion_id",
      label: f.denominacion_id,
      wide: true,
      options: opciones.denominaciones,
      emptyLabel: admin.common.noneOption,
      defaultValue: row?.denominacion_id,
    },
    { kind: "textarea", name: "descripcion", label: f.descripcion, maxLength: 5000, defaultValue: row?.descripcion },
  ];
}
