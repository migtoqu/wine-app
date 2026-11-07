// Cookies técnicas de preferencias (se documentan en /legal/cookies). Módulo compartido cliente/servidor.

export const THEME_COOKIE = "theme";
export const AGE_COOKIE = "age_ok";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type ThemePreference = "light" | "dark" | "system";

export function setClientCookie(name: string, value: string, maxAge = ONE_YEAR) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

// Aplica una preferencia de tema en caliente (el resolvedor de "system" vive en ThemeScript).
export function applyThemePreference(pref: ThemePreference) {
  const root = document.documentElement;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme-pref", pref);
  root.setAttribute("data-theme", pref === "system" ? (dark ? "dark" : "light") : pref);
  setClientCookie(THEME_COOKIE, pref);
}
