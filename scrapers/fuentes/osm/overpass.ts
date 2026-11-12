// Overpass: todos los POI craft=winery y shop=wine de España en una sola consulta por ejecución
// (~2.100 elementos, ~550 KB). Solo etiquetas factuales: nombre, dirección, web, teléfono,
// horario (opening_hours) y coordenadas.
import type { Coordenadas } from "../../emparejamiento/lugar.ts";
import { normalizarTelefono, normalizarWeb, normalizarCodigoPostal } from "../../lib/contacto.ts";
import { puntoEnEspana } from "../../lib/geo.ts";
import { limpiarEspacios } from "../../lib/texto.ts";

export const URLS_OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

export const CONSULTA_OVERPASS =
  '[out:json][timeout:180];area["ISO3166-1"="ES"][admin_level=2]->.es;' +
  '(nwr["craft"="winery"](area.es);nwr["shop"="wine"](area.es););out center tags;';

export const urlOverpass = (base: string) => `${base}?data=${encodeURIComponent(CONSULTA_OVERPASS)}`;

export interface Poi {
  /** «node/123», «way/456». */
  id: string;
  clase: "bodega" | "tienda";
  nombre: string;
  punto: Coordenadas;
  municipio: string | null;
  codigoPostal: string | null;
  calle: string | null;
  web: string | null;
  telefono: string | null;
  /** Sintaxis opening_hours de OSM, tal cual («Mo-Fr 09:00-14:00; Sa 10:00-14:00»). */
  horario: string | null;
}

interface Elemento {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const etiqueta = (t: Record<string, string>, ...claves: string[]) => {
  for (const k of claves) {
    const v = t[k]?.trim();
    if (v) return limpiarEspacios(v);
  }
  return null;
};

/** Respuesta JSON de Overpass → POIs con nombre y coordenadas en España. */
export function parsearOverpass(texto: string): Poi[] {
  const j = JSON.parse(texto) as { elements?: Elemento[]; remark?: string };
  if (!Array.isArray(j.elements)) throw new Error("Overpass: respuesta sin elements");
  if (j.remark && /error|timed out/i.test(j.remark)) throw new Error(`Overpass: ${j.remark}`);
  const out: Poi[] = [];
  for (const e of j.elements) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const nombre = etiqueta(t, "name", "name:es", "official_name", "brand");
    if (lat == null || lon == null || !nombre || !puntoEnEspana({ lat, lng: lon })) continue;
    // Telefono: OSM admite varios separados por «;»; se queda el primero válido.
    const telefonos = (etiqueta(t, "phone", "contact:phone", "contact:mobile") ?? "").split(/\s*;\s*/);
    const calle = etiqueta(t, "addr:street");
    out.push({
      id: `${e.type}/${e.id}`,
      clase: t.craft === "winery" ? "bodega" : "tienda",
      nombre,
      punto: { lat, lon },
      municipio: etiqueta(t, "addr:city", "addr:town", "addr:village", "addr:municipality"),
      codigoPostal: normalizarCodigoPostal(etiqueta(t, "addr:postcode")),
      calle: calle ? [calle, etiqueta(t, "addr:housenumber")].filter(Boolean).join(", ") : null,
      web: normalizarWeb(etiqueta(t, "website", "contact:website", "url")),
      telefono: telefonos.map((x) => normalizarTelefono(x)).find((x) => !!x) ?? null,
      horario: etiqueta(t, "opening_hours"),
    });
  }
  return out;
}
