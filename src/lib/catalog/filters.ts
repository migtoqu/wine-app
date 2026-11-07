import type { CrianzaVino, ListarBodegasArgs, ListarVinosArgs, TipoVino } from "./types";

// Filtros del buscador en la URL (compartible y sin JS: un <form method="get">
// con checkboxes genera claves repetidas, p. ej. ?tipo=tinto&tipo=blanco).
// Módulo puro: se usa en servidor y en cliente.

export const TIPOS_VINO = [
  "tinto",
  "blanco",
  "rosado",
  "espumoso",
  "generoso",
  "dulce",
  "naranja",
] as const satisfies readonly TipoVino[];

export const CRIANZAS = [
  "joven",
  "roble",
  "crianza",
  "reserva",
  "gran_reserva",
  "otra",
] as const satisfies readonly CrianzaVino[];

export const ORDENES = ["relevancia", "nombre", "novedad"] as const;
export type Orden = (typeof ORDENES)[number];

export const VISTAS = ["vinos", "bodegas"] as const;
export type Vista = (typeof VISTAS)[number];

export const PAGE_SIZE = 24;
const MAX_PAGE = 400; // listar_vinos acota el desplazamiento a 10.000
const MAX_QUERY_LENGTH = 100;
const MAX_VALUES = 20;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type Anada = number | "sin";

