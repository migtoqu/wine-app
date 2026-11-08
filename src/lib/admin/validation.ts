// Validación en servidor de los formularios del panel de admin. Módulo puro (sin
// Supabase ni Next) para poder testearlo. Los errores son claves que el cliente
// traduce con dict.admin.errors.

import { Constants } from "@/lib/supabase/database.types";

const Enums = Constants.public.Enums;
export const TIPOS_VINO = Enums.tipo_vino;
export const CRIANZAS_VINO = Enums.crianza_vino;
export const TIPOS_DENOMINACION = Enums.tipo_denominacion;
export const COLORES_UVA = Enums.color_uva;
export const ESTADOS_BODEGA = Enums.estado_bodega;
export const ROLES = Enums.rol_usuario;

// Redes que se editan en el formulario de bodega; el resto de claves de
// bodegas.redes se conservan tal cual.
export const REDES = ["instagram", "facebook", "x"] as const;

// Filas de uvas de una añada que admite el formulario.
export const MAX_FILAS_UVAS = 20;
export const CADUCIDAD_DIAS_POR_DEFECTO = 14;

export type AdminErrorKey =
  | "required"
  | "tooLong"
  | "invalidUrl"
  | "invalidEmail"
  | "invalidNumber"
  | "outOfRange"
  | "invalidOption"
  | "invalidSlug"
  | "slugTaken"
  | "tempRange"
  | "grapesOver100"
  | "grapesDuplicate"
  | "grapeMissing"
  | "principalNotSelected"
  | "vintageTaken"
  | "confirmRequired"
  | "inUse"
  | "pendingInvite"
  | "lastAdmin"
  | "notFound"
  | "sameEntity"
  | "checkFields"
  | "generic";

export type FieldErrors = Record<string, AdminErrorKey>;
export type Result<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

// Lo mínimo de FormData que usamos (los tests pasan un FormData real).
export type Form = Pick<FormData, "get" | "getAll" | "entries">;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function text(form: Pick<FormData, "get">, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Valores enviados, para volver a rellenar el formulario tras un error.
export function formValues(form: Form): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string" || key.startsWith("$")) continue;
    const prev = out[key];
    out[key] = prev === undefined ? value : [...(Array.isArray(prev) ? prev : [prev]), value];
  }
  return out;
}

// --- Campos ---------------------------------------------------------------

type Spec =
  | { kind: "text"; required?: boolean; max?: number }
  | { kind: "url"; required?: boolean }
  | { kind: "email"; required?: boolean }
  | { kind: "slug"; required?: boolean }
  | { kind: "int" | "decimal"; min: number; max: number; required?: boolean }
  | { kind: "enum"; values: readonly string[]; required?: boolean }
  | { kind: "uuid"; required?: boolean };

type Value<S> = S extends { kind: "int" | "decimal" }
  ? number
  : S extends { kind: "enum"; values: readonly (infer V)[] }
    ? V
    : string;
type Out<S> = S extends { required: true } ? Value<S> : Value<S> | null;
export type Parsed<T extends Record<string, Spec>> = { -readonly [K in keyof T]: Out<T[K]> };

function parseNumber(raw: string, kind: "int" | "decimal"): number | null {
  const normalized = raw.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || (kind === "int" && !Number.isInteger(n))) return null;
  return n;
}

function parseOne(spec: Spec, raw: string): { value: unknown } | { error: AdminErrorKey } {
  if (raw === "") return spec.required ? { error: "required" } : { value: null };
  switch (spec.kind) {
    case "text":
      return raw.length > (spec.max ?? 200) ? { error: "tooLong" } : { value: raw };
    case "url": {
      if (raw.length > 500 || !/^https?:\/\/\S+$/i.test(raw)) return { error: "invalidUrl" };
      try {
        new URL(raw);
      } catch {
        return { error: "invalidUrl" };
      }
      return { value: raw };
    }
    case "email":
      return raw.length > 254 || !EMAIL_RE.test(raw) ? { error: "invalidEmail" } : { value: raw };
    case "slug": {
      const slug = raw.toLowerCase();
      return slug.length > 120 || !SLUG_RE.test(slug) ? { error: "invalidSlug" } : { value: slug };
    }
    case "int":
    case "decimal": {
      const n = parseNumber(raw, spec.kind);
      if (n === null) return { error: "invalidNumber" };
      return n < spec.min || n > spec.max ? { error: "outOfRange" } : { value: n };
    }
    case "enum":
      return spec.values.includes(raw) ? { value: raw } : { error: "invalidOption" };
    case "uuid":
      return UUID_RE.test(raw) ? { value: raw.toLowerCase() } : { error: "invalidOption" };
  }
}

