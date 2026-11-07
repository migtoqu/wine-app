// Validación en servidor de los formularios de auth y ajustes. Módulo puro (sin
// Supabase ni Next) para poder testearlo. Los errores son claves que el cliente
// traduce con dict.auth.errors.

import { Constants, type Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type TipoVino = Enums["tipo_vino"];
export type CrianzaVino = Enums["crianza_vino"];
export type Idioma = Enums["idioma"];
export type Tema = Enums["tema"];

export const TIPOS_VINO = Constants.public.Enums.tipo_vino;
export const CRIANZAS_VINO = Constants.public.Enums.crianza_vino;
export const IDIOMAS = Constants.public.Enums.idioma;
export const TEMAS = Constants.public.Enums.tema;

// Preferencias de email guardadas en perfiles.prefs_email.
export const PREFS_EMAIL = ["novedades", "actividad"] as const;
export type PrefsEmail = Record<(typeof PREFS_EMAIL)[number], boolean>;

export const PASSWORD_MIN = 8;
// bcrypt (Supabase Auth) solo usa los primeros 72 bytes.
export const PASSWORD_MAX_BYTES = 72;
export const NOMBRE_MAX = 80;
export const PRECIO_MAX = 100_000;

export type ErrorKey =
  | "required"
  | "emailInvalid"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "ageRequired"
  | "tooLong"
  | "invalidOption"
  | "priceInvalid"
  | "priceRange";

export type FieldErrors<F extends string> = Partial<Record<F, ErrorKey>>;
export type Result<T, F extends string> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors<F> };

// Lo mínimo de FormData que usamos (los tests pasan un FormData real).
type Form = Pick<FormData, "get" | "getAll">;

function text(form: Form, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function checked(form: Form, name: string): boolean {
  const value = form.get(name);
  return value === "on" || value === "true" || value === "1";
}

// Formato práctico (no RFC completo): algo@algo.tld, sin espacios.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function emailError(email: string): ErrorKey | undefined {
  if (!email) return "required";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "emailInvalid";
}

function passwordError(password: string): ErrorKey | undefined {
  if (!password) return "required";
  if (password.length < PASSWORD_MIN) return "passwordTooShort";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "passwordTooLong";
}

