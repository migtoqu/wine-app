// Utilidades de los listados del admin. Módulo puro.

import { normalizeText } from "@/lib/text";

export const ADMIN_PAGE_SIZE = 30;

type Params = Record<string, string | string[] | undefined>;

export function param(params: Params, name: string): string {
  const v = params[name];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function pageParam(params: Params): number {
  const n = Number.parseInt(param(params, "pagina"), 10);
  return Number.isFinite(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** Filtra por nombre (y sinónimos, si los hay) sin tener en cuenta tildes ni mayúsculas. */
export function filterByName<T extends { nombre: string; sinonimos?: string[] }>(items: T[], q: string): T[] {
  const needle = normalizeText(q);
  if (!needle) return items;
  return items.filter((i) =>
    [i.nombre, ...(i.sinonimos ?? [])].some((s) => normalizeText(s).includes(needle)),
  );
}

export function paginate<T>(items: T[], page: number, size = ADMIN_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages, total: items.length };
}

/** Href de una página del listado conservando la búsqueda. */
export function listHref(base: string, params: Record<string, string>, page: number): string {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ""));
  if (page > 1) query.set("pagina", String(page));
  const qs = query.toString();
  return qs ? `${base}?${qs}` : base;
}
