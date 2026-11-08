// Emparejamiento de bodegas entre fuentes (SCOPE §7.2): ¿la bodega que trae
// esta fuente ya está en el catálogo? Señales, de más a menos fiable: NIF o
// registro de embotellador, dominio web exclusivo, nombre normalizado más
// municipio y trigramas. Por encima del umbral se vincula; en la zona dudosa
// va a revisión (nunca se crea un duplicado); por debajo, es una bodega nueva.
//
// Las supresiones del admin también son candidatas: una bodega fusionada es un
// alias del superviviente y una bodega borrada bloquea su recreación.
import { dominioWeb, esDominioGenerico } from "../lib/contacto.ts";
import { claveNombreBodega, claveTexto } from "../lib/texto.ts";
import { similitud } from "../lib/trigram.ts";
import { claveMarca } from "./bodegas.ts";

export const UMBRAL_VINCULAR = 0.9;
export const UMBRAL_REVISION = 0.6;
export const MARGEN_BODEGA = 0.05;

/** Lo que se sabe de una bodega para emparejarla (del catálogo, de una supresión o de la fuente). */
export interface DatosBodega {
  nombre: string;
  municipio?: string | null;
  web?: string | null;
  nif?: string | null;
  registroEmbotellador?: string | null;
  /** Marcas registradas (Consejo Regulador). */
  marcas?: string[];
}

export interface BodegaCatalogo extends DatosBodega {
  id: string;
}

/** Supresión del admin: 'fusion' → alias de `destinoId`; 'borrado' → no recrear. */
export interface SupresionBodega extends DatosBodega {
  supresionId: string;
  entidadId: string;
  motivo: "fusion" | "borrado";
  destinoId: string | null;
}

export type MotivoBodega =
  | "nif"
  | "registro_embotellador"
  | "dominio"
  | "dominio_compartido"
  | "nombre_municipio"
  | "nombre"
  | "nombre_otro_municipio"
  | "nombre_contenido"
  | "nombre_similar"
  | "marca";

export interface CandidatoBodega {
  /** id de la bodega viva (para alias de fusión, el superviviente). */
  id: string;
  nombre: string;
  puntuacion: number;
  motivo: MotivoBodega;
  /** Si el candidato es una bodega borrada por el admin. */
  supresionId?: string;
}

export interface ResultadoBodega {
  estado: "vinculada" | "suprimida" | "revision" | "nueva";
  bodegaId: string | null;
  supresionId: string | null;
  confianza: number;
  candidatos: CandidatoBodega[];
}

interface Preparada {
  destino: string; // id viva o "supresion:<id>"
  nombre: string;
  supresionId?: string;
  clave: string;
  municipio: string | null;
  dominio: string | null;
  nif: string | null;
  re: string | null;
  marcas: string[];
}

const normNif = (s: string | null | undefined) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null);
const normRe = (s: string | null | undefined) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null);
const normMunicipio = (s: string | null | undefined) => (s ? claveTexto(s) || null : null);
const redondear = (n: number) => Math.round(n * 1000) / 1000;

function preparar(d: DatosBodega, destino: string, supresionId?: string): Preparada {
  const dominio = dominioWeb(d.web);
  return {
    destino,
    nombre: d.nombre,
    supresionId,
    clave: claveNombreBodega(d.nombre),
    municipio: normMunicipio(d.municipio),
    dominio: dominio && !esDominioGenerico(dominio) ? dominio : null,
    nif: normNif(d.nif),
    re: normRe(d.registroEmbotellador),
    marcas: (d.marcas ?? []).map(claveMarca).filter((m) => m.length >= 4),
  };
}

function contenida(corta: string, larga: string): boolean {
  if (corta.length < 4) return false;
  const pl = new Set(larga.split(" "));
  return corta.split(" ").every((p) => pl.has(p));
}

export class EmparejadorBodegas {
  private candidatas: Preparada[];
  private usosDominio = new Map<string, number>();
  private usosMarca = new Map<string, number>();

  constructor(bodegas: BodegaCatalogo[], supresiones: SupresionBodega[] = []) {
    const vivas = new Set(bodegas.map((b) => b.id));
    this.candidatas = [
      ...bodegas.map((b) => preparar(b, b.id)),
      ...supresiones
        .filter((s) => s.motivo === "borrado" || (s.destinoId && vivas.has(s.destinoId)))
        .map((s) =>
          s.motivo === "fusion"
            ? preparar(s, s.destinoId!)
            : preparar(s, `supresion:${s.supresionId}`, s.supresionId),
        ),
    ];
    // Un dominio o una marca comparten bodegas distintas (grupos): no sirven de clave.
    for (const destino of new Set(this.candidatas.map((c) => c.destino))) {
      const deEsta = this.candidatas.filter((c) => c.destino === destino);
      for (const d of new Set(deEsta.map((c) => c.dominio).filter((x): x is string => !!x))) {
        this.usosDominio.set(d, (this.usosDominio.get(d) ?? 0) + 1);
      }
      for (const m of new Set(deEsta.flatMap((c) => c.marcas))) {
        this.usosMarca.set(m, (this.usosMarca.get(m) ?? 0) + 1);
      }
    }
  }

