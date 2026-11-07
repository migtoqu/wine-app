// Geografía: provincia → comunidad autónoma y puntos PostGIS.
import { quitarTildes } from "./texto.ts";

const COMUNIDADES: Record<string, string[]> = {
  "Andalucía": ["almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"],
  "Aragón": ["huesca", "teruel", "zaragoza"],
  "Principado de Asturias": ["asturias", "oviedo"],
  "Illes Balears": ["illes balears", "islas baleares", "baleares", "balears"],
  "Canarias": ["las palmas", "santa cruz de tenerife", "tenerife"],
  "Cantabria": ["cantabria", "santander"],
  "Castilla-La Mancha": ["albacete", "ciudad real", "cuenca", "guadalajara", "toledo"],
  "Castilla y León": [
    "avila", "burgos", "leon", "palencia", "salamanca", "segovia", "soria", "valladolid", "zamora",
  ],
  "Cataluña": ["barcelona", "girona", "gerona", "lleida", "lerida", "tarragona"],
  "Comunitat Valenciana": [
    "alicante", "alacant", "castellon", "castello", "castellon de la plana", "valencia",
  ],
  "Extremadura": ["badajoz", "caceres"],
  "Galicia": ["a coruna", "la coruna", "coruna", "lugo", "ourense", "orense", "pontevedra"],
  "Comunidad de Madrid": ["madrid"],
  "Región de Murcia": ["murcia"],
  "Comunidad Foral de Navarra": ["navarra", "nafarroa"],
  "País Vasco": ["alava", "araba", "araba alava", "alava araba", "gipuzkoa", "guipuzcoa", "bizkaia", "vizcaya"],
  "La Rioja": ["la rioja", "rioja", "logrono"],
  "Ceuta": ["ceuta"],
  "Melilla": ["melilla"],
};

const PROVINCIA_A_COMUNIDAD = new Map<string, string>(
  Object.entries(COMUNIDADES).flatMap(([comunidad, provincias]) =>
    provincias.map((p) => [p, comunidad] as const),
  ),
);

function claveProvincia(provincia: string): string {
  return quitarTildes(provincia)
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Comunidad autónoma de una provincia (admite nombres en castellano y cooficiales). */
export function comunidadDeProvincia(provincia: string | null | undefined): string | null {
  if (!provincia) return null;
  return PROVINCIA_A_COMUNIDAD.get(claveProvincia(provincia)) ?? null;
}

export interface Punto {
  lat: number;
  lng: number;
}

/** ¿El punto cae en la caja de España (península, Baleares, Canarias, Ceuta y Melilla)? */
export function puntoEnEspana({ lat, lng }: Punto): boolean {
  return lat >= 27 && lat <= 44.5 && lng >= -18.5 && lng <= 4.6;
}

/** Punto en EWKT, que PostgREST acepta para columnas geography. */
export function puntoEwkt({ lat, lng }: Punto): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}
