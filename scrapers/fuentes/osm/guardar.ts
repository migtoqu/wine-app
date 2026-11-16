// Escritura de OpenStreetMap: un registro por bodega (`bodega:<uuid>`) con lo que dicen Nominatim
// y el POI emparejado, y consolidación de ubicacion (solo si la bodega no tiene coordenadas de
// otra fuente), web y teléfono (solo si la bodega no los tiene). Origen 'otra': todo lo demás gana.
import { coordenadas, type Coordenadas } from "../../emparejamiento/lugar.ts";
import { Consolidador, type Aporte } from "../../lib/consolidacion/consolidar.ts";
import type { TipoFuente } from "../../lib/consolidacion/decidir.ts";
import { sinError, type ClienteDb } from "../../lib/db.ts";
import { puntoEwkt } from "../../lib/geo.ts";
import type { Emparejamiento } from "./emparejar.ts";
import type { Geocodificacion, Precision } from "./nominatim.ts";

export const ATRIBUCION_OSM = "© OpenStreetMap contributors (ODbL 1.0)";

export interface BodegaOsm {
  id: string;
  nombre: string;
  direccion: string | null;
  codigoPostal: string | null;
  municipio: string | null;
  provincia: string | null;
  web: string | null;
  telefono: string | null;
  ubicacion: Coordenadas | null;
  /** Quién da hoy la ubicación: otra fuente/admin ('oficial'), esta fuente ('osm') o nadie. */
  origenUbicacion: "oficial" | "osm" | null;
  /**
   * Campos (web, telefono) cuyo valor actual tiene procedencia. Uno sin procedencia es un dato
   * manual: el consolidador lo convertiría en 'admin' al aportar otro valor, así que solo se
   * aporta web/teléfono si la columna está vacía o tiene procedencia.
   */
  conProcedencia: Set<string>;
}

/** Fila del JSON de --bodegas (mismo formato que la consulta de exportación de docs/SOURCES.md). */
export interface FilaBodegaJson {
  id: string;
  nombre: string;
  direccion?: string | null;
  codigo_postal?: string | null;
  municipio?: string | null;
  provincia?: string | null;
  web?: string | null;
  telefono?: string | null;
  lat?: number | null;
  lng?: number | null;
  origen_ubicacion?: "oficial" | "osm" | null;
}

export function bodegaDeJson(f: FilaBodegaJson): BodegaOsm {
  const ubicacion = f.lat != null && f.lng != null ? { lat: f.lat, lon: f.lng } : null;
  return {
    id: f.id, nombre: f.nombre, direccion: f.direccion ?? null, codigoPostal: f.codigo_postal ?? null,
    municipio: f.municipio ?? null, provincia: f.provincia ?? null, web: f.web ?? null, telefono: f.telefono ?? null,
    ubicacion, origenUbicacion: ubicacion ? (f.origen_ubicacion ?? "oficial") : null, conProcedencia: new Set(),
  };
}

export interface Decision {
  bodega: BodegaOsm;
  geo: { mejor: Geocodificacion | null; consultas: string[] } | null;
  poi: Emparejamiento | null;
}

export interface Propuesta {
  /** Punto a escribir (null = esta fuente no da ubicación para la bodega). */
  ubicacion: { punto: Coordenadas; precision: Precision; desde: "poi" | "nominatim" } | null;
  campos: Record<string, unknown>;
  datos: Record<string, unknown>;
  url: string | null;
}

const redondear = (p: Coordenadas): Coordenadas => ({ lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6 });
const urlOsm = (id: string) => `https://www.openstreetmap.org/${id}`;

/** Qué aporta OSM a una bodega (puro: lo usan el guardado y el dry-run). */
export function proponer(d: Decision): Propuesta {
  const { bodega: b, geo, poi } = d;
  const libre = b.origenUbicacion !== "oficial";
  let ubicacion: Propuesta["ubicacion"] = null;
  if (libre) {
    if (poi) ubicacion = { punto: redondear(poi.poi.punto), precision: "exacta", desde: "poi" };
    else if (geo?.mejor) ubicacion = { punto: redondear(geo.mejor.punto), precision: geo.mejor.precision, desde: "nominatim" };
  }
  const campos: Record<string, unknown> = {
    // null retira lo que esta fuente aportó antes (p. ej. si ahora hay coordenadas oficiales).
    ubicacion: ubicacion ? puntoEwkt({ lat: ubicacion.punto.lat, lng: ubicacion.punto.lon }) : null,
    web: poi?.poi.web && (!b.web || b.conProcedencia.has("web")) ? poi.poi.web : null,
    telefono: poi?.poi.telefono && (!b.telefono || b.conProcedencia.has("telefono")) ? poi.poi.telefono : null,
  };
  const datos = {
    atribucion: ATRIBUCION_OSM,
    precision: ubicacion?.precision ?? null,
    punto: ubicacion?.punto ?? null,
    punto_desde: ubicacion?.desde ?? null,
    nominatim: geo ? { consultas: geo.consultas, resultado: geo.mejor } : null,
    poi: poi
      ? {
          id: poi.poi.id, url: urlOsm(poi.poi.id), clase: poi.poi.clase, nombre: poi.poi.nombre,
          confianza: poi.confianza, motivo: poi.motivo, distancia_km: poi.distanciaKm,
          web: poi.poi.web, telefono: poi.poi.telefono, calle: poi.poi.calle,
        }
      : null,
    // Horario del POI en sintaxis opening_hours de OSM (no hay columna de horario en bodegas).
    opening_hours: poi?.poi.horario ?? null,
  };
  const url = poi ? urlOsm(poi.poi.id) : geo?.mejor?.osm && geo.mejor.precision !== "municipio" ? urlOsm(geo.mejor.osm) : null;
  return { ubicacion, campos, datos, url };
}

