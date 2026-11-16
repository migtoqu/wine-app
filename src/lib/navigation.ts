import { localeFromPathname } from "@/i18n/config";

// Ruta «padre» para el botón Atrás cuando no hay historial dentro de la app.
// null = estamos en el inicio del idioma (no se muestra el botón).
//   /es/vino/x → /es/buscar · /es/bodega/x → /es/buscar?ver=bodegas
//   /es/yo/cava → /es/yo · /es/admin/vinos/123 → /es/admin/vinos · /es/yo → /es
export function parentPath(pathname: string): string | null {
  const lang = localeFromPathname(pathname);
  if (!lang) return null;
  const parts = pathname.split("/").filter(Boolean).slice(1);
  if (parts.length === 0) return null;
  if (parts[0] === "vino") return `/${lang}/buscar`;
  if (parts[0] === "bodega") return `/${lang}/buscar?ver=bodegas`;
  return `/${lang}${parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : ""}`;
}