export function parseFields<T extends Record<string, Spec>>(
  form: Pick<FormData, "get">,
  specs: T,
): Result<Parsed<T>> {
  const data: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const [name, spec] of Object.entries(specs)) {
    const r = parseOne(spec, text(form, name));
    if ("error" in r) errors[name] = r.error;
    else data[name] = r.value;
  }
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, data: data as Parsed<T> };
}

// Une el resultado de parseFields con errores de reglas entre campos.
function merge<T, E>(base: Result<T>, extraErrors: FieldErrors, extra: E): Result<T & E> {
  const errors = { ...(base.ok ? {} : base.errors), ...extraErrors };
  if (!base.ok || Object.keys(extraErrors).length > 0) return { ok: false, errors };
  return { ok: true, data: { ...base.data, ...extra } };
}

/** Slug libre: base, base-2, base-3… */
export function nextFreeSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

/** Sinónimos separados por comas o saltos de línea, sin vacíos ni repetidos. */
export function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
}

// --- Entidades ---------------------------------------------------------------

const DESCRIPCION = { kind: "text", max: 5000 } as const;

export const BODEGA_CAMPOS = {
  nombre: { kind: "text", required: true, max: 200 },
  slug: { kind: "slug" },
  descripcion: DESCRIPCION,
  direccion: { kind: "text", max: 300 },
  codigo_postal: { kind: "text", max: 10 },
  municipio: { kind: "text", max: 120 },
  provincia: { kind: "text", max: 120 },
  comunidad: { kind: "text", max: 120 },
  web: { kind: "url" },
  telefono: { kind: "text", max: 40 },
  email: { kind: "email" },
  instagram: { kind: "url" },
  facebook: { kind: "url" },
  x: { kind: "url" },
  anio_fundacion: { kind: "int", min: 800, max: 2100 },
  hectareas: { kind: "decimal", min: 0, max: 100000 },
  estado: { kind: "enum", values: ESTADOS_BODEGA, required: true },
} as const;

export type BodegaInput = Parsed<typeof BODEGA_CAMPOS> & {
  denominaciones: string[];
  principal: string | null;
};

export function validateBodega(form: Form): Result<BodegaInput> {
  const base = parseFields(form, BODEGA_CAMPOS);
  const errors: FieldErrors = {};
  const denominaciones = [...new Set(form.getAll("denominaciones").filter(isUuid))];
  const principalRaw = text(form, "principal");
  const principal = principalRaw === "" ? null : principalRaw;
  if (principal !== null && !denominaciones.includes(principal)) {
    errors.denominaciones = "principalNotSelected";
  }
  return merge(base, errors, { denominaciones, principal });
}

export const VINO_CAMPOS = {
  nombre: { kind: "text", required: true, max: 200 },
  slug: { kind: "slug" },
  bodega_id: { kind: "uuid", required: true },
  tipo: { kind: "enum", values: TIPOS_VINO, required: true },
  crianza: { kind: "enum", values: CRIANZAS_VINO },
  denominacion_id: { kind: "uuid" },
  descripcion: DESCRIPCION,
} as const;

export type VinoInput = Parsed<typeof VINO_CAMPOS>;

export function validateVino(form: Form): Result<VinoInput> {
  return parseFields(form, VINO_CAMPOS);
}

export const ANADA_CAMPOS = {
  anio: { kind: "int", min: 1800, max: 2100 },
  grado: { kind: "decimal", min: 0, max: 25 },
  meses_crianza: { kind: "int", min: 0, max: 600 },
  notas_cata: DESCRIPCION,
  maridaje: { kind: "text", max: 2000 },
  temp_servicio_min: { kind: "decimal", min: 0, max: 30 },
  temp_servicio_max: { kind: "decimal", min: 0, max: 30 },
  produccion_botellas: { kind: "int", min: 1, max: 100_000_000 },
} as const;

export type Uva = { variedad_id: string; porcentaje: number | null };
export type AnadaInput = Parsed<typeof ANADA_CAMPOS> & { uvas: Uva[] };

