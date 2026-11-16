// Utilidades puras del mapa de bodegas: GeoJSON para MapLibre y «cerca de mí» en el navegador
// (la posición del usuario nunca sale del dispositivo).
import type { BodegaMapa } from "@/lib/catalog/types";

export type Punto = { lat: number; lng: number };

/** Distancia en km (haversine). */
export function distanciaKm(a: Punto, b: Punto): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type BodegaCercana = BodegaMapa & { distanciaKm: number };

/** Las `n` bodegas más cercanas a `desde`, como mucho a `radioKm`. */
export function cercanas(bodegas: BodegaMapa[], desde: Punto, n = 10, radioKm = 150): BodegaCercana[] {
  return bodegas
    .map((b) => ({ ...b, distanciaKm: distanciaKm(desde, b) }))
    .filter((b) => b.distanciaKm <= radioKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm || a.nombre.localeCompare(b.nombre))
    .slice(0, n);
}

/** ¿El punto es aproximado (no es la bodega en sí)? */
export const esAproximada = (b: Pick<BodegaMapa, "precision">) => b.precision === "municipio";

export type FeatureBodega = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { slug: string; nombre: string; lugar: string; aproximada: boolean };
};

export function aGeoJson(bodegas: BodegaMapa[]): { type: "FeatureCollection"; features: FeatureBodega[] } {
  return {
    type: "FeatureCollection",
    features: bodegas.map((b) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [b.lng, b.lat] },
      properties: {
        slug: b.slug,
        nombre: b.nombre,
        lugar: [b.municipio, b.provincia !== b.municipio ? b.provincia : null].filter(Boolean).join(", "),
        aproximada: esAproximada(b),
      },
    })),
  };
}
