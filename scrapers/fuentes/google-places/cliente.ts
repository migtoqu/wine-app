// Cliente mínimo de Google Places API (New). Desactivado si falta GOOGLE_PLACES_API_KEY.
//
// Términos (developers.google.com/maps/documentation/places/web-service/policies, 2026-11):
//   · place_id: se puede guardar indefinidamente → es lo único que se escribe en la BD.
//   · lat/lng: caché de 30 días como mucho → aquí solo se usan en memoria para verificar el emparejamiento.
//   · resto (valoración, horario, teléfono, web, fotos): no se guarda; se pide al mostrarlo, con
//     atribución «Google Maps», y no se mezcla en un mapa que no sea de Google.
// Coste: Text Search con id+displayName+location es la SKU «Text Search Pro» (5.000 gratis/mes).
import { distanciaKm, type Coordenadas } from "../../emparejamiento/lugar.ts";
import { similitud } from "../../lib/trigram.ts";
import { claveNombreBodega } from "../../lib/texto.ts";

export const URL_TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";
export const URL_DETALLES = (placeId: string) => `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

/** Lo justo para verificar: id (guardable) y nombre/ubicación (solo en memoria). */
export const CAMPOS_BUSQUEDA = "places.id,places.displayName,places.location,places.types";
/** Al mostrar una ficha (SKU Place Details Enterprise + Photos): nunca se persiste. */
export const CAMPOS_DETALLE = "id,displayName,rating,userRatingCount,regularOpeningHours,nationalPhoneNumber,websiteUri,googleMapsUri,photos";

export class PresupuestoAgotado extends Error {}

export interface LugarGoogle {
  id: string;
  nombre: string;
  punto: Coordenadas | null;
  tipos: string[];
}

export interface OpcionesCliente {
  clave: string;
  /** Máximo de peticiones en esta ejecución. */
  presupuesto: number;
  fetch?: typeof fetch;
}

export class ClientePlaces {
  private clave: string;
  private fetchFn: typeof fetch;
  restantes: number;
  peticiones = 0;

  constructor(o: OpcionesCliente) {
    this.clave = o.clave;
    this.restantes = o.presupuesto;
    this.fetchFn = o.fetch ?? fetch;
  }

  /** null si no hay clave: la integración queda desactivada. */
  static desdeEntorno(presupuesto: number, env: NodeJS.ProcessEnv = process.env): ClientePlaces | null {
    const clave = env.GOOGLE_PLACES_API_KEY?.trim();
    return clave ? new ClientePlaces({ clave, presupuesto }) : null;
  }

  private async pedir(url: string, init: RequestInit, campos: string): Promise<unknown> {
    if (this.restantes <= 0) throw new PresupuestoAgotado("Presupuesto de peticiones a Google Places agotado");
    this.restantes--;
    this.peticiones++;
    const res = await this.fetchFn(url, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.clave, "X-Goog-FieldMask": campos },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  /** Text Search sesgado a 5 km del punto (si se conoce). */
  async buscar(texto: string, cerca: Coordenadas | null): Promise<LugarGoogle[]> {
    const cuerpo = {
      textQuery: texto,
      languageCode: "es",
      regionCode: "ES",
      pageSize: 5,
      ...(cerca ? { locationBias: { circle: { center: { latitude: cerca.lat, longitude: cerca.lon }, radius: 5000 } } } : {}),
    };
    const j = (await this.pedir(URL_TEXT_SEARCH, { method: "POST", body: JSON.stringify(cuerpo) }, CAMPOS_BUSQUEDA)) as {
      places?: { id: string; displayName?: { text?: string }; location?: { latitude: number; longitude: number }; types?: string[] }[];
    };
    return (j.places ?? []).map((p) => ({
      id: p.id,
      nombre: p.displayName?.text ?? "",
      punto: p.location ? { lat: p.location.latitude, lon: p.location.longitude } : null,
      tipos: p.types ?? [],
    }));
  }

  /** Detalles para mostrar en el momento (no guardar). */
  detalles(placeId: string): Promise<unknown> {
    return this.pedir(URL_DETALLES(placeId), { method: "GET" }, CAMPOS_DETALLE);
  }
}

/**
 * El mejor lugar de Google para la bodega: nombre parecido (trigramas ≥ 0,6 o uno contenido en
 * el otro) y, si se conoce la ubicación, a ≤ 3 km. null si ninguno convence.
 */
export function elegirLugar(
  nombre: string, cerca: Coordenadas | null, lugares: LugarGoogle[],
): { lugar: LugarGoogle; confianza: number } | null {
  const k = claveNombreBodega(nombre);
  let mejor: { lugar: LugarGoogle; confianza: number } | null = null;
  for (const l of lugares) {
    const kl = claveNombreBodega(l.nombre);
    if (!kl) continue;
    const contenido = k.length >= 4 && kl.length >= 4 && (kl.includes(k) || k.includes(kl));
    let c = Math.max(similitud(k, kl), contenido ? 0.85 : 0);
    if (cerca) {
      if (!l.punto) continue;
      const d = distanciaKm(cerca, l.punto);
      if (d > 3) continue;
      if (d <= 0.5) c = Math.min(1, c + 0.05);
    }
    if (c >= 0.6 && (!mejor || c > mejor.confianza)) mejor = { lugar: l, confianza: Math.round(c * 1000) / 1000 };
  }
  return mejor;
}