/** Filas uva_N / pct_N del formulario. Las vacías se ignoran. */
export function parseUvas(form: Pick<FormData, "get">): Result<Uva[]> {
  const uvas: Uva[] = [];
  let error: AdminErrorKey | null = null;
  for (let i = 0; i < MAX_FILAS_UVAS; i++) {
    const id = text(form, `uva_${i}`);
    const pctRaw = text(form, `pct_${i}`);
    if (id === "" && pctRaw === "") continue;
    if (!isUuid(id)) {
      error ??= "grapeMissing";
      continue;
    }
    let porcentaje: number | null = null;
    if (pctRaw !== "") {
      porcentaje = parseNumber(pctRaw, "decimal");
      if (porcentaje === null) {
        error ??= "invalidNumber";
        continue;
      }
      if (porcentaje <= 0 || porcentaje > 100) {
        error ??= "outOfRange";
        continue;
      }
    }
    if (uvas.some((u) => u.variedad_id === id.toLowerCase())) error ??= "grapesDuplicate";
    uvas.push({ variedad_id: id.toLowerCase(), porcentaje });
  }
  if (!error && uvas.reduce((sum, u) => sum + (u.porcentaje ?? 0), 0) > 100) error = "grapesOver100";
  return error ? { ok: false, errors: { uvas: error } } : { ok: true, data: uvas };
}

export function validateAnada(form: Form): Result<AnadaInput> {
  const base = parseFields(form, ANADA_CAMPOS);
  const uvas = parseUvas(form);
  const errors: FieldErrors = uvas.ok ? {} : { ...uvas.errors };
  if (
    base.ok &&
    base.data.temp_servicio_min !== null &&
    base.data.temp_servicio_max !== null &&
    base.data.temp_servicio_min > base.data.temp_servicio_max
  ) {
    errors.temp_servicio_max = "tempRange";
  }
  return merge(base, errors, { uvas: uvas.ok ? uvas.data : [] });
}

export const DENOMINACION_CAMPOS = {
  nombre: { kind: "text", required: true, max: 200 },
  slug: { kind: "slug" },
  tipo: { kind: "enum", values: TIPOS_DENOMINACION, required: true },
  comunidad: { kind: "text", max: 120 },
  web: { kind: "url" },
  descripcion: DESCRIPCION,
} as const;

export type DenominacionInput = Parsed<typeof DENOMINACION_CAMPOS>;

export function validateDenominacion(form: Form): Result<DenominacionInput> {
  return parseFields(form, DENOMINACION_CAMPOS);
}

export const UVA_CAMPOS = {
  nombre: { kind: "text", required: true, max: 120 },
  slug: { kind: "slug" },
  sinonimos: { kind: "text", max: 1000 },
  color: { kind: "enum", values: COLORES_UVA },
} as const;

export type UvaInput = Omit<Parsed<typeof UVA_CAMPOS>, "sinonimos"> & { sinonimos: string[] };

export function validateUva(form: Form): Result<UvaInput> {
  const base = parseFields(form, UVA_CAMPOS);
  if (!base.ok) return base;
  return { ok: true, data: { ...base.data, sinonimos: splitList(base.data.sinonimos) } };
}

export const INVITACION_CAMPOS = {
  email: { kind: "email", required: true },
  rol: { kind: "enum", values: ROLES, required: true },
  // 0 = sin caducidad.
  caduca_dias: { kind: "int", min: 0, max: 365, required: true },
} as const;

export type InvitacionInput = { email: string; rol: (typeof ROLES)[number]; caduca: Date | null };

export function validateInvitacion(form: Form, now = new Date()): Result<InvitacionInput> {
  const base = parseFields(form, INVITACION_CAMPOS);
  if (!base.ok) return base;
  const { email, rol, caduca_dias } = base.data;
  return {
    ok: true,
    data: {
      email: email.toLowerCase(),
      rol,
      caduca: caduca_dias === 0 ? null : new Date(now.getTime() + caduca_dias * 86_400_000),
    },
  };
}

// --- Invitaciones ---------------------------------------------------------

export type EstadoInvitacion = "pendiente" | "usada" | "caducada";

export function estadoInvitacion(
  inv: { usada_en: string | null; caduca: string | null },
  now = new Date(),
): EstadoInvitacion {
  if (inv.usada_en) return "usada";
  if (inv.caduca && new Date(inv.caduca) <= now) return "caducada";
  return "pendiente";
}
