// Configuración de idiomas. Módulo puro: se usa en proxy, servidor y cliente.

export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

// Cookie técnica con el idioma elegido explícitamente por el usuario.
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function hasLocale(value: string | undefined | null): value is Locale {
  return locales.includes(value as Locale);
}

// Construye una ruta interna con prefijo de idioma: localePath("en", "/legal/cookies") → "/en/legal/cookies".
export function localePath(lang: Locale, path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? `/${lang}` : `/${lang}${clean}`;
}

// Devuelve el idioma del primer segmento de la ruta, si lo hay.
export function localeFromPathname(pathname: string): Locale | null {
  const first = pathname.split("/")[1];
  return hasLocale(first) ? first : null;
}

// Cambia el prefijo de idioma de una ruta: switchLocalePath("/es/legal", "en") → "/en/legal".
export function switchLocalePath(pathname: string, lang: Locale): string {
  const current = localeFromPathname(pathname);
  const rest = current ? pathname.slice(current.length + 1) : pathname;
  return localePath(lang, rest || "/");
}

// Elige idioma a partir de la cabecera Accept-Language ("en-US,en;q=0.9,es;q=0.8").
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number.parseFloat(q.trim().slice(2)) : 1;
      return {
        base: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isNaN(quality) ? 0 : quality,
        index,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  const match = ranked.find((entry) => hasLocale(entry.base));
  return match ? (match.base as Locale) : defaultLocale;
}
