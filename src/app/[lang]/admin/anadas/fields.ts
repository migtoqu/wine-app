import type { FieldDef, Option } from "@/components/admin/entity-form";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { Database } from "@/lib/supabase/database.types";

// Sin campos calculados (enlaces_ocultos): select("*") no los trae.
type Row = Omit<Database["public"]["Tables"]["anadas"]["Row"], "enlaces_ocultos">;

export function anadaFields(
  { admin }: Dictionary,
  uvas: Option[],
  row?: Row,
  composicion: { variedad_id: string; porcentaje: number | null }[] = [],
): FieldDef[] {
  const f = admin.fields;
  const num = (n: number | null | undefined) => (n == null ? null : String(n));
  return [
    { kind: "number", name: "anio", label: f.anio, hint: admin.hints.anio, defaultValue: num(row?.anio) },
    { kind: "number", name: "grado", label: f.grado, defaultValue: num(row?.grado) },
    { kind: "number", name: "meses_crianza", label: f.meses_crianza, defaultValue: num(row?.meses_crianza) },
    { kind: "number", name: "produccion_botellas", label: f.produccion_botellas, defaultValue: num(row?.produccion_botellas) },
    { kind: "number", name: "temp_servicio_min", label: f.temp_servicio_min, defaultValue: num(row?.temp_servicio_min) },
    { kind: "number", name: "temp_servicio_max", label: f.temp_servicio_max, defaultValue: num(row?.temp_servicio_max) },
    {
      kind: "grapes",
      name: "uvas",
      label: f.uvas,
      hint: admin.hints.uvas,
      options: uvas,
      uvaLabel: f.uva,
      pctLabel: f.porcentaje,
      emptyLabel: "—",
      rows: composicion.map((c) => ({ variedad_id: c.variedad_id, porcentaje: num(c.porcentaje) ?? "" })),
    },
    { kind: "textarea", name: "notas_cata", label: f.notas_cata, maxLength: 5000, defaultValue: row?.notas_cata },
    { kind: "textarea", name: "maridaje", label: f.maridaje, maxLength: 2000, defaultValue: row?.maridaje },
  ];
}
