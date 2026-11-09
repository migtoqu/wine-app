// Señales de lugar y contacto para emparejar bodegas: provincia (por nombre o
// por los dos primeros dígitos del código postal), municipio sacado de una
// dirección, teléfonos y distancia entre coordenadas.
import { claveTexto } from "../lib/texto.ts";

// Código INE de provincia (= dos primeros dígitos del código postal).
const PROVINCIAS: Record<string, string> = {
  "01": "alava araba", "02": "albacete", "03": "alicante alacant", "04": "almeria", "05": "avila",
  "06": "badajoz", "07": "baleares illes balears islas baleares", "08": "barcelona", "09": "burgos", "10": "caceres",
  "11": "cadiz", "12": "castellon castello", "13": "ciudad real", "14": "cordoba", "15": "a coruna la coruna coruna",
  "16": "cuenca", "17": "girona gerona", "18": "granada", "19": "guadalajara", "20": "gipuzkoa guipuzcoa",
  "21": "huelva", "22": "huesca", "23": "jaen", "24": "leon", "25": "lleida lerida", "26": "la rioja rioja",
  "27": "lugo", "28": "madrid", "29": "malaga", "30": "murcia", "31": "navarra nafarroa", "32": "ourense orense",
  "33": "asturias", "34": "palencia", "35": "las palmas", "36": "pontevedra", "37": "salamanca",
  "38": "santa cruz de tenerife tenerife", "39": "cantabria", "40": "segovia", "41": "sevilla", "42": "soria",
  "43": "tarragona", "44": "teruel", "45": "toledo", "46": "valencia", "47": "valladolid", "48": "bizkaia vizcaya",
  "49": "zamora", "50": "zaragoza", "51": "ceuta", "52": "melilla",
};
const POR_NOMBRE = new Map<string, string>();
for (const [codigo, nombres] of Object.entries(PROVINCIAS)) {
  // Nombres de varias palabras se guardan enteros; los alias sueltos, por palabra.
  POR_NOMBRE.set(nombres, codigo);
  for (const n of nombres.split(" ")) if (n.length > 3 && !POR_NOMBRE.has(n)) POR_NOMBRE.set(n, codigo);
}
for (const n of ["ciudad real", "la rioja", "las palmas", "a coruna", "la coruna", "santa cruz de tenerife", "illes balears", "islas baleares"]) {
  POR_NOMBRE.set(n, Object.entries(PROVINCIAS).find(([, v]) => v.includes(n))![0]);
}

/** Código postal español de 5 dígitos (o null). */
export function codigoPostal(s: string | null | undefined): string | null {
  const m = s?.match(/(?<!\d)(\d{5})(?!\d)/);
  return m && Number(m[1]!.slice(0, 2)) >= 1 && Number(m[1]!.slice(0, 2)) <= 52 ? m[1]! : null;
}

/** Código de provincia a partir del CP o del nombre de la provincia. */
export function codigoProvincia(provincia: string | null | undefined, cp: string | null | undefined): string | null {
  const c = codigoPostal(cp);
  if (c) return c.slice(0, 2);
  if (!provincia) return null;
  const k = claveTexto(provincia);
  return POR_NOMBRE.get(k) ?? POR_NOMBRE.get(k.split(" ").find((p) => POR_NOMBRE.has(p)) ?? "") ?? null;
}

/**
 * Municipio de una dirección postal con CP: «Bodegas X - Ribera, 09443, Gumiel de Mercado, Burgos»
 * → «Gumiel de Mercado»; «Bodega La Olmilla, 47300 Peñafiel, Valladolid» → «Peñafiel».
 */
export function municipioDeDireccion(direccion: string | null | undefined): string | null {
  const m = direccion?.match(/(?<!\d)\d{5}(?!\d)[,\s]+([^,\d]+?)\s*(?:,|$)/);
  const muni = m?.[1]?.trim();
  if (!muni || /^(espa[nñ]a|spain)$/i.test(muni)) return null;
  return muni;
}

/** Teléfonos españoles (9 dígitos) que aparecen en el texto: «609 207 755 – 921 532 454» → dos. */
export function telefonos(s: string | null | undefined): string[] {
  if (!s) return [];
  const out = new Set<string>();
  for (const m of s.matchAll(/(?:\+?\s?34[\s.-]?)?([6789](?:[\s.-]?\d){8})(?!\d)/g)) out.add(m[1]!.replace(/\D/g, ""));
  return [...out];
}

export interface Coordenadas {
  lat: number;
  lon: number;
}

/** Distancia en km (haversine). */
export function distanciaKm(a: Coordenadas, b: Coordenadas): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Coordenadas de un punto PostGIS tal como llegan: EWKB en hexadecimal (lo que devuelve
 * PostgREST para una columna geography) o EWKT «SRID=4326;POINT(lon lat)».
 */
export function coordenadas(v: unknown): Coordenadas | null {
  if (typeof v !== "string" || v === "") return null;
  const wkt = v.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (wkt) return { lon: Number(wkt[1]), lat: Number(wkt[2]) };
  if (!/^[0-9a-f]+$/i.test(v) || v.length < 42) return null;
  const b = Buffer.from(v, "hex");
  const le = b[0] === 1;
  const tipo = le ? b.readUInt32LE(1) : b.readUInt32BE(1);
  const desde = tipo & 0x20000000 ? 9 : 5; // con SRID: 4 bytes más
  if ((tipo & 0xff) !== 1 || b.length < desde + 16) return null;
  const x = le ? b.readDoubleLE(desde) : b.readDoubleBE(desde);
  const y = le ? b.readDoubleLE(desde + 8) : b.readDoubleBE(desde + 8);
  return Number.isFinite(x) && Number.isFinite(y) ? { lat: y, lon: x } : null;
}
