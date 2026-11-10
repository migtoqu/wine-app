// Ofertas de tiendas (comparador de precios, SCOPE §6.2): escritura compartida por todos los
// scrapers que traen precios (tiendas y webs de bodegas con tienda online).
// Ver la migración 20261112110000_comparador_precios.
//
// Uso en un scraper:
//   const ofertas = new RegistroOfertas(db, fuenteId, log);
//   await ofertas.preparar();                       // tienda de la fuente + supresiones
//   await ofertas.registrarOferta({ ... });         // por cada producto emparejado
//   await ofertas.refrescarVistas(urls);            // fichas que no se volvieron a pedir (incremental)
//   await ofertas.cerrar(inicio, { completa });     // al final: no vistas → no disponibles
//
// Reglas:
//   * Clave (tienda, id_externo): volver a ejecutar no duplica nada.
//   * El historial de precios lo mantiene la base de datos (trigger): solo crece cuando cambia
//     el precio.
//   * Nunca se tocan `oculta_admin` (decisión del admin) ni `estado_enlace` (comprobador de
//     enlaces), salvo reiniciar este último si cambia la URL.
//   * Supresiones del admin: un vino o una añada borrados no reciben ofertas; una fusión
//     redirige al superviviente.
//   * Una oferta que la tienda deja de listar suma ejecuciones sin ver (solo en ejecuciones
//     completas) y al llegar al umbral pasa a no disponible; no se borra (conserva historial).
import { sinError, type ClienteDb } from "./db.ts";
import type { Log } from "./log.ts";
import { cargarSupresiones, type FilaSupresion } from "./consolidacion/supresiones.ts";

/** Ejecuciones completas seguidas sin ver una oferta antes de marcarla no disponible. */
export const UMBRAL_NO_VISTAS = 3;
/** Formato por defecto cuando la tienda no lo indica (botella de 75 cl). */
export const FORMATO_POR_DEFECTO = 750;

const EAN = /^(\d{8}|\d{12,14})$/;

/** Lo que un scraper sabe de un producto de la tienda ya emparejado con el catálogo. */
export interface EntradaOferta {
  /** Identificador estable del producto en la tienda (SKU, id o ruta). */
  idExterno: string;
  vinoId: string;
  /** null si la tienda no indica la añada. */
  anadaId: string | null;
  url: string;
  precio: number | null;
  moneda?: string | null;
  formatoMl?: number | null;
  /** null = se desconoce (la oferta se lista: se da por disponible). */
  disponible?: boolean | null;
  ean?: string | null;
  registroId?: string | null;
}

/** Fila que se escribe en `ofertas` (sin tienda ni marcas de tiempo). */
export interface FilaOferta {
  id_externo: string;
  vino_id: string;
  anada_id: string | null;
  url: string;
  precio: number;
  moneda: string;
  formato_ml: number;
  disponible: boolean;
  ean: string | null;
  registro_id: string | null;
}

/** Oferta ya guardada, lo justo para comparar. */
export interface OfertaPrevia {
  id_externo: string;
  vino_id: string;
  anada_id: string | null;
  url: string;
  precio: number;
  formato_ml: number;
  disponible: boolean;
  ean: string | null;
  ejecuciones_sin_ver: number;
}

export type ResultadoOferta = "nueva" | "precio" | "actualizada" | "sin_cambios" | "omitida";

export interface ContadoresOfertas {
  nuevas: number;
  precio: number;
  actualizadas: number;
  sinCambios: number;
  omitidas: number;
  noDisponibles: number;
  /** Ofertas de fichas que no se volvieron a pedir (sin cambios) y se dan por vistas. */
  refrescadas: number;
}

// Valores de schema.org/ItemAvailability (sin el prefijo de URL).
const DISPONIBLES = new Set(["instock", "limitedavailability", "onlineonly", "preorder", "presale", "backorder"]);
const NO_DISPONIBLES = new Set(["outofstock", "soldout", "discontinued", "instoreonly"]);

/**
 * Disponibilidad a partir de schema.org (`InStock`, `https://schema.org/OutOfStock`…) o de una
 * marca propia de la tienda. null si no se puede saber.
 */
