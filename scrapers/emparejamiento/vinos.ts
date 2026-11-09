// Emparejamiento de vinos dentro de su bodega (SCOPE §7.2): EAN, nombre
// normalizado y nombre canónico (sin añada, formato, D.O., artículos ni el tipo
// repetido: «TresMatas Reserva 21- Etiquetado nutricional» = «TresMatas
// Reserva»). Un nombre muy parecido (mismo tipo y crianza) va a revisión en
// vez de crear un vino casi duplicado; si el nombre canónico coincide con más
// de un vino de la bodega, también. Las supresiones del admin cuentan: un vino
// fusionado es alias del superviviente y uno borrado no se recrea.
import { claveTexto, quitarTildes } from "../lib/texto.ts";
import { similitud } from "../lib/trigram.ts";

export const UMBRAL_VINO_PARECIDO = 0.8;

// D.O. al final del nombre («Montecillo Singladuras Ribera del Duero»).
const DO_FINAL =
  /\s(?:(?:d\s?o\s?ca?|d\s?o\s?p|v\s?t|i\s?g\s?p|vino de la tierra(?: de)?)\s)?(?:ribera del duero|ribera duero|rioja alavesa|rioja alta|rioja oriental|rioja|rueda|toro|cigales|bierzo|arlanza|tierra de leon|castilla y leon|castilla)\s*$/;
// Palabras que no distinguen un vino de otro de la misma bodega.
const VACIAS_VINO = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "d", "the", "vino", "vinos"]);
// Una clave hecha solo de estas palabras no identifica a ningún vino («100% tempranillo»).
const DESCRIPTIVAS = new Set([
  "tinto", "blanco", "rosado", "rose", "joven", "roble", "crianza", "reserva", "gran", "barrica", "seleccion",
  "vendimia", "seleccionada", "tempranillo", "tinta", "fino", "verdejo", "albillo", "mayor", "garnacha", "viura",
  "godello", "albarino", "mazuelo", "graciano", "maturana", "cabernet", "sauvignon", "merlot", "syrah", "malbec",
  "chardonnay", "meses", "ribera", "duero", "rioja", "rueda", "toro", "cigales",
]);

/**
 * Clave canónica de un nombre de vino: sin añada ni rangos de añadas («22-23», «20/21», «21-»),
 * formato («(6 bot», «Mágnum», «75 cl», «1,5 l»), sufijos de ficha («Etiquetado nutricional»),
 * D.O. final, artículos ni «tinto» en un tinto («Heredad de Peñalosa Tinto Roble»). «Blanco» y
 * «rosado» se conservan: muchas marcas tienen las tres versiones y el tipo del catálogo a veces
 * está mal («Eguren Ugarte Reserva» figura como blanco).
 * Las palabras se ordenan («Pomar de Burgos Barrica» = «Barrica Pomar de Burgos»).
 * Se conservan los números y códigos que distinguen («Corimbo I», «D1»/«M1», «Brut Nature»).
 * Devuelve "" si no queda nada que identifique al vino.
 */
