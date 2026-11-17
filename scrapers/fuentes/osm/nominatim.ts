// Nominatim (https://nominatim.org/release-docs/latest/api/Search/): geocodificación de la
// dirección o del municipio de una bodega. Política de uso de la OSMF: ≤ 1 petición/s,
// User-Agent identificable, caché de resultados y nada de cargas masivas.
// Aquí solo se construyen las consultas y se valida lo que devuelve (sin red).
import type { Coordenadas } from "../../emparejamiento/lugar.ts";
import { distanciaKm } from "../../emparejamiento/lugar.ts";
import { comunidadDeProvincia, provinciaDeCodigoPostal, puntoEnEspana } from "../../lib/geo.ts";
import { claveTexto } from "../../lib/texto.ts";

export const URL_NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** Precisión de un punto, de más a menos fino. */
export type Precision = "exacta" | "portal" | "calle" | "municipio";
export const ORDEN_PRECISION: Record<Precision, number> = { exacta: 4, portal: 3, calle: 2, municipio: 1 };

export interface ResultadoNominatim {
  lat: string;
  lon: string;
  osm_type?: string;
  osm_id?: number;
  category?: string;
  type?: string;
  addresstype?: string;
  place_rank?: number;
  importance?: number;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

export interface Geocodificacion {
  punto: Coordenadas;
  precision: Precision;
  /** Consulta que lo produjo (URL sin el host). */
  consulta: string;
  osm: string | null;
  nombre: string | null;
  tipo: string | null;
}

function url(params: Record<string, string>): string {
  const q = new URLSearchParams({ ...params, countrycodes: "es", format: "jsonv2", addressdetails: "1", limit: "1" });
  return `${URL_NOMINATIM}?${q}`;
}

/** Municipio: búsqueda estructurada de núcleos de población (city + county = provincia). */
export function consultaMunicipio(municipio: string, provincia: string | null): string {
  return url({ city: municipio, ...(provincia ? { county: provincia } : {}), featureType: "settlement" });
}

export function consultaCodigoPostal(cp: string): string {
  return url({ postalcode: cp });
}

/** Calle (con número si lo hay) dentro del municipio. */
export function consultaCalle(calle: CalleLimpia, municipio: string): string {
  return url({ street: calle.numero ? `${calle.numero} ${calle.via}` : calle.via, city: municipio });
}

// ------------------------------------------------------------------ direcciones

export interface CalleLimpia {
  via: string;
  numero: string | null;
}

// Direcciones que Nominatim no resuelve a un punto útil: carreteras con km, parajes, fincas…
const NO_GEOCODIFICABLE =
  /\b(ctra|crta|cra|carretera|km|kil[oó]metro|autov[ií]a|paraje|pago|finca|parcela|pol[ií]gono|pol|apartado|apdo|aptdo|camino|cmno|partida|diseminado|afueras|término|termino|ap)\b\.?/i;

const ABREVIATURAS: [RegExp, string][] = [
  [/^c\s*\/\s*/i, "Calle "],
  [/^(c|cl|cll)\.\s*/i, "Calle "],
  [/^avda?\.?\s+/i, "Avenida "],
  [/^av\.\s*/i, "Avenida "],
  [/^(pza|pl|plz)\.?\s+/i, "Plaza "],
  [/^(pº|p\.º|pso)\.?\s+/i, "Paseo "],
  [/^trav?\.?\s+/i, "Travesía "],
  [/^ronda\s+/i, "Ronda "],
];

/**
 * Deja la vía y el número de una dirección libre («C/ Valoria, 7» → Calle Valoria, 7).
 * null si no es una calle geocodificable (carreteras con km, parajes, solo un CP…).
 */
export function limpiarCalle(
  direccion: string | null | undefined,
  contexto: { municipio?: string | null; provincia?: string | null } = {},
): CalleLimpia | null {
  if (!direccion) return null;
  let d = direccion.replace(/\s+/g, " ").trim();
  // Lo que va detrás de un guion largo o de « - » suele ser municipio/CP/provincia.
  d = d.split(/\s[–—-]\s/)[0]!;
  if (NO_GEOCODIFICABLE.test(d)) return null;
  // Fuera CP, «s/n» y el municipio o la provincia repetidos al final.
  d = d.replace(/\b\d{5}\b/g, " ").replace(/\bs\s*\/\s*n\b\.?/gi, " ");
  for (const lugar of [contexto.municipio, contexto.provincia]) {
    if (!lugar) continue;
    const re = new RegExp(`[,\\s]+${lugar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    d = d.replace(re, "");
  }
  d = d.replace(/[\s,.;()]+$/g, "").replace(/\s+/g, " ").trim();
  for (const [re, por] of ABREVIATURAS) d = d.replace(re, por);

  const m = /^(.*?[a-záéíóúñü][^,]*?)[,\s]+(?:n[ºo°.]?\s*)?(\d{1,4}[a-z]?)(?:\b.*)?$/i.exec(d);
  const via = (m ? m[1]! : d).replace(/[\s,]+$/, "").trim();
  const numero = m ? m[2]! : null;
  // Una vía de verdad tiene al menos una palabra de 3 letras.
  if (!/[a-záéíóúñü]{3,}/i.test(via)) return null;
  return { via, numero };
}

// ------------------------------------------------------------------ validación

const CLAVES_MUNICIPIO = ["city", "town", "village", "municipality", "hamlet", "suburb", "city_district"];
const CLAVES_PROVINCIA = ["province", "state_district", "county", "state"];

/** «Ribera / Erribera», «Araba/Álava»: cada variante por separado. */
function variantes(v: string): string[] {
  return v.split(/\s*[/-]\s*/).map(claveTexto).concat(claveTexto(v)).filter((x) => x !== "");
}

function mismoLugar(a: string, b: string): boolean {
  const ka = claveTexto(a);
  return variantes(b).some((kb) => kb === ka || (kb.length >= 5 && ka.length >= 5 && (kb.includes(ka) || ka.includes(kb))));
}

/** ¿El resultado cae en la provincia esperada? (por nombre o por comunidad uniprovincial). */
export function enProvincia(r: ResultadoNominatim, provincia: string | null | undefined): boolean {
  if (!provincia) return true;
  const a = r.address ?? {};
  const valores = CLAVES_PROVINCIA.map((k) => a[k]).filter((x): x is string => !!x);
  if (valores.some((v) => mismoLugar(provincia, v))) return true;
  const comunidad = comunidadDeProvincia(provincia);
  // Comunidades uniprovinciales (Navarra, La Rioja, Madrid…): Nominatim da a veces solo el state.
  // Si trae otra provincia (aunque sea de la misma comunidad), no es la nuestra.
  const otraProvincia = valores.some((v) => !!comunidadDeProvincia(v) && !mismoLugar(comunidad ?? "", v));
  return !!comunidad && !otraProvincia && valores.some((v) => mismoLugar(comunidad, v));
}

export function enMunicipio(r: ResultadoNominatim, municipio: string): boolean {
  const a = r.address ?? {};
  return CLAVES_MUNICIPIO.some((k) => a[k] && mismoLugar(municipio, a[k]!)) || (!!r.name && mismoLugar(municipio, r.name));
}

function puntoDe(r: ResultadoNominatim): Coordenadas | null {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !puntoEnEspana({ lat, lng: lon })) return null;
  return { lat, lon };
}

function base(r: ResultadoNominatim, punto: Coordenadas, precision: Precision, consulta: string): Geocodificacion {
  return {
    punto, precision, consulta: consulta.replace(URL_NOMINATIM, ""),
    osm: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : null,
    nombre: r.display_name ?? null,
    tipo: [r.category, r.type].filter(Boolean).join("=") || null,
  };
}

/** Primer resultado de una respuesta de Nominatim (o null si no hay o no es JSON). */
export function primerResultado(texto: string): ResultadoNominatim | null {
  try {
    const j = JSON.parse(texto) as unknown;
    return Array.isArray(j) && j.length > 0 && typeof j[0] === "object" ? (j[0] as ResultadoNominatim) : null;
  } catch {
    return null;
  }
}

/** Resultado de la consulta de municipio: un núcleo de población del municipio y la provincia esperados. */
export function validarMunicipio(
  r: ResultadoNominatim | null, municipio: string, provincia: string | null, consulta: string,
): Geocodificacion | null {
  if (!r) return null;
  const punto = puntoDe(r);
  if (!punto || !enMunicipio(r, municipio) || !enProvincia(r, provincia)) return null;
  // Un municipio es un place/boundary de rango ≤ 20 (aldea incluida); una calle o un POI, no.
  if ((r.place_rank ?? 30) > 20) return null;
  return base(r, punto, "municipio", consulta);
}

/** Centroide de un código postal: solo si cae en la provincia que dicen sus dos primeras cifras. */
export function validarCodigoPostal(r: ResultadoNominatim | null, cp: string, consulta: string): Geocodificacion | null {
  if (!r) return null;
  const punto = puntoDe(r);
  if (!punto || r.address?.postcode !== cp || !enProvincia(r, provinciaDeCodigoPostal(cp))) return null;
  return base(r, punto, "municipio", consulta);
}

/**
 * Resultado de la consulta de calle: en el municipio esperado y a ≤ 15 km de su centro.
 * Con número de portal → 'portal'; la vía sola → 'calle'; un núcleo de población no vale (eso
 * ya lo da la consulta de municipio).
 */
export function validarCalle(
  r: ResultadoNominatim | null, municipio: string, centro: Coordenadas | null, consulta: string,
): Geocodificacion | null {
  if (!r) return null;
  const punto = puntoDe(r);
  if (!punto || !enMunicipio(r, municipio)) return null;
  if (centro && distanciaKm(centro, punto) > 15) return null;
  const rango = r.place_rank ?? 0;
  if (rango >= 28 && r.address?.house_number) return base(r, punto, "portal", consulta);
  if (rango >= 26 || r.category === "highway") return base(r, punto, "calle", consulta);
  return null;
}