export function disponibleDesde(availability: string | null | undefined, enStock?: boolean | null): boolean | null {
  const v = (availability ?? "").trim().replace(/^https?:\/\/schema\.org\//i, "").toLowerCase();
  if (DISPONIBLES.has(v)) return true;
  if (NO_DISPONIBLES.has(v)) return false;
  return enStock ?? null;
}

/** Valida y normaliza una entrada. Devuelve la fila o el motivo por el que no hay oferta. */
export function normalizarOferta(e: EntradaOferta): { fila: FilaOferta } | { motivo: string } {
  if (!e.idExterno.trim()) return { motivo: "sin id externo" };
  if (!/^https?:\/\//i.test(e.url)) return { motivo: "URL no válida" };
  if (e.precio == null || !Number.isFinite(e.precio) || e.precio <= 0 || e.precio >= 100_000) {
    return { motivo: "sin precio" };
  }
  const moneda = (e.moneda ?? "EUR").trim().toUpperCase() || "EUR";
  if (moneda !== "EUR") return { motivo: `moneda ${moneda}` };
  const formato = e.formatoMl ?? FORMATO_POR_DEFECTO;
  if (!Number.isInteger(formato) || formato < 50 || formato > 30_000) return { motivo: `formato ${formato}` };
  const ean = e.ean?.trim();
  return {
    fila: {
      id_externo: e.idExterno.trim(),
      vino_id: e.vinoId,
      anada_id: e.anadaId,
      url: e.url,
      precio: Math.round(e.precio * 100) / 100,
      moneda,
      formato_ml: formato,
      disponible: e.disponible ?? true,
      ean: ean && EAN.test(ean) ? ean : null,
      registro_id: e.registroId ?? null,
    },
  };
}

/** Qué supone escribir `fila` sobre la oferta previa (para contadores y logs). */
export function compararOferta(previa: OfertaPrevia | null, fila: FilaOferta): Exclude<ResultadoOferta, "omitida"> {
  if (!previa) return "nueva";
  if (Number(previa.precio) !== fila.precio) return "precio";
  const igual =
    previa.vino_id === fila.vino_id &&
    previa.anada_id === fila.anada_id &&
    previa.url === fila.url &&
    previa.formato_ml === fila.formato_ml &&
    previa.disponible === fila.disponible &&
    previa.ean === fila.ean &&
    previa.ejecuciones_sin_ver === 0;
  return igual ? "sin_cambios" : "actualizada";
}

/**
 * Destino de una entidad según las supresiones del admin: la propia si no hay supresión, el
 * superviviente (siguiendo fusiones encadenadas) o null si se borró.
 */
export function resolverSupresion(id: string, supresiones: Map<string, FilaSupresion>): string | null {
  let actual = id;
  for (let saltos = 0; saltos < 20; saltos++) {
    const s = supresiones.get(actual);
    if (!s) return actual;
    if (s.motivo !== "fusion" || !s.fusionada_en) return null;
    actual = s.fusionada_en;
  }
  return null;
}

export class RegistroOfertas {
  private db: ClienteDb;
  private fuenteId: string;
  private log: Log;
  private tienda: { id: string; nombre: string } | null = null;
  private previas = new Map<string, OfertaPrevia>();
  private supVinos = new Map<string, FilaSupresion>();
  private supAnadas = new Map<string, FilaSupresion>();
  readonly contadores: ContadoresOfertas = {
    nuevas: 0,
    precio: 0,
    actualizadas: 0,
    sinCambios: 0,
    omitidas: 0,
    noDisponibles: 0,
    refrescadas: 0,
  };

  constructor(db: ClienteDb, fuenteId: string, log: Log) {
    this.db = db;
    this.fuenteId = fuenteId;
    this.log = log;
  }

  /** id de la tienda de esta fuente (null si no hay o está desactivada). */
  get tiendaId(): string | null {
    return this.tienda?.id ?? null;
  }

  /**
   * Carga la tienda de la fuente, sus ofertas y las supresiones de vinos y añadas. Sin tienda
   * activa devuelve false y `registrarOferta` no escribe nada.
   */
  async preparar(): Promise<boolean> {
    const tienda = sinError(
      await this.db.from("tiendas").select("id, nombre, activa").eq("fuente_id", this.fuenteId).maybeSingle(),
      "leer tienda",
    );
    if (!tienda || !tienda.activa) {
      this.log.warn(tienda ? `Tienda «${tienda.nombre}» desactivada: no se guardan ofertas` : "La fuente no tiene tienda: no se guardan ofertas");
      return false;
    }
    this.tienda = { id: tienda.id, nombre: tienda.nombre };

    for (let desde = 0; ; desde += 1000) {
      const filas = sinError(
        await this.db
          .from("ofertas")
          .select("id_externo, vino_id, anada_id, url, precio, formato_ml, disponible, ean, ejecuciones_sin_ver")
          .eq("tienda_id", tienda.id)
          .order("id")
          .range(desde, desde + 999),
        "leer ofertas",
      );
      for (const f of filas) this.previas.set(f.id_externo, { ...f, precio: Number(f.precio) });
      if (filas.length < 1000) break;
    }

    for (const s of await cargarSupresiones(this.db, "vino")) this.supVinos.set(s.entidad_id, s);
    for (const s of await cargarSupresiones(this.db, "anada")) this.supAnadas.set(s.entidad_id, s);
    return true;
  }

  /** Upsert de la oferta de un producto emparejado. */
  async registrarOferta(e: EntradaOferta): Promise<ResultadoOferta> {
    if (!this.tienda) return "omitida";
    const n = normalizarOferta(e);
    if ("motivo" in n) {
      this.contadores.omitidas++;
      this.log.debug(`oferta omitida (${n.motivo}): ${e.url}`);
      return "omitida";
    }
    const fila = n.fila;

    // Supresiones: la añada manda (su vino lo deriva la base de datos).
    const vinoId = resolverSupresion(fila.vino_id, this.supVinos);
    const anadaId = fila.anada_id ? resolverSupresion(fila.anada_id, this.supAnadas) : null;
    if (!vinoId || (fila.anada_id && !anadaId)) {
      this.contadores.omitidas++;
      this.log.info(`oferta omitida (suprimida por el admin): ${fila.url}`);
      return "omitida";
    }
    fila.vino_id = vinoId;
    fila.anada_id = anadaId;

    const previa = this.previas.get(fila.id_externo) ?? null;
    const resultado = compararOferta(previa, fila);
    const ahora = new Date().toISOString();
    sinError(
      await this.db.from("ofertas").upsert(
        {
          tienda_id: this.tienda.id,
          ...fila,
          visto_por_ultima_vez: ahora,
          ejecuciones_sin_ver: 0,
          // Una URL nueva se vuelve a comprobar; si no, el estado es del comprobador.
          ...(previa && previa.url !== fila.url ? { estado_enlace: "sin_comprobar" as const } : {}),
        },
        { onConflict: "tienda_id,id_externo" },
      ),
      "guardar oferta",
    );
    this.previas.set(fila.id_externo, { ...fila, ejecuciones_sin_ver: 0 });

    if (resultado === "nueva") this.contadores.nuevas++;
    else if (resultado === "precio") {
      this.contadores.precio++;
      this.log.info(`precio ${previa!.precio} → ${fila.precio} €: ${fila.url}`);
    } else if (resultado === "actualizada") this.contadores.actualizadas++;
    else this.contadores.sinCambios++;
    return resultado;
  }

  /**
   * Rastreo incremental: las fichas de `urls` siguen publicadas pero no se volvieron a pedir porque
   * no cambiaron. Sus ofertas cuentan como vistas en esta ejecución (sin tocar precio ni datos), así
   * `cerrar()` no las marca como no vistas. Devuelve cuántas ofertas se refrescaron.
   */
  async refrescarVistas(urls: string[]): Promise<number> {
    if (!this.tienda || urls.length === 0) return 0;
    const ahora = new Date().toISOString();
    let n = 0;
    for (let i = 0; i < urls.length; i += 100) {
      const filas = sinError(
        await this.db
          .from("ofertas")
          .update({ visto_por_ultima_vez: ahora, ejecuciones_sin_ver: 0 })
          .eq("tienda_id", this.tienda.id)
          .in("url", urls.slice(i, i + 100))
          .select("id_externo"),
        "refrescar ofertas vistas",
      );
      for (const f of filas ?? []) {
        const previa = this.previas.get(f.id_externo);
        if (previa) previa.ejecuciones_sin_ver = 0;
      }
      n += (filas ?? []).length;
    }
    this.contadores.refrescadas += n;
    return n;
  }

  /**
   * Fin de la ejecución. Solo si fue completa (sin --limite, sin parada ni volumen anómalo): las
   * ofertas de la tienda no vistas desde `inicio` suman una ejecución sin ver y, al llegar al
   * umbral, pasan a no disponibles. Devuelve cuántas pasaron a no disponibles.
   */
  async cerrar(inicio: Date, opciones: { completa: boolean; umbral?: number }): Promise<number> {
    const c = this.contadores;
    if (this.tienda) {
      this.log.info(
        `Ofertas (${this.tienda.nombre}): ${c.nuevas} nuevas, ${c.precio} con cambio de precio, ` +
          `${c.actualizadas} actualizadas, ${c.sinCambios} sin cambios, ${c.omitidas} omitidas` +
          (c.refrescadas ? `, ${c.refrescadas} refrescadas (fichas sin cambios)` : ""),
      );
    }
    if (!this.tienda || !opciones.completa) return 0;
    const n = sinError(
      await this.db.rpc("marcar_ofertas_no_vistas", {
        p_tienda: this.tienda.id,
        p_inicio: inicio.toISOString(),
        p_umbral: opciones.umbral ?? UMBRAL_NO_VISTAS,
      }),
      "marcar ofertas no vistas",
    );
    c.noDisponibles = n ?? 0;
    if (c.noDisponibles > 0) this.log.info(`${c.noDisponibles} ofertas pasan a no disponibles (no vistas)`);
    return c.noDisponibles;
  }
}
