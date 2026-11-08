// Decisiones de /auth/confirm (enlaces de los emails de Supabase). Módulo puro
// para poder testearlo; el route handler solo hace el canje y redirige.

import { localePath, type Locale } from "@/i18n/config";
import { HOME_PATH, safeNext, stripLocale } from "./routes";

export type ConfirmParams = {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  next: string | null;
  // Supabase añade ?error=… si el enlace caducó o ya se usó.
  hasUrlError: boolean;
  // Solo para rellenar el login tras confirmar (lo añade la app al enlace).
  email?: string | null;
};

export type ConfirmFailure =
  // El canje del code falló en local (p. ej. sin la cookie code_verifier porque
  // el enlace se abrió en otra app o navegador).
  | { kind: "code"; verifierMissing: boolean }
  // verifyOtp falló, faltan parámetros o la URL trae un error de Supabase.
  | { kind: "link" };

// ¿Es la recuperación de contraseña? El enlace por defecto (code) no trae type:
// se deduce de next.
export function isRecovery({ type, next }: Pick<ConfirmParams, "type" | "next">): boolean {
  if (type === "recovery") return true;
  return !!next && stripLocale(next.split(/[?#]/)[0]) === "/restablecer";
}

export function confirmSuccessPath(params: ConfirmParams, lang: Locale): string {
  const fallback = localePath(lang, isRecovery(params) ? "/restablecer" : HOME_PATH);
  return safeNext(params.next, fallback);
}

export function confirmFailurePath(
  params: ConfirmParams,
  lang: Locale,
  failure: ConfirmFailure,
): string {
  if (failure.kind === "code" && !params.hasUrlError) {
    if (isRecovery(params)) {
      // Sin verificador no hay sesión para cambiar la contraseña: hay que pedir
      // otro enlace y abrirlo en el mismo navegador.
      if (failure.verifierMissing) return `${localePath(lang, "/recuperar")}?error=navegador`;
    } else {
      // Alta: Supabase ya confirmó el email al pasar por /verify; solo falta
      // la sesión, así que basta con iniciar sesión.
      const query = new URLSearchParams({ confirmado: "1" });
      const target = safeNext(params.next, "");
      if (target && target !== localePath(lang)) query.set("next", target);
      const email = params.email?.trim();
      if (email && email.length <= 254 && email.includes("@")) query.set("email", email);
      return `${localePath(lang, "/login")}?${query}`;
    }
  }
  return `${localePath(lang, "/login")}?error=enlace`;
}
