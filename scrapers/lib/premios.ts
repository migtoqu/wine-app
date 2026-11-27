// Premios y puntuaciones (migración 20261127183538_premios): emparejamiento de un premio leído
// de un certamen con un vino del catálogo, y guardado idempotente en `premios` + `registros_fuente`.
//
// Un certamen no crea bodegas ni vinos: si el vino no está en el catálogo, el registro queda
// 'pendiente' y se vuelve a intentar en cada ejecución (el listado se relee entero). Solo va a la
// cola de revisión del admin cuando hay una bodega clara y vinos parecidos dentro de ella.
import {
  EmparejadorBodegas, UMBRAL_REVISION, type BodegaCatalogo, type CandidatoBodega, type SupresionBodega,
} from "../emparejamiento/entidades.ts";
import { claveVino, EmparejadorVinos, type SupresionVino, type VinoCatalogo } from "../emparejamiento/vinos.ts";
import { decisionAdmin, type EstadoAdminRegistro } from "./consolidacion/supresiones.ts";
import { sinError, type ClienteDb } from "./db.ts";
import type { Contadores } from "./ejecucion.ts";
import type { Log } from "./log.ts";
import { claveTexto, limpiarEspacios, quitarTildes } from "./texto.ts";

export type Medalla = "gran_oro" | "oro" | "plata" | "bronce";
type TipoVino = VinoCatalogo["tipo"];

/** Un premio tal como lo da el certamen, ya normalizado. */
export interface PremioLeido {
  /** Único dentro del certamen (y estable entre ejecuciones). */
  idExterno: string;
  url: string | null;
  /** Nombre del vino sin la añada. */
  nombre: string;
  anio: number | null;
  edicion: number;
  medalla: Medalla | null;
  puntos: number | null;
  distincion: string | null;
  mencion: string | null;
  productor: string | null;
  denominacion: string | null;
  tipo: TipoVino;
  /** Lo leído tal cual (para registros_fuente.datos). */
  crudo: Record<string, unknown>;
}

export interface VinoPremiable extends VinoCatalogo {
  /** Nombre de su D.O. (para el emparejamiento sin bodega). */
  denominacion: string | null;
}

export interface ResultadoPremio {
  estado: "emparejado" | "revision" | "pendiente";
  vinoId: string | null;
  bodegaId: string | null;
  confianza: number;
  motivo: string;
  candidatos: CandidatoBodega[];
  vinos: { id: string; nombre: string; puntuacion: number }[];
}

const ANIO_FINAL = /\s+((?:19[5-9]|20[0-4])\d)\s*$/;

/** «Salvueros 2025» → { nombre: «Salvueros», anio: 2025 }; «Bertola Cream 12 Años» → sin añada. */
export function separarAnada(titulo: string): { nombre: string; anio: number | null } {
  const t = limpiarEspacios(titulo);
  const m = t.match(ANIO_FINAL);
  if (!m) return { nombre: t, anio: null };
  return { nombre: t.slice(0, m.index).trim(), anio: Number(m[1]) };
}

/** Tipo de vino que dice el propio nombre o la categoría del certamen (null si no lo dice). */
export function tipoDeNombre(nombre: string, categoria: string | null = null): TipoVino {
  const t = ` ${quitarTildes(`${nombre} ${categoria ?? ""}`).toLowerCase()} `;
  if (/ (espumoso|brut|cava|ancestral|sparkling) /.test(t)) return "espumoso";
  if (/ (generoso|fino|manzanilla|amontillado|oloroso|palo cortado|cream|pedro ximenez|px) /.test(t)) return "generoso";
  if (/ (rosado|rose|clarete) /.test(t)) return "rosado";
  if (/ (blanco|white|blanc) /.test(t)) return "blanco";
  if (/ (tinto|red) /.test(t)) return "tinto";
  return null;
}

/** Clave de D.O. comparable: «Rioja DOCa», «D.O. Rioja» y «Rioja» → «rioja». */
export function claveDenominacion(nombre: string | null | undefined): string {
  if (!nombre) return "";
  return claveTexto(nombre)
    .replace(/\b(d ?o ?ca|d ?o ?p|d ?o ?q|d ?o|vino de la tierra( de)?|vt|igp|vinos de pago|vino de pago|pago)\b/g, " ")
    .replace(/\b(gran reserva|reserva|guarda superior|de paraje calificado)\b/g, " ") // «Cava Gran Reserva»
    .replace(/\s+/g, " ")
    .trim();
}

