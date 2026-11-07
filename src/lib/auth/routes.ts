// Rutas públicas/privadas de la fase privada y saneado de redirecciones.
// Módulo puro: lo usan el proxy, las Server Actions, el route handler y los tests.

import { defaultLocale, localeFromPathname, localePath, type Locale } from "@/i18n/config";

// Rutas bajo /[lang] accesibles sin sesión. "/" es la landing; legal incluye sus subrutas.
const PUBLIC_EXACT = new Set(["/", "/login", "/registro", "/recuperar", "/restablecer"]);
const PUBLIC_PREFIXES = ["/legal"];

// Con sesión no tiene sentido verlas: se redirige al destino o a /yo.
const GUEST_ONLY = new Set(["/login", "/registro", "/recuperar"]);

// Destino por defecto tras entrar.
export const HOME_PATH = "/yo";

// Quita el prefijo de idioma: "/es/yo/ajustes" → "/yo/ajustes", "/es" → "/".
export function stripLocale(pathname: string): string {
  const lang = localeFromPathname(pathname);
  if (!lang) return pathname || "/";
  const rest = pathname.slice(lang.length + 1);
  return rest === "" ? "/" : rest;
}

function normalize(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function matchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

// ¿Se puede ver sin sesión? Recibe la ruta completa con idioma.
export function isPublicPath(pathname: string): boolean {
  const path = normalize(stripLocale(pathname));
  return PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some((p) => matchesPrefix(path, p));
}

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY.has(normalize(stripLocale(pathname)));
}

export function isAdminPath(pathname: string): boolean {
  return matchesPrefix(normalize(stripLocale(pathname)), "/admin");
}

// Acepta solo rutas internas con idioma ("/es/…", "/en/…"). Cualquier otra cosa
// (URLs absolutas, "//host", "/\host", rutas sin idioma) devuelve el fallback.
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  // Caracteres de control: los navegadores los ignoran y "/\t/host" acabaría en otro dominio.
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(next, "http://n");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://n" || !localeFromPathname(parsed.pathname)) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

// "/es/login?next=%2Fes%2Fyo". Sin next si el destino es la landing o la propia página de login.
export function loginPathWithNext(lang: Locale, next?: string | null): string {
  const login = localePath(lang, "/login");
  const target = next ? safeNext(next, "") : "";
  if (!target || target === localePath(lang) || isGuestOnlyPath(target.split("?")[0])) {
    return login;
  }
  return `${login}?next=${encodeURIComponent(target)}`;
}

// Idioma a usar cuando no viene en la URL (p. ej. /auth/confirm): el de next o el por defecto.
export function localeFromNext(next: string | null | undefined, fallback: Locale = defaultLocale) {
  return (next && localeFromPathname(next.split("?")[0])) || fallback;
}
