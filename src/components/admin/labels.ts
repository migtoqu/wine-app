import type { Dictionary } from "@/i18n/dictionaries/es";
import type { EntityFormLabels, Option } from "./entity-form";

// Textos serializables para <EntityForm> (sin funciones).
export function formLabels({ admin }: Dictionary): EntityFormLabels {
  return {
    save: admin.common.save,
    saving: admin.common.saving,
    saved: admin.common.saved,
    optional: admin.common.optional,
    errors: admin.errors,
  };
}

// Opciones de un enum con sus etiquetas traducidas.
export function enumOptions<V extends string>(values: readonly V[], labels: Record<V, string>): Option[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
