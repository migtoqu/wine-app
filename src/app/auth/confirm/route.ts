import { isAuthPKCECodeVerifierMissingError, type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { hasLocale, LOCALE_COOKIE } from "@/i18n/config";
import {
  confirmFailurePath,
  confirmSuccessPath,
  type ConfirmFailure,
  type ConfirmParams,
} from "@/lib/auth/confirm";
import { localeFromNext } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

// Destino de los enlaces de los emails de Supabase (confirmar alta, recuperar
// contraseña…). Crea la sesión (cookies) y redirige a `next`. Fuera de [lang]:
// el proxy no pasa por aquí. Admite dos flujos:
//
// * `code` (PKCE): el de las plantillas por defecto. El enlace pasa por
//   /auth/v1/verify de Supabase y vuelve aquí con ?code=…; se canjea con el
//   code_verifier que @supabase/ssr guardó en una cookie al pedir el email, así
//   que solo crea sesión en el mismo navegador. No trae `type`: el destino sale
//   de `next` (/restablecer en la recuperación de contraseña). Si se abre en
//   otro navegador, el email ya está confirmado (lo hizo /verify): se manda a
//   login con aviso; en la recuperación, a pedir otro enlace. Ver lib/auth/confirm.ts.
// * `token_hash` + `type`: el de las plantillas propias de supabase/templates
//   (requieren SMTP propio). Funciona en cualquier navegador.

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isOtpType(value: string | null): value is EmailOtpType {
  return OTP_TYPES.includes(value as EmailOtpType);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const params: ConfirmParams = {
    code: searchParams.get("code"),
    tokenHash: searchParams.get("token_hash"),
    type: searchParams.get("type"),
    next: searchParams.get("next"),
    hasUrlError: searchParams.has("error"),
    email: searchParams.get("email"),
  };

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const lang = localeFromNext(params.next, hasLocale(saved) ? saved : undefined);
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  let failure: ConfirmFailure = { kind: "link" };
  if (!params.hasUrlError) {
    const supabase = await createClient();
    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (!error) return redirectTo(confirmSuccessPath(params, lang));
      failure = { kind: "code", verifierMissing: isAuthPKCECodeVerifierMissingError(error) };
    } else if (params.tokenHash && isOtpType(params.type)) {
      const { error } = await supabase.auth.verifyOtp({
        type: params.type,
        token_hash: params.tokenHash,
      });
      if (!error) return redirectTo(confirmSuccessPath(params, lang));
    }
  }

  return redirectTo(confirmFailurePath(params, lang, failure));
}
