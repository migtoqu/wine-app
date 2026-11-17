// Emparejamiento POI de OSM ↔ bodega del catálogo. La cercanía es la prueba de lugar: solo se
// comparan los POI a pocos km del punto de referencia de la bodega (sus coordenadas oficiales o
// lo que dio Nominatim), y el nombre lo decide el emparejador común (≥ 0,9 para vincular).
import { EmparejadorBodegas, type MotivoBodega } from "../../emparejamiento/entidades.ts";
import { distanciaKm, type Coordenadas } from "../../emparejamiento/lugar.ts";
import type { Poi } from "./overpass.ts";
import type { Precision } from "./nominatim.ts";

/** Radio de búsqueda según lo fino que sea el punto de referencia. */
export const RADIO_KM: Record<Precision | "oficial", number> = {
  oficial: 2, exacta: 2, portal: 2, calle: 3, municipio: 8,
};

// Una vinoteca (shop=wine) solo es la bodega con una prueba fuerte: muchas llevan el nombre
// de una bodega o de un vino que venden.
const MOTIVOS_TIENDA = new Set<MotivoBodega>(["dominio", "telefono", "nif", "registro_embotellador"]);

export interface BodegaRef {
  id: string;
  nombre: string;
  municipio: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  web: string | null;
  telefono: string | null;
}

export interface Emparejamiento {
  poi: Poi;
  confianza: number;
  motivo: MotivoBodega;
  distanciaKm: number;
}

/** POI más probable para una bodega cerca de `ref`, o null. */
export function emparejarPoi(
  bodega: BodegaRef,
  ref: { punto: Coordenadas; precision: Precision | "oficial" },
  pois: Poi[],
): Emparejamiento | null {
  const radio = RADIO_KM[ref.precision];
  const cerca = pois
    .map((poi) => ({ poi, d: distanciaKm(ref.punto, poi.punto) }))
    .filter((x) => x.d <= radio);
  if (cerca.length === 0) return null;
  const porId = new Map(cerca.map((x) => [x.poi.id, x]));
  // Sin addr:city se asume el municipio de la bodega: el radio ya acota el lugar.
  const emparejador = new EmparejadorBodegas(
    cerca.map(({ poi }) => ({
      id: poi.id,
      nombre: poi.nombre,
      municipio: poi.municipio ?? bodega.municipio,
      codigoPostal: poi.codigoPostal,
      web: poi.web,
      telefono: poi.telefono,
      ubicacion: poi.punto,
    })),
  );
  const r = emparejador.emparejar({
    nombre: bodega.nombre,
    municipio: bodega.municipio,
    provincia: bodega.provincia,
    codigoPostal: bodega.codigoPostal,
    web: bodega.web,
    telefono: bodega.telefono,
    ubicacion: ref.precision === "municipio" ? null : ref.punto,
  });
  if (r.estado !== "vinculada" || !r.bodegaId) return null;
  const elegido = porId.get(r.bodegaId)!;
  const motivo = r.candidatos[0]!.motivo;
  if (elegido.poi.clase === "tienda" && !MOTIVOS_TIENDA.has(motivo)) return null;
  return { poi: elegido.poi, confianza: r.confianza, motivo, distanciaKm: Math.round(elegido.d * 1000) / 1000 };
}

/**
 * Un POI solo puede ser de una bodega: si sale para varias, se queda con la de más confianza
 * (y, a igualdad, la más cercana). Devuelve el mapa bodega → emparejamiento ya depurado.
 */
export function resolverConflictos(m: Map<string, Emparejamiento>): Map<string, Emparejamiento> {
  const mejorPorPoi = new Map<string, string>();
  for (const [bodegaId, e] of m) {
    const otra = mejorPorPoi.get(e.poi.id);
    const actual = otra ? m.get(otra)! : null;
    if (!actual || e.confianza > actual.confianza || (e.confianza === actual.confianza && e.distanciaKm < actual.distanciaKm)) {
      mejorPorPoi.set(e.poi.id, bodegaId);
    }
  }
  const ganadoras = new Set(mejorPorPoi.values());
  return new Map([...m].filter(([id]) => ganadoras.has(id)));
}