function result<T, F extends string>(data: T, errors: FieldErrors<F>): Result<T, F> {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

// --- Auth ------------------------------------------------------------------

export type LoginField = "email" | "password";

export function validateLogin(form: Form): Result<{ email: string; password: string }, LoginField> {
  const email = normalizeEmail(text(form, "email"));
  // En login no se aplican las reglas de longitud: solo se comprueba que haya algo.
  const password = text(form, "password");
  const errors: FieldErrors<LoginField> = {};
  const e = emailError(email);
  if (e) errors.email = e;
  if (!password) errors.password = "required";
  return result({ email, password }, errors);
}

export type SignUpField = "email" | "password" | "passwordConfirm" | "nombre" | "mayorDeEdad";

export function validateSignUp(
  form: Form,
): Result<{ email: string; password: string; nombre: string | null }, SignUpField> {
  const email = normalizeEmail(text(form, "email"));
  const password = text(form, "password");
  const confirm = text(form, "passwordConfirm");
  const nombre = text(form, "nombre").trim();
  const errors: FieldErrors<SignUpField> = {};

  const e = emailError(email);
  if (e) errors.email = e;
  const p = passwordError(password);
  if (p) errors.password = p;
  else if (confirm !== password) errors.passwordConfirm = "passwordMismatch";
  if (nombre.length > NOMBRE_MAX) errors.nombre = "tooLong";
  if (!checked(form, "mayorDeEdad")) errors.mayorDeEdad = "ageRequired";

  return result({ email, password, nombre: nombre || null }, errors);
}

export type EmailField = "email";

export function validateEmailOnly(form: Form): Result<{ email: string }, EmailField> {
  const email = normalizeEmail(text(form, "email"));
  const e = emailError(email);
  return result({ email }, e ? { email: e } : {});
}

export type NewPasswordField = "password" | "passwordConfirm";

export function validateNewPassword(form: Form): Result<{ password: string }, NewPasswordField> {
  const password = text(form, "password");
  const errors: FieldErrors<NewPasswordField> = {};
  const p = passwordError(password);
  if (p) errors.password = p;
  else if (text(form, "passwordConfirm") !== password) errors.passwordConfirm = "passwordMismatch";
  return result({ password }, errors);
}

// --- Ajustes ---------------------------------------------------------------

export type ProfileField = "nombre" | "idioma" | "tema";

export type ProfileInput = {
  nombre: string | null;
  idioma: Idioma;
  tema: Tema;
  prefs_email: PrefsEmail;
};

function oneOf<T extends string>(options: readonly T[], value: string): value is T {
  return (options as readonly string[]).includes(value);
}

export function validateProfile(form: Form): Result<ProfileInput, ProfileField> {
  const nombre = text(form, "nombre").trim();
  const idioma = text(form, "idioma");
  const tema = text(form, "tema");
  const errors: FieldErrors<ProfileField> = {};

  if (nombre.length > NOMBRE_MAX) errors.nombre = "tooLong";
  if (!oneOf(IDIOMAS, idioma)) errors.idioma = "invalidOption";
  if (!oneOf(TEMAS, tema)) errors.tema = "invalidOption";

  const prefs_email = Object.fromEntries(
    PREFS_EMAIL.map((key) => [key, checked(form, `email_${key}`)]),
  ) as PrefsEmail;

  return result(
    { nombre: nombre || null, idioma: idioma as Idioma, tema: tema as Tema, prefs_email },
    errors,
  );
}

export type WinePrefsField = "tipos" | "crianzas" | "variedades" | "denominaciones" | "precioMin" | "precioMax";

export type WinePrefsInput = {
  tipos: TipoVino[];
  crianzas: CrianzaVino[];
  variedad_uva_ids: string[];
  denominacion_ids: string[];
  precio_min: number | null;
  precio_max: number | null;
};

function strings(form: Form, name: string): string[] {
  return [...new Set(form.getAll(name).filter((v): v is string => typeof v === "string"))];
}

// Acepta "12", "12.5" y "12,50"; vacío → null; inválido → undefined.
export function parsePrice(raw: string): number | null | undefined {
  const value = raw.trim().replace(",", ".");
  if (!value) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) return undefined;
  const n = Number(value);
  return n <= PRECIO_MAX ? n : undefined;
}

export function validateWinePrefs(form: Form): Result<WinePrefsInput, WinePrefsField> {
  const tipos = strings(form, "tipos");
  const crianzas = strings(form, "crianzas");
  const variedades = strings(form, "variedades");
  const denominaciones = strings(form, "denominaciones");
  const precioMin = parsePrice(text(form, "precioMin"));
  const precioMax = parsePrice(text(form, "precioMax"));
  const errors: FieldErrors<WinePrefsField> = {};

  if (!tipos.every((t) => oneOf(TIPOS_VINO, t))) errors.tipos = "invalidOption";
  if (!crianzas.every((c) => oneOf(CRIANZAS_VINO, c))) errors.crianzas = "invalidOption";
  if (!variedades.every((id) => UUID_RE.test(id))) errors.variedades = "invalidOption";
  if (!denominaciones.every((id) => UUID_RE.test(id))) errors.denominaciones = "invalidOption";
  if (precioMin === undefined) errors.precioMin = "priceInvalid";
  if (precioMax === undefined) errors.precioMax = "priceInvalid";
  if (precioMin != null && precioMax != null && precioMin > precioMax) errors.precioMax = "priceRange";

  return result(
    {
      tipos: tipos as TipoVino[],
      crianzas: crianzas as CrianzaVino[],
      variedad_uva_ids: variedades,
      denominacion_ids: denominaciones,
      precio_min: precioMin ?? null,
      precio_max: precioMax ?? null,
    },
    errors,
  );
}

// Tema de la BD ↔ valor de la cookie `theme`.
export const TEMA_A_COOKIE = { claro: "light", oscuro: "dark", sistema: "system" } as const satisfies Record<
  Tema,
  string
>;
