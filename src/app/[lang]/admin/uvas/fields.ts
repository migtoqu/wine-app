import type { FieldDef } from "@/components/admin/entity-form";
import { enumOptions } from "@/components/admin/labels";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { COLORES_UVA } from "@/lib/admin/validation";
import type { Database } from "@/lib/supabase/database.types";

type Row = Database["public"]["Tables"]["variedades_uva"]["Row"];

export function uvaFields({ admin }: Dictionary, row?: Row): FieldDef[] {
  const f = admin.fields;
  return [
    { kind: "text", name: "nombre", label: f.nombre, required: true, maxLength: 120, defaultValue: row?.nombre },
    { kind: "text", name: "slug", label: f.slug, hint: admin.common.slugHint, defaultValue: row?.slug },
    {
      kind: "select",
      name: "color",
      label: f.color,
      options: enumOptions(COLORES_UVA, admin.enums.colorUva),
      emptyLabel: admin.common.noneOption,
      defaultValue: row?.color,
    },
    {
      kind: "text",
      name: "sinonimos",
      label: f.sinonimos,
      hint: admin.hints.sinonimos,
      wide: true,
      defaultValue: row?.sinonimos.join(", "),
    },
  ];
}