export function claveVino(nombre: string, tipo: string | null = null): string {
  let t = quitarTildes(nombre).toLowerCase().replace(/[’'´`]/g, "").replace(/&/g, " y ");
  t = t
    .replace(/\(\s*\d+\s*(?:bot\w*|botellas?|uds?|unidades|x)?[^)]*\)?/g, " ") // «(6 bot»
    .replace(/\b(?:info(?:rmacion)?|etiquetado)\s+nutricional\b/g, " ")
    .replace(/\bficha\s+tecnica\b/g, " ")
    .replace(/\bnovedad\b|\bnuevo\b/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:cl|ml|l|litros?)\b/g, " ")
    .replace(/\b(?:magnum|jeroboam|estuche|caja)\b/g, " ")
    .replace(/\b(?:19[5-9]\d|20[0-4]\d)\b/g, " ")
    .replace(/\b\d{2}\s*[-/–]\s*\d{2}\b/g, " ")
    .replace(/\b\d{2}\s*[-–](?=\s|$)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  t = (" " + t).replace(DO_FINAL, "").trim();
  const palabras = new Set(t.split(" ").filter((p) => p !== "" && !VACIAS_VINO.has(p) && !(p === "tinto" && tipo === "tinto")));
  if (![...palabras].some((p) => /[a-z]{3}/.test(p) && !DESCRIPTIVAS.has(p))) return "";
  return [...palabras].sort().join(" ");
}

const compatibles = (a: string | null, b: string | null) => a === null || b === null || a === b;

export interface VinoCatalogo {
  id: string;
  bodegaId: string;
  nombre: string;
  tipo: string | null;
  crianza: string | null;
}

export interface SupresionVino {
  supresionId: string;
  motivo: "fusion" | "borrado";
  destinoId: string | null;
  bodegaId: string | null;
  nombre: string;
  eans: string[];
}

export interface SenalesVinoBodega {
  bodegaId: string;
  nombre: string;
  tipo: string | null;
  crianza: string | null;
  ean: string | null;
}

export interface ResultadoVino {
  estado: "vinculado" | "suprimido" | "revision" | "nuevo";
  vinoId: string | null;
  supresionId: string | null;
  motivo: "ean" | "nombre" | "nombre_canonico" | "alias" | "parecido" | "ean_otra_bodega" | null;
  candidatos: { id: string; nombre: string; puntuacion: number }[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class EmparejadorVinos {
  private porBodega = new Map<string, VinoCatalogo[]>();
  private porEan = new Map<string, { vinoId: string; bodegaId: string }>();
  private supresiones: SupresionVino[];

  constructor(vinos: VinoCatalogo[], eans: { ean: string; vinoId: string }[] = [], supresiones: SupresionVino[] = []) {
    const bodegaDe = new Map<string, string>();
    for (const v of vinos) {
      this.porBodega.set(v.bodegaId, [...(this.porBodega.get(v.bodegaId) ?? []), v]);
      bodegaDe.set(v.id, v.bodegaId);
    }
    for (const e of eans) {
      const bodegaId = bodegaDe.get(e.vinoId);
      if (bodegaId) this.porEan.set(e.ean, { vinoId: e.vinoId, bodegaId });
    }
    this.supresiones = supresiones;
  }

  /** Recuerda un vino recién creado (para emparejar con él en la misma ejecución). */
  anadir(v: VinoCatalogo) {
    this.porBodega.set(v.bodegaId, [...(this.porBodega.get(v.bodegaId) ?? []), v]);
  }

  anadirEan(ean: string, vinoId: string, bodegaId: string) {
    this.porEan.set(ean, { vinoId, bodegaId });
  }

  emparejar(s: SenalesVinoBodega, opciones: { sinParecidos?: boolean } = {}): ResultadoVino {
    const vacio = { supresionId: null, candidatos: [] };
    if (s.ean) {
      const e = this.porEan.get(s.ean);
      if (e && e.bodegaId === s.bodegaId) return { ...vacio, estado: "vinculado", vinoId: e.vinoId, motivo: "ean" };
      if (e) return { ...vacio, estado: "revision", vinoId: null, motivo: "ean_otra_bodega", candidatos: [{ id: e.vinoId, nombre: "", puntuacion: 1 }] };
      const sup = this.supresiones.find((x) => x.eans.includes(s.ean!));
      if (sup) return this.resolverSupresion(sup);
    }

    const clave = claveTexto(s.nombre);
    const vinos = this.porBodega.get(s.bodegaId) ?? [];
    const exacto = vinos.find((v) => claveTexto(v.nombre) === clave);
    if (exacto) return { ...vacio, estado: "vinculado", vinoId: exacto.id, motivo: "nombre" };

    const sup = this.supresiones.find((x) => x.bodegaId === s.bodegaId && claveTexto(x.nombre) === clave);
    if (sup) return this.resolverSupresion(sup);

    // Nombre canónico: un único vino compatible (tipo y crianza) → el mismo; varios → revisión.
    const canon = claveVino(s.nombre, s.tipo);
    if (canon) {
      const iguales = vinos.filter(
        (v) => compatibles(v.tipo, s.tipo) && compatibles(v.crianza, s.crianza) && claveVino(v.nombre, v.tipo) === canon,
      );
      if (iguales.length === 1) return { ...vacio, estado: "vinculado", vinoId: iguales[0]!.id, motivo: "nombre_canonico" };
      if (iguales.length > 1 && !opciones.sinParecidos) {
        return {
          estado: "revision", vinoId: null, supresionId: null, motivo: "parecido",
          candidatos: iguales.slice(0, 3).map((v) => ({ id: v.id, nombre: v.nombre, puntuacion: 1 })),
        };
      }
      const supCanon = this.supresiones.find((x) => x.bodegaId === s.bodegaId && claveVino(x.nombre, s.tipo) === canon);
      if (supCanon) return this.resolverSupresion(supCanon);
    }

    if (!opciones.sinParecidos) {
      const parecidos = vinos
        .map((v) => ({ id: v.id, nombre: v.nombre, puntuacion: r3(similitud(clave, claveTexto(v.nombre))), v }))
        .filter((c) => c.puntuacion >= UMBRAL_VINO_PARECIDO && c.v.tipo === s.tipo && c.v.crianza === s.crianza)
        .sort((a, b) => b.puntuacion - a.puntuacion)
        .slice(0, 3)
        .map(({ id, nombre, puntuacion }) => ({ id, nombre, puntuacion }));
      if (parecidos.length > 0) {
        return { estado: "revision", vinoId: null, supresionId: null, motivo: "parecido", candidatos: parecidos };
      }
    }
    return { ...vacio, estado: "nuevo", vinoId: null, motivo: null };
  }

  private resolverSupresion(sup: SupresionVino): ResultadoVino {
    if (sup.motivo === "fusion" && sup.destinoId) {
      return { estado: "vinculado", vinoId: sup.destinoId, supresionId: null, motivo: "alias", candidatos: [] };
    }
    return { estado: "suprimido", vinoId: null, supresionId: sup.supresionId, motivo: null, candidatos: [] };
  }
}
