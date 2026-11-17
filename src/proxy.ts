import { NextResponse, type NextRequest } from "next/server";
import {
  hasLocale,
  LOCALE_COOKIE,
  localeFromPathname,
  localePath,
  negotiateLocale,
} from "@/i18n/config";
import {
  HOME_PATH,
  isGuestOnlyPath,
  isPublicPath,
  loginPathWithNext,
  safeNext,
} from "@/lib/auth/routes";
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

  // 2. Rutas con idioma → refresco de sesión de Supabase y control de acceso (fase privada).
  //    Solo comprueba que haya sesión; el rol admin lo exigen requireAdmin() y la RLS.
  const lang = localeFromPathname(pathname)!;
  const { response, userId } = await updateSession(request);

  if (!userId && !isPublicPath(pathname)) {
    return redirectKeepingCookies(request, response, loginPathWithNext(lang, pathname + search));
  }
  if (userId && isGuestOnlyPath(pathname)) {
    const next = safeNext(request.nextUrl.searchParams.get("next"), localePath(lang, HOME_PATH));
    return redirectKeepingCookies(request, response, next);
  }
  return response;
}

// Redirige conservando las cookies que haya escrito updateSession (sesión refrescada).
function redirectKeepingCookies(request: NextRequest, from: NextResponse, target: string) {
  const redirect = NextResponse.redirect(new URL(target, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  from.headers.forEach((value, key) => {
    if (key === "cache-control" || key === "expires" || key === "pragma") {
      redirect.headers.set(key, value);
    }
  });
  return redirect;
}

export const config = {
  matcher: [
    // Todo salvo internos de Next, API/auth, ficheros de metadata y estáticos.
    "/((?!_next/static|_next/image|api/|auth/|manifest.webmanifest|robots.txt|sitemap.xml|favicon.ico|icons/|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
