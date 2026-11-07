import type { Locale } from "./config";

// Formatos por idioma. La zona horaria es fija (la app es solo para España),
// así servidor y navegador producen el mismo texto y no hay errores de hidratación.
const TIME_ZONE = "Europe/Madrid";

const intlLocale: Record<Locale, string> = { es: "es-ES", en: "en-GB" };

export function formatPrice(lang: Locale, amountEur: number): string {
  return new Intl.NumberFormat(intlLocale[lang], {
    style: "currency",
    currency: "EUR",
  }).format(amountEur);
}

export function formatNumber(
  lang: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocale[lang], options).format(value);
}

export function formatDate(
  lang: Locale,
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "long" },
): string {
  return new Intl.DateTimeFormat(intlLocale[lang], {
    timeZone: TIME_ZONE,
    ...options,
  }).format(new Date(date));
}
