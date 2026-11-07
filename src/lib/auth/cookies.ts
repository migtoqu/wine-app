import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { ONE_YEAR, THEME_COOKIE } from "@/lib/preferences";
import { TEMA_A_COOKIE, type Tema } from "./validation";

// Cookies de preferencias: las mismas que escriben el selector de idioma y el de
// tema en el cliente (sin httpOnly, porque ThemeScript las lee antes de pintar).
export async function setPreferenceCookies(idioma: Locale, tema: Tema) {
  const store = await cookies();
  const options = { path: "/", maxAge: ONE_YEAR, sameSite: "lax" as const };
  store.set(LOCALE_COOKIE, idioma, options);
  store.set(THEME_COOKIE, TEMA_A_COOKIE[tema], options);
}
