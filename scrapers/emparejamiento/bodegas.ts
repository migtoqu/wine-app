// Emparejamiento vino de tienda → bodega del catálogo (SCOPE §7.2).
// Señales, de más a menos fiable:
//   1. nombre de la bodega que da la tienda frente al nombre de la bodega;
//   2. nombre del vino frente a las «Marcas» que publica el Consejo Regulador
//      (la marca registrada manda aunque la tienda atribuya el vino a otra filial);
//      y nombre de bodega de la tienda que es una marca registrada («Bodegas Briego»);
//   3. grupo / propietario (item_brand, «Bodeguero»), solo como apoyo.
// La puntuación es la mejor señal. Se empareja si supera el umbral y saca
// suficiente margen a la segunda bodega; si no, el registro va a revisión.
import { claveNombreBodega, claveTexto } from "../lib/texto.ts";
import { similitud } from "../lib/trigram.ts";

/** Umbral y margen por defecto (ajustados con el dry-run real; ver README). */
export const UMBRAL = 0.85;
export const MARGEN = 0.05;

export interface BodegaCandidata {
  id: string;
  nombre: string;
  /** claveNombreBodega(nombre) */
  clave: string;
  /** claveTexto de cada marca */
  marcas: string[];
}

export interface SenalesVino {
  /** Nombre de bodega según la tienda («Bodegas Conde de San Cristóbal»). */
  bodega: string | null;
  /** Grupo o propietario según la tienda («Pelayo de la Mata y Pobes»). */
  grupo: string[];
  /** Nombre del vino sin añada ni formato («Conde de San Cristóbal»). */
  vino: string;
}

export type Motivo =
  | "bodega_exacta"
  | "bodega_contenida"
  | "bodega_similar"
  | "bodega_es_marca"
  | "marca"
  | "marca_similar"
  | "grupo";

export interface Candidato {
  id: string;
  nombre: string;
  puntuacion: number;
  motivo: Motivo;
}

export interface ResultadoEmparejamiento {
  estado: "emparejado" | "revision";
  bodegaId: string | null;
  confianza: number;
  candidatos: Candidato[];
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

// Marcas registradas que no identifican a una bodega («RIBERA DUERO» figura como marca de Protos).
const MARCAS_GENERICAS = new Set(["ribera duero", "ribera del duero", "vino", "vinos", "tinto", "rosado", "blanco"]);

/** Clave de marca: sin añadas («Dominio de Adrada 2022» → «dominio de adrada»). */
export function claveMarca(marca: string): string {
  return claveTexto(marca)
    .replace(/\b(19|20)\d\d\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Todas las palabras de `corta` están en `larga`? (claves ya normalizadas) */
function contenida(corta: string, larga: string): boolean {
  const pc = corta.split(" ");
  const pl = new Set(larga.split(" "));
  return corta.length >= 4 && pc.every((p) => pl.has(p));
}

/** ¿`texto` empieza por la marca completa (respetando palabras)? */
function empiezaPor(texto: string, marca: string): boolean {
  return texto === marca || texto.startsWith(marca + " ");
}

export class Emparejador {
  private bodegas: BodegaCandidata[];
  // marca → nº de bodegas que la publican (una marca compartida vale menos).
  private usosMarca = new Map<string, number>();
  private umbral: number;
  private margen: number;

  constructor(bodegas: BodegaCandidata[], opciones: { umbral?: number; margen?: number } = {}) {
    this.bodegas = bodegas.map((b) => ({
      ...b,
      marcas: [...new Set(b.marcas.map(claveMarca))].filter((m) => m.length >= 4 && !MARCAS_GENERICAS.has(m)),
    }));
    this.umbral = opciones.umbral ?? UMBRAL;
    this.margen = opciones.margen ?? MARGEN;
    for (const b of this.bodegas) {
      for (const m of b.marcas) this.usosMarca.set(m, (this.usosMarca.get(m) ?? 0) + 1);
    }
  }

  get total(): number {
    return this.bodegas.length;
  }

  private puntuar(b: BodegaCandidata, s: SenalesVino): { puntuacion: number; motivo: Motivo } {
    let mejor: { puntuacion: number; motivo: Motivo } = { puntuacion: 0, motivo: "bodega_similar" };
    const probar = (puntuacion: number, motivo: Motivo) => {
      if (puntuacion > mejor.puntuacion) mejor = { puntuacion, motivo };
    };

    if (s.bodega) {
      const clave = claveNombreBodega(s.bodega);
      if (clave === b.clave) probar(1, "bodega_exacta");
      else if (contenida(clave, b.clave) || contenida(b.clave, clave)) probar(0.9, "bodega_contenida");
      else probar(similitud(clave, b.clave), "bodega_similar");
      // La tienda da como bodega una marca exclusiva de esta bodega («Bodegas Briego» → BRIEGO).
      for (const m of b.marcas) {
        if ((this.usosMarca.get(m) ?? 1) === 1 && claveNombreBodega(m) === clave) probar(0.9, "bodega_es_marca");
      }
    }

    const vino = claveTexto(s.vino);
    for (const m of b.marcas) {
      const unica = (this.usosMarca.get(m) ?? 1) === 1;
      if (empiezaPor(vino, m)) {
        // Marca idéntica = 1; prefijo = 0,9 + 0,05 × parte del nombre que cubre, para que
        // gane la marca más específica («EMINA PASIÓN» frente a «EMINA»).
        const cobertura = m.split(" ").length / vino.split(" ").length;
        probar(unica ? (vino === m ? 1 : 0.9 + 0.05 * cobertura) : 0.8, "marca");
      } else probar(similitud(vino, m) * (unica ? 0.9 : 0.75), "marca_similar");
    }

    for (const g of s.grupo) {
      const clave = claveNombreBodega(g);
      if (clave && (clave === b.clave || contenida(b.clave, clave))) probar(0.8, "grupo");
    }
    return mejor;
  }

  emparejar(s: SenalesVino): ResultadoEmparejamiento {
    const candidatos = this.bodegas
      .map((b) => ({ id: b.id, nombre: b.nombre, ...this.puntuar(b, s) }))
      .filter((c) => c.puntuacion > 0.3)
      .sort((a, b) => b.puntuacion - a.puntuacion)
      .slice(0, 3)
      .map((c) => ({ ...c, puntuacion: redondear(c.puntuacion) }));

    const [primero, segundo] = candidatos;
    const confianza = primero?.puntuacion ?? 0;
    const ventaja = confianza - (segundo?.puntuacion ?? 0);
    const ok = primero !== undefined && confianza >= this.umbral && ventaja >= this.margen;
    return {
      estado: ok ? "emparejado" : "revision",
      bodegaId: ok ? primero.id : null,
      confianza,
      candidatos,
    };
  }
}
