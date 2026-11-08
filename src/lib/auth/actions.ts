"use server";

import type { AuthError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale, hasLocale, localePath, type Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { setPreferenceCookies } from "./cookies";
import type { FormState, MessageKey } from "./form-state";
import { HOME_PATH, safeNext } from "./routes";
import { getCurrentUser } from "./server";
import {
  validateEmailOnly,
  validateLogin,
  validateNewPassword,
  validateSignUp,
  type EmailField,
  type LoginField,
  type NewPasswordField,
  type SignUpField,
} from "./validation";

// next/root-params no está disponible en Server Actions: el idioma llega en un
// campo oculto y se valida aquí.
function formLocale(form: FormData): Locale {
  const value = form.get("lang");
  return typeof value === "string" && hasLocale(value) ? value : defaultLocale;
}

function formNext(form: FormData): string | null {
  const value = form.get("next");
  return typeof value === "string" ? value : null;
}

// Origen de la petición para los enlaces de los emails. Si alguien falsea la
// cabecera, Supabase solo acepta destinos de su lista de Redirect URLs.
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function confirmUrl(origin: string, next: string, email?: string) {
  const query = new URLSearchParams({ next });
  // En el alta, para rellenar el login si el enlace se abre en otro navegador.
  if (email) query.set("email", email);
  return `${origin}/auth/confirm?${query}`;
}

function isRateLimit(error: AuthError) {
  return error.status === 429 || (error.code?.startsWith("over_") ?? false);
}

// --- Login -------------------------------------------------------------------

export async function signIn(_prev: FormState, form: FormData): Promise<FormState<LoginField>> {
  const lang = formLocale(form);
  const parsed = validateLogin(form);
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.ok) return { status: "error", errors: parsed.errors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Un único mensaje para email inexistente o contraseña errónea.
    const message: MessageKey = isRateLimit(error)
      ? "rateLimited"
      : error.code === "email_not_confirmed"
        ? "emailNotConfirmed"
        : error.code === "invalid_credentials" || error.status === 400
          ? "invalidCredentials"
          : "generic";
    return { status: "error", message, values };
  }

  // Sincroniza idioma y tema guardados en el perfil con las cookies del navegador.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("idioma, tema")
    .eq("id", data.user.id)
    .maybeSingle();
  if (perfil) await setPreferenceCookies(perfil.idioma, perfil.tema);

  refresh();
  redirect(safeNext(formNext(form), localePath(lang, HOME_PATH)));
}

// --- Registro ----------------------------------------------------------------

function signUpErrorMessage(error: AuthError): MessageKey {
  if (isRateLimit(error)) return "rateLimited";
  // Con el hook "Before User Created" llega un 403 con invitation_required; sin él,
  // el trigger de la BD aborta el alta y GoTrue responde un 500 genérico.
  if (
    error.status === 403 ||
    error.message.includes("invitation_required") ||
    error.message.includes("Database error saving new user")
  ) {
    return "noInvitation";
  }
  return "generic";
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState<SignUpField>> {
  const lang = formLocale(form);
  const parsed = validateSignUp(form);
  const values = {
    email: String(form.get("email") ?? ""),
    nombre: String(form.get("nombre") ?? ""),
  };
  if (!parsed.ok) return { status: "error", errors: parsed.errors, values };

  const { email, password, nombre } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Los lee handle_new_user() al crear el perfil.
      data: { nombre, mayor_de_edad_confirmado: true, idioma: lang },
      emailRedirectTo: confirmUrl(await requestOrigin(), localePath(lang, HOME_PATH), email),
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { status: "error", message: "weakPassword", values };
    }
    // Si el email ya tiene cuenta, se responde como si todo hubiera ido bien.
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { status: "success" };
    }
    return { status: "error", message: signUpErrorMessage(error), values };
  }

  // Si la confirmación de email estuviera desactivada, ya hay sesión.
  if (data.session) {
    refresh();
    redirect(localePath(lang, HOME_PATH));
  }
  // Email ya registrado: Supabase devuelve un usuario sin identidades y no
  // envía nada. Misma respuesta para no desvelar que la cuenta existe.
  return { status: "success" };
}

// --- Recuperar contraseña ----------------------------------------------------

export async function requestPasswordReset(
  _prev: FormState,
  form: FormData,
): Promise<FormState<EmailField>> {
  const lang = formLocale(form);
  const parsed = validateEmailOnly(form);
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.ok) return { status: "error", errors: parsed.errors, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: confirmUrl(await requestOrigin(), localePath(lang, "/restablecer")),
  });
  if (error && isRateLimit(error)) return { status: "error", message: "rateLimited", values };
  // Exista o no la cuenta (o falle el envío), la respuesta es la misma.
  return { status: "success" };
}

// --- Restablecer contraseña --------------------------------------------------

export async function updatePassword(
  _prev: FormState,
  form: FormData,
): Promise<FormState<NewPasswordField>> {
  const lang = formLocale(form);
  // La sesión la crea /auth/confirm al abrir el enlace del email.
  if (!(await getCurrentUser())) redirect(localePath(lang, "/recuperar"));

  const parsed = validateNewPassword(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const message: MessageKey = isRateLimit(error)
      ? "rateLimited"
      : error.code === "same_password"
        ? "samePassword"
        : error.code === "weak_password"
          ? "weakPassword"
          : "generic";
    return { status: "error", message };
  }

  refresh();
  redirect(localePath(lang, HOME_PATH));
}

// --- Salir -------------------------------------------------------------------

export async function signOut(form: FormData) {
  const lang = formLocale(form);
  const supabase = await createClient();
  await supabase.auth.signOut();
  refresh();
  redirect(localePath(lang));
}