/** ¿La propuesta aporta algo? (si no, no hace falta registro). */
export const aportaAlgo = (p: Propuesta) => p.ubicacion !== null || p.datos.poi !== null;

export class GuardadoOsm {
  private db: ClienteDb | null;
  private fuenteId: string;
  private consolidador: Consolidador | null;
  private tipoFuente: TipoFuente = "otra";
  /** Registros ya existentes de esta fuente: id_externo → id. */
  private registros = new Map<string, string>();

  constructor(db: ClienteDb | null, fuenteId: string | null) {
    this.db = db;
    this.fuenteId = fuenteId ?? "dry-run";
    this.consolidador = db ? new Consolidador(db) : null;
  }

  /** Bodegas activas con lo necesario para geocodificar y emparejar, y el origen de su ubicación. */
  async cargarBodegas(): Promise<BodegaOsm[]> {
    const db = this.db!;
    this.tipoFuente = sinError(await db.from("fuentes").select("tipo").eq("id", this.fuenteId).single(), "leer fuente").tipo;
    const propias = new Set<string>();
    const conProcedencia = new Map<string, Set<string>>();
    for (let desde = 0; ; desde += 1000) {
      const filas = sinError(
        await db.from("procedencia_campos").select("entidad_id, campo, fuente_id").eq("entidad_tipo", "bodega")
          .in("campo", ["ubicacion", "web", "telefono"]).order("entidad_id").order("campo").range(desde, desde + 999),
        "leer procedencia",
      );
      for (const p of filas) {
        if (p.campo === "ubicacion" && p.fuente_id === this.fuenteId) propias.add(p.entidad_id);
        const set = conProcedencia.get(p.entidad_id) ?? new Set<string>();
        set.add(p.campo);
        conProcedencia.set(p.entidad_id, set);
      }
      if (filas.length < 1000) break;
    }
    for (let desde = 0; ; desde += 1000) {
      const filas = sinError(
        await db.from("registros_fuente").select("id, id_externo").eq("fuente_id", this.fuenteId).order("id").range(desde, desde + 999),
        "leer registros",
      );
      for (const r of filas) this.registros.set(r.id_externo, r.id);
      if (filas.length < 1000) break;
    }
    const out: BodegaOsm[] = [];
    for (let desde = 0; ; desde += 1000) {
      const filas = sinError(
        await db.from("bodegas").select("id, nombre, direccion, codigo_postal, municipio, provincia, web, telefono, ubicacion")
          .eq("estado", "activa").order("id").range(desde, desde + 999),
        "leer bodegas",
      );
      for (const b of filas) {
        const ubicacion = coordenadas(b.ubicacion);
        out.push({
          id: b.id, nombre: b.nombre, direccion: b.direccion, codigoPostal: b.codigo_postal, municipio: b.municipio,
          provincia: b.provincia, web: b.web, telefono: b.telefono, ubicacion,
          origenUbicacion: ubicacion ? (propias.has(b.id) ? "osm" : "oficial") : null,
          conProcedencia: conProcedencia.get(b.id) ?? new Set(),
        });
      }
      if (filas.length < 1000) break;
    }
    return out;
  }

  /** Guarda el registro y consolida. Devuelve las columnas reescritas (o null si no hizo falta nada). */
  async guardar(b: BodegaOsm, p: Propuesta, ahora: string): Promise<string[] | null> {
    if (!this.db) return null;
    const idExterno = `bodega:${b.id}`;
    // Sin nada que aportar y sin registro previo: no se crea un registro vacío.
    if (!aportaAlgo(p) && !this.registros.has(idExterno)) return null;
    const fila = sinError(
      await this.db.from("registros_fuente").upsert(
        {
          fuente_id: this.fuenteId, id_externo: idExterno, url: p.url,
          datos: JSON.parse(JSON.stringify(p.datos)), hechos: [],
          entidad_tipo: "bodega", entidad_id: b.id,
          confianza_emparejamiento: 1, estado_emparejamiento: "emparejado", visto_por_ultima_vez: ahora,
        },
        { onConflict: "fuente_id,id_externo" },
      ).select("id").single(),
      "guardar registro",
    );
    this.registros.set(idExterno, fila.id);
    const aporte: Aporte = { registroId: fila.id, fuenteId: this.fuenteId, tipoFuente: this.tipoFuente, url: p.url, observadoEn: ahora };
    return (await this.consolidador!.consolidar("bodega", b.id, p.campos, aporte)).escritos;
  }
}
