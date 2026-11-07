import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { hasLocale, LOCALE_COOKIE, localePath } from "@/i18n/config";
import { HOME_PATH, localeFromNext, safeNext } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

// Destino de los enlaces de los emails de Supabase (confirmar alta, recuperar
// contraseña…). Las plantillas envían aquí con token_hash y type; verifyOtp crea
// la sesión (cookies) y se redirige a `next`. Fuera de [lang]: el proxy no pasa por aquí.

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
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const lang = localeFromNext(next, hasLocale(saved) ? saved : undefined);
  const fallback = localePath(lang, type === "recovery" ? "/restablecer" : HOME_PATH);

  if (tokenHash && isOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(safeNext(next, fallback), request.url));
    }
  }

  const failure = new URL(localePath(lang, "/login"), request.url);
  failure.searchParams.set("error", "enlace");
  return NextResponse.redirect(failure);
}
