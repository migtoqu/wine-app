import type { FieldDef } from "@/components/admin/entity-form";
import { enumOptions } from "@/components/admin/labels";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { TIPOS_DENOMINACION } from "@/lib/admin/validation";
import type { Database } from "@/lib/supabase/database.types";

type Row = Database["public"]["Tables"]["denominaciones"]["Row"];

export function denominacionFields({ admin }: Dictionary, row?: Row): FieldDef[] {
  const f = admin.fields;
  return [
    { kind: "text", name: "nombre", label: f.nombre, required: true, maxLength: 200, defaultValue: row?.nombre },
    { kind: "text", name: "slug", label: f.slug, hint: admin.common.slugHint, defaultValue: row?.slug },
    {
      kind: "select",
      name: "tipo",
      label: f.tipo,
      required: true,
      options: enumOptions(TIPOS_DENOMINACION, admin.enums.tipoDenominacion),
      defaultValue: row?.tipo ?? "do",
    },
    { kind: "text", name: "comunidad", label: f.comunidad, defaultValue: row?.comunidad },
    { kind: "url", name: "web", label: f.web, wide: true, defaultValue: row?.web },
    { kind: "textarea", name: "descripcion", label: f.descripcion, maxLength: 5000, defaultValue: row?.descripcion },
  ];
}
