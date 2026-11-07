// Filtro y orden de la lista de favoritos de /yo. Módulo puro, testeable.

export const TIPOS_FILTRO = ["todos", "vino", "bodega"] as const;
export const ORDENES = ["reciente", "nombre"] as const;
export type TipoFiltro = (typeof TIPOS_FILTRO)[number];
export type Orden = (typeof ORDENES)[number];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : allowed[0];
}

export function parseFavoritesParams(params: Record<string, string | string[] | undefined>): {
  tipo: TipoFiltro;
  orden: Orden;
} {
  return {
    tipo: pick(first(params.tipo), TIPOS_FILTRO),
    orden: pick(first(params.orden), ORDENES),
  };
}

type Sortable = { created_at: string; vino: { nombre: string } | null; bodega: { nombre: string } | null };

// `items` llega ya ordenado por fecha (más reciente primero).
export function filterAndSortFavorites<T extends Sortable>(
  items: T[],
  { tipo, orden }: { tipo: TipoFiltro; orden: Orden },
  locale: string,
): T[] {
  const filtered = items.filter(
    (f) => tipo === "todos" || (tipo === "vino" ? f.vino !== null : f.bodega !== null),
  );
  if (orden === "reciente") {
    return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const name = (f: T) => f.vino?.nombre ?? f.bodega?.nombre ?? "";
  return filtered.sort((a, b) => name(a).localeCompare(name(b), locale, { sensitivity: "base" }));
}
