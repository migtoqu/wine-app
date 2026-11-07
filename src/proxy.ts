import { NextResponse, type NextRequest } from "next/server";
import {
  hasLocale,
  LOCALE_COOKIE,
  localeFromPathname,
  localePath,
  negotiateLocale,
} from "@/i18n/config";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Rutas sin idioma → redirigir a /{idioma}{ruta}. Prioridad: elección guardada, navegador, español.
  //    No hace falta refrescar la sesión aquí: lo hará la petición redirigida.
  if (!localeFromPathname(pathname)) {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value;
    const locale = hasLocale(saved)
      ? saved
      : negotiateLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = localePath(locale, pathname);
    url.search = search;
    return NextResponse.redirect(url);
  }

  // 2. Rutas con idioma → refresco de sesión de Supabase (la lógica de auth futura va aquí o en updateSession).
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo salvo internos de Next, API/auth, ficheros de metadata y estáticos.
    "/((?!_next/static|_next/image|api/|auth/|manifest.webmanifest|robots.txt|sitemap.xml|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