function mismaDenominacion(a: string | null, b: string | null): boolean {
  const x = claveDenominacion(a);
  const y = claveDenominacion(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y));
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const PALABRAS_TIPO = new Set(["tinto", "blanco", "rosado", "rose", "clarete"]);

export class EmparejadorPremios {
  private bodegas: EmparejadorBodegas;
  private vinos: EmparejadorVinos;
  private porCanon = new Map<string, VinoPremiable[]>();
  private bodegaDe = new Map<string, string>();

  constructor(
    bodegas: BodegaCatalogo[],
    vinos: VinoPremiable[],
    supresiones: { bodegas?: SupresionBodega[]; vinos?: SupresionVino[] } = {},
  ) {
    this.bodegas = new EmparejadorBodegas(bodegas, supresiones.bodegas ?? []);
    this.vinos = new EmparejadorVinos(vinos, [], supresiones.vinos ?? []);
    for (const v of vinos) {
      this.bodegaDe.set(v.id, v.bodegaId);
      const k = claveVino(v.nombre, v.tipo);
      if (k) this.porCanon.set(k, [...(this.porCanon.get(k) ?? []), v]);
    }
  }

  get totalBodegas(): number {
    return this.bodegas.total;
  }

  bodegaDelVino(vinoId: string): string | null {
    return this.bodegaDe.get(vinoId) ?? null;
  }

