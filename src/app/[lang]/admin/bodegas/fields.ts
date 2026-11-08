import type { FieldDef, Option } from "@/components/admin/entity-form";
import { enumOptions } from "@/components/admin/labels";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { ESTADOS_BODEGA } from "@/lib/admin/validation";
import type { Database } from "@/lib/supabase/database.types";

type Row = Database["public"]["Tables"]["bodegas"]["Row"];

function red(redes: unknown, key: string): string | null {
  if (!redes || typeof redes !== "object" || Array.isArray(redes)) return null;
  const v = (redes as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

export function bodegaFields(
  { admin }: Dictionary,
  denominaciones: Option[],
  row?: Row,
  actuales: { denominacion_id: string; principal: boolean }[] = [],
): FieldDef[] {
  const f = admin.fields;
  const num = (n: number | null | undefined) => (n == null ? null : String(n));
  return [
    { kind: "heading", name: "_datos", label: admin.groups.datos },
    { kind: "text", name: "nombre", label: f.nombre, required: true, maxLength: 200, defaultValue: row?.nombre },
    { kind: "text", name: "slug", label: f.slug, hint: admin.common.slugHint, defaultValue: row?.slug },
    {
      kind: "select",
      name: "estado",
      label: f.estado,
      required: true,
      options: enumOptions(ESTADOS_BODEGA, admin.enums.estadoBodega),
      defaultValue: row?.estado ?? "activa",
    },
    { kind: "number", name: "anio_fundacion", label: f.anio_fundacion, defaultValue: num(row?.anio_fundacion) },
    { kind: "number", name: "hectareas", label: f.hectareas, defaultValue: num(row?.hectareas) },
    { kind: "textarea", name: "descripcion", label: f.descripcion, maxLength: 5000, defaultValue: row?.descripcion },
    {
      kind: "multi",
      name: "denominaciones",
      label: f.denominaciones,
      options: denominaciones,
      defaultValue: actuales.map((d) => d.denominacion_id),
      principal: {
        name: "principal",
        label: f.principal,
        noneLabel: f.sinPrincipal,
        defaultValue: actuales.find((d) => d.principal)?.denominacion_id ?? "",
      },
    },
    { kind: "heading", name: "_ubicacion", label: admin.groups.ubicacion },
    { kind: "text", name: "direccion", label: f.direccion, wide: true, defaultValue: row?.direccion },
    { kind: "text", name: "codigo_postal", label: f.codigo_postal, maxLength: 10, defaultValue: row?.codigo_postal },
    { kind: "text", name: "municipio", label: f.municipio, defaultValue: row?.municipio },
    { kind: "text", name: "provincia", label: f.provincia, defaultValue: row?.provincia },
    { kind: "text", name: "comunidad", label: f.comunidad, defaultValue: row?.comunidad },
    { kind: "heading", name: "_contacto", label: admin.groups.contacto },
    { kind: "url", name: "web", label: f.web, defaultValue: row?.web },
    { kind: "email", name: "email", label: f.email, defaultValue: row?.email },
    { kind: "text", name: "telefono", label: f.telefono, maxLength: 40, defaultValue: row?.telefono },
    { kind: "url", name: "instagram", label: f.instagram, defaultValue: red(row?.redes, "instagram") },
    { kind: "url", name: "facebook", label: f.facebook, defaultValue: red(row?.redes, "facebook") },
    { kind: "url", name: "x", label: f.x, defaultValue: red(row?.redes, "x") },
  ];
}
