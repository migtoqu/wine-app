import { localePath, type Locale } from "@/i18n/config";

// Rutas del panel: adminPath("es", "/bodegas", { ok: "creado" }) → "/es/admin/bodegas?ok=creado".
export function adminPath(lang: Locale, path: string, params?: Record<string, string>) {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  return `${localePath(lang, `/admin${path}`)}${query}`;
}