  emparejar(p: PremioLeido): ResultadoPremio {
    const eb = p.productor
      ? this.bodegas.emparejar({ nombre: p.productor })
      : { estado: "nueva" as const, bodegaId: null, confianza: 0, candidatos: [] };
    const base = { candidatos: eb.candidatos, vinos: [] as ResultadoPremio["vinos"] };
    // Bodegas en las que buscar el vino: la vinculada o las candidatas razonables (un nombre de
    // vino idéntico dentro de una candidata confirma la bodega: razón social ≠ marca).
    const bodegas =
      eb.estado === "vinculada"
        ? [eb.bodegaId!]
        : eb.candidatos.filter((c) => !c.supresionId && c.puntuacion >= UMBRAL_REVISION).map((c) => c.id);
    const parecidos: ResultadoPremio["vinos"] = [];
    for (const bodegaId of bodegas) {
      const r = this.vinos.emparejar({ bodegaId, nombre: p.nombre, tipo: p.tipo, crianza: null, ean: null });
      if (r.estado === "vinculado") {
        const conf = eb.estado === "vinculada" ? 1 : r3(0.5 + 0.5 * (eb.candidatos.find((c) => c.id === bodegaId)?.puntuacion ?? 0));
        return { ...base, estado: "emparejado", vinoId: r.vinoId, bodegaId, confianza: conf, motivo: `vino_${r.motivo}` };
      }
      if (r.estado === "revision" && r.motivo === "parecido") parecidos.push(...r.candidatos);
    }

    // Sin bodega reconocible: un nombre de vino único en todo el catálogo, de la misma D.O. y sin
    // un tipo en el nombre que el premio no diga («Salvueros» rosado ≠ «Salvueros Tinto»).
    const canon = claveVino(p.nombre, p.tipo);
    const iguales = canon.length >= 5 ? (this.porCanon.get(canon) ?? []) : [];
    const tiposDe = (n: string) => new Set(claveTexto(n).split(" ").filter((w) => PALABRAS_TIPO.has(w)));
    const tiposPremio = tiposDe(p.nombre);
    if (
      iguales.length === 1 &&
      mismaDenominacion(iguales[0]!.denominacion, p.denominacion) &&
      (p.tipo === null || iguales[0]!.tipo === null || iguales[0]!.tipo === p.tipo) &&
      [...tiposDe(iguales[0]!.nombre)].every((w) => tiposPremio.has(w))
    ) {
      const v = iguales[0]!;
      return { ...base, estado: "emparejado", vinoId: v.id, bodegaId: v.bodegaId, confianza: 0.85, motivo: "vino_unico_do" };
    }

    if (parecidos.length > 0 && (eb.estado === "vinculada" || eb.estado === "revision")) {
      return {
        ...base, vinos: parecidos.slice(0, 3), estado: "revision", vinoId: null, bodegaId: null,
        confianza: eb.confianza, motivo: "vino parecido en la bodega",
      };
    }
    return {
      ...base, estado: "pendiente", vinoId: null, bodegaId: null, confianza: eb.confianza,
      motivo: eb.estado === "vinculada" ? "vino fuera del catálogo" : "bodega fuera del catálogo",
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Guardado
// ---------------------------------------------------------------------------------------------

interface RegistroPrevio extends EstadoAdminRegistro {
  id: string;
  id_externo: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
}

interface PremioPrevio {
  id: string;
  id_externo: string;
  vino_id: string;
  anio: number | null;
  edicion: number;
  medalla: string | null;
  puntos: number | null;
  distincion: string | null;
  mencion: string | null;
  url: string | null;
}

export interface ContadoresPremios {
  emparejados: number;
  pendientes: number;
}

/** Lee el catálogo, empareja y guarda los premios de un certamen. */
export class GuardadoPremios {
  private certamenId = "";
  private registros = new Map<string, RegistroPrevio>();
  private premios = new Map<string, PremioPrevio>();
  private vinosVivos = new Set<string>();
  readonly resumen: ContadoresPremios = { emparejados: 0, pendientes: 0 };

  private db: ClienteDb;
  private fuenteId: string;
  private log: Log;
  private contadores: Contadores;

  constructor(db: ClienteDb, fuenteId: string, log: Log, contadores: Contadores) {
    this.db = db;
    this.fuenteId = fuenteId;
    this.log = log;
    this.contadores = contadores;
  }

  /** Carga certamen, premios y registros previos y el catálogo; devuelve el emparejador. */
  async preparar(slugCertamen: string, cargar: (db: ClienteDb) => Promise<EmparejadorPremios>): Promise<EmparejadorPremios> {
    const c = sinError(await this.db.from("certamenes").select("id").eq("slug", slugCertamen).maybeSingle(), "leer certamen");
    if (!c) throw new Error(`No existe el certamen '${slugCertamen}' (¿falta la migración?)`);
    this.certamenId = c.id;
    for (let d = 0; ; d += 1000) {
      const filas = sinError(
        await this.db.from("registros_fuente")
          .select("id, id_externo, entidad_tipo, entidad_id, supresion_id, decision, decision_tipo, decision_id")
          .eq("fuente_id", this.fuenteId).order("id").range(d, d + 999),
        "leer registros",
      );
      for (const f of filas) this.registros.set(f.id_externo, f);
      if (filas.length < 1000) break;
    }
    for (let d = 0; ; d += 1000) {
      const filas = sinError(
        await this.db.from("premios")
          .select("id, id_externo, vino_id, anio, edicion, medalla, puntos, distincion, mencion, url")
          .eq("certamen_id", this.certamenId).order("id").range(d, d + 999),
        "leer premios",
      );
      for (const f of filas) this.premios.set(f.id_externo, { ...f, puntos: f.puntos == null ? null : Number(f.puntos) });
      if (filas.length < 1000) break;
    }
    const emp = await cargar(this.db);
    this.log.info(`Certamen ${slugCertamen}: ${this.premios.size} premios y ${this.registros.size} registros previos; ${emp.totalBodegas} bodegas candidatas`);
    return emp;
  }

  /** Recuerda qué vinos existen (para no reutilizar un vínculo a un vino borrado). */
  conocerVinos(ids: Iterable<string>) {
    for (const id of ids) this.vinosVivos.add(id);
  }

  /**
   * Resultado de un premio teniendo en cuenta lo ya decidido: la decisión del admin manda y un
   * vínculo de una ejecución anterior se mantiene (estable aunque cambie el emparejador).
   */
  resolver(p: PremioLeido, emp: EmparejadorPremios): ResultadoPremio | { estado: "descartado"; motivo: string } {
    const previo = this.registros.get(p.idExterno);
    const decision = decisionAdmin(previo);
    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar") return { estado: "descartado", motivo: "decisión del admin" };
    const fijo = (vinoId: string, motivo: string): ResultadoPremio => ({
      estado: "emparejado", vinoId, bodegaId: emp.bodegaDelVino(vinoId), confianza: 1, motivo, candidatos: [], vinos: [],
    });
    if (decision?.tipo === "asociar" && decision.entidad === "vino" && this.vinosVivos.has(decision.id)) return fijo(decision.id, "admin");
    if (previo?.entidad_tipo === "vino" && previo.entidad_id && this.vinosVivos.has(previo.entidad_id)) {
      return fijo(previo.entidad_id, "vinculado antes");
    }
    return emp.emparejar(p);
  }

  /** Guarda un lote (una página del listado): registros y, si hay vino, el premio. */
  async guardarLote(lote: { p: PremioLeido; r: ResultadoPremio | { estado: "descartado"; motivo: string } }[]) {
    if (lote.length === 0) return;
    const ahora = new Date().toISOString();
    const registros = sinError(
      await this.db.from("registros_fuente").upsert(
        lote.map(({ p, r }) => {
          const vinoId = r.estado === "emparejado" ? r.vinoId : null;
          return {
            fuente_id: this.fuenteId,
            id_externo: p.idExterno,
            url: p.url,
            datos: JSON.parse(JSON.stringify({
              ...p.crudo,
              nombre: p.nombre,
              anio: p.anio,
              edicion: p.edicion,
              emparejamiento: "candidatos" in r
                ? { estado: r.estado, motivo: r.motivo, confianza: r.confianza, candidatos: r.candidatos, vinos: r.vinos }
                : { estado: r.estado, motivo: r.motivo },
            })),
            entidad_tipo: vinoId ? ("vino" as const) : null,
            entidad_id: vinoId,
            confianza_emparejamiento: "confianza" in r ? Math.min(1, Math.max(0, r.confianza)) : null,
            estado_emparejamiento:
              r.estado === "emparejado" ? ("emparejado" as const)
              : r.estado === "revision" ? ("revision" as const)
              : r.estado === "descartado" ? ("descartado" as const)
              : ("pendiente" as const),
            visto_por_ultima_vez: ahora,
          };
        }),
        { onConflict: "fuente_id,id_externo" },
      ).select("id, id_externo"),
      "guardar registros",
    );
    const registroDe = new Map(registros.map((x) => [x.id_externo, x.id]));

    const filas = [];
    const borrar: string[] = [];
    for (const { p, r } of lote) {
      const previo = this.premios.get(p.idExterno);
      if (r.estado !== "emparejado") {
        if (r.estado === "descartado") {
          this.contadores.descartados++;
          if (previo) borrar.push(previo.id);
        } else if (r.estado === "revision") this.contadores.revision++;
        else this.resumen.pendientes++;
        continue;
      }
      this.resumen.emparejados++;
      const fila = {
        certamen_id: this.certamenId,
        vino_id: r.vinoId!,
        anio: p.anio,
        edicion: p.edicion,
        medalla: p.medalla,
        puntos: p.puntos,
        distincion: p.distincion,
        mencion: p.mencion,
        url: p.url,
        id_externo: p.idExterno,
        fuente_id: this.fuenteId,
        registro_id: registroDe.get(p.idExterno) ?? null,
        visto_por_ultima_vez: ahora,
      };
      if (!previo) this.contadores.nuevos++;
      else if (
        previo.vino_id !== fila.vino_id || previo.anio !== fila.anio || previo.edicion !== fila.edicion ||
        previo.medalla !== fila.medalla || previo.puntos !== fila.puntos || previo.distincion !== fila.distincion ||
        previo.mencion !== fila.mencion || previo.url !== fila.url
      ) this.contadores.actualizados++;
      else this.contadores.sinCambios++;
      filas.push(fila);
    }
    // oculto_admin no va en el upsert: lo decide el admin y se conserva.
    if (filas.length) sinError(await this.db.from("premios").upsert(filas, { onConflict: "certamen_id,id_externo" }), "guardar premios");
    if (borrar.length) sinError(await this.db.from("premios").delete().in("id", borrar), "borrar premios descartados");
  }
}