export type SearchFilters = {
  q: string;
  ver: Vista;
  tipos: TipoVino[];
  crianzas: CrianzaVino[];
  denominaciones: string[];
  variedades: string[];
  anada: Anada | null;
  bodega: string | null;
  orden: Orden;
  pagina: number;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

// Nombres de los parámetros en la URL.
export const PARAM = {
  q: "q",
  ver: "ver",
  tipos: "tipo",
  crianzas: "crianza",
  denominaciones: "do",
  variedades: "uva",
  anada: "anada",
  bodega: "bodega",
  orden: "orden",
  pagina: "pagina",
} as const satisfies Record<keyof SearchFilters, string>;

function values(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return [];
  return (Array.isArray(raw) ? raw : [raw]).flatMap((v) => v.split(","));
}

function first(raw: string | string[] | undefined): string | undefined {
  return values(raw)[0];
}

// Lista ordenada y sin duplicados: la misma selección da la misma URL y la
// misma clave de caché, venga en el orden que venga.
function pickAll<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T[] {
  const set = new Set(values(raw).map((v) => v.trim()));
  return allowed.filter((v) => set.has(v));
}

function pickSlugs(raw: string | string[] | undefined): string[] {
  const set = new Set(
    values(raw)
      .map((v) => v.trim().toLowerCase())
      .filter((v) => SLUG_RE.test(v)),
  );
  return [...set].sort().slice(0, MAX_VALUES);
}

export function parseAnada(raw: string | string[] | undefined): Anada | null {
  const value = first(raw)?.trim().toLowerCase();
  if (!value) return null;
  if (value === "sin") return "sin";
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= 1800 && year <= 2100 ? year : null;
}

// El orden por relevancia solo tiene sentido con texto de búsqueda.
export function defaultOrden(q: string): Orden {
  return q ? "relevancia" : "nombre";
}

export function parseSearchFilters(params: RawSearchParams): SearchFilters {
  const q = (first(params[PARAM.q]) ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  const ver = first(params[PARAM.ver]);
  const orden = first(params[PARAM.orden]) as Orden | undefined;
  const pagina = Number.parseInt(first(params[PARAM.pagina]) ?? "", 10);
  const bodega = pickSlugs(params[PARAM.bodega])[0] ?? null;

  return {
    q,
    ver: VISTAS.includes(ver as Vista) ? (ver as Vista) : "vinos",
    tipos: pickAll(params[PARAM.tipos], TIPOS_VINO),
    crianzas: pickAll(params[PARAM.crianzas], CRIANZAS),
    denominaciones: pickSlugs(params[PARAM.denominaciones]),
    variedades: pickSlugs(params[PARAM.variedades]),
    anada: parseAnada(params[PARAM.anada]),
    bodega,
    orden:
      orden && ORDENES.includes(orden) && !(orden === "relevancia" && !q)
        ? orden
        : defaultOrden(q),
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.min(pagina, MAX_PAGE) : 1,
  };
}

// Query string ("?q=…&tipo=…") sin los valores por defecto. `overrides`
// permite construir enlaces (quitar un filtro, cambiar de página…); cualquier
// cambio que no sea de página vuelve a la página 1.
export function serializeSearchFilters(
  filters: SearchFilters,
  overrides: Partial<SearchFilters> = {},
): string {
  const resetsPage = Object.keys(overrides).some((k) => k !== "pagina");
  const f: SearchFilters = {
    ...filters,
    ...(resetsPage ? { pagina: 1 } : {}),
    ...overrides,
  };
  const params = new URLSearchParams();
  if (f.q) params.set(PARAM.q, f.q);
  if (f.ver !== "vinos") params.set(PARAM.ver, f.ver);
  for (const v of f.tipos) params.append(PARAM.tipos, v);
  for (const v of f.crianzas) params.append(PARAM.crianzas, v);
  for (const v of f.denominaciones) params.append(PARAM.denominaciones, v);
  for (const v of f.variedades) params.append(PARAM.variedades, v);
  if (f.anada !== null) params.set(PARAM.anada, String(f.anada));
  if (f.bodega) params.set(PARAM.bodega, f.bodega);
  if (f.orden !== defaultOrden(f.q)) params.set(PARAM.orden, f.orden);
  if (f.pagina > 1) params.set(PARAM.pagina, String(f.pagina));
  const query = params.toString();
  return query ? `?${query}` : "";
}

// Número de filtros de vino activos (para el contador del panel de filtros).
export function countActiveFilters(f: SearchFilters): number {
  return (
    f.tipos.length +
    f.crianzas.length +
    f.denominaciones.length +
    f.variedades.length +
    (f.anada !== null ? 1 : 0) +
    (f.bodega ? 1 : 0)
  );
}

export function clearFilters(f: SearchFilters): Partial<SearchFilters> {
  return {
    q: f.q,
    tipos: [],
    crianzas: [],
    denominaciones: [],
    variedades: [],
    anada: null,
    bodega: null,
  };
}

export function totalPages(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// Argumentos de public.listar_vinos (solo los definidos: PostgREST usa el
// valor por defecto de la función para los que faltan).
export function toListarVinosArgs(f: SearchFilters, pageSize = PAGE_SIZE): ListarVinosArgs {
  const args: ListarVinosArgs = {
    orden: f.orden,
    limite: pageSize,
    desplazamiento: (f.pagina - 1) * pageSize,
  };
  if (f.q) args.q = f.q;
  if (f.tipos.length) args.tipos = f.tipos;
  if (f.crianzas.length) args.crianzas = f.crianzas;
  if (f.denominaciones.length) args.denominaciones = f.denominaciones;
  if (f.variedades.length) args.variedades = f.variedades;
  if (f.anada === "sin") args.sin_anada = true;
  else if (f.anada !== null) args.anio = f.anada;
  if (f.bodega) args.bodega = f.bodega;
  return args;
}

// La pestaña de bodegas solo filtra por texto y D.O. (la primera elegida).
export function toListarBodegasArgs(f: SearchFilters, pageSize = PAGE_SIZE): ListarBodegasArgs {
  const args: ListarBodegasArgs = { limite: pageSize, desplazamiento: (f.pagina - 1) * pageSize };
  if (f.q) args.q = f.q;
  if (f.denominaciones[0]) args.denominacion = f.denominaciones[0];
  return args;
}

// Slug válido de ficha (mismo check que en la base de datos).
export function isValidSlug(slug: string): boolean {
  return slug.length <= 200 && SLUG_RE.test(slug);
}