  get total(): number {
    return this.candidatas.length;
  }

  private puntuar(c: Preparada, s: Preparada): { puntuacion: number; motivo: MotivoBodega } {
    let mejor: { puntuacion: number; motivo: MotivoBodega } = { puntuacion: 0, motivo: "nombre_similar" };
    const probar = (puntuacion: number, motivo: MotivoBodega) => {
      if (puntuacion > mejor.puntuacion) mejor = { puntuacion, motivo };
    };

    if (s.nif && c.nif === s.nif) probar(1, "nif");
    if (s.re && c.re === s.re) probar(1, "registro_embotellador");
    if (s.dominio && c.dominio === s.dominio) {
      probar((this.usosDominio.get(s.dominio) ?? 1) === 1 ? 0.97 : 0.8, (this.usosDominio.get(s.dominio) ?? 1) === 1 ? "dominio" : "dominio_compartido");
    }

    // Municipio: igual, desconocido en algún lado, o distinto.
    const muni = !s.municipio || !c.municipio ? "sin" : s.municipio === c.municipio ? "igual" : "distinto";
    if (s.clave && c.clave) {
      if (s.clave === c.clave) {
        if (muni === "igual") probar(0.97, "nombre_municipio");
        else if (muni === "sin") probar(0.9, "nombre");
        else probar(0.5, "nombre_otro_municipio");
      } else if (contenida(s.clave, c.clave) || contenida(c.clave, s.clave)) {
        probar(muni === "igual" ? 0.92 : muni === "sin" ? 0.8 : 0.4, "nombre_contenido");
      } else {
        const t = similitud(s.clave, c.clave);
        probar(muni === "igual" ? 0.5 + 0.45 * t : muni === "sin" ? 0.9 * t : 0.6 * t, "nombre_similar");
      }
      // El nombre que da la fuente es una marca exclusiva de la candidata.
      for (const m of c.marcas) {
        if ((this.usosMarca.get(m) ?? 1) === 1 && claveNombreBodega(m) === s.clave) probar(0.85, "marca");
      }
    }

    // Pruebas en contra: NIF distinto = otra empresa; webs propias distintas = dudoso.
    let p = mejor.puntuacion;
    if (s.nif && c.nif && s.nif !== c.nif) p = Math.min(p, 0.3);
    if (s.dominio && c.dominio && s.dominio !== c.dominio) p = Math.min(p, 0.85);
    return { puntuacion: p, motivo: mejor.motivo };
  }

  /**
   * `excluir`: bodegas que no pueden ser esta (p. ej. ya vinculadas a otro registro de la misma
   * fuente: una fuente no lista dos veces la misma bodega).
   */
  emparejar(datos: DatosBodega, opciones: { excluir?: Set<string> } = {}): ResultadoBodega {
    const s = preparar(datos, "");
    const porDestino = new Map<string, CandidatoBodega>();
    for (const c of this.candidatas) {
      if (opciones.excluir?.has(c.destino)) continue;
      const { puntuacion, motivo } = this.puntuar(c, s);
      if (puntuacion <= 0.3) continue;
      const previo = porDestino.get(c.destino);
      if (!previo || puntuacion > previo.puntuacion) {
        porDestino.set(c.destino, {
          id: c.destino,
          nombre: c.nombre,
          puntuacion: redondear(puntuacion),
          motivo,
          ...(c.supresionId ? { supresionId: c.supresionId } : {}),
        });
      }
    }
    const candidatos = [...porDestino.values()].sort((a, b) => b.puntuacion - a.puntuacion).slice(0, 3);
    const [primero, segundo] = candidatos;
    const confianza = primero?.puntuacion ?? 0;
    const ventaja = confianza - (segundo?.puntuacion ?? 0);

    if (primero && confianza >= UMBRAL_VINCULAR && ventaja >= MARGEN_BODEGA) {
      return primero.supresionId
        ? { estado: "suprimida", bodegaId: null, supresionId: primero.supresionId, confianza, candidatos }
        : { estado: "vinculada", bodegaId: primero.id, supresionId: null, confianza, candidatos };
    }
    const estado = confianza >= UMBRAL_REVISION ? "revision" : "nueva";
    return { estado, bodegaId: null, supresionId: null, confianza, candidatos };
  }
}
