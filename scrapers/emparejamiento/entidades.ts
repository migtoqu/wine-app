// Emparejamiento de bodegas entre fuentes (SCOPE §7.2): ¿la bodega que trae
// esta fuente ya está en el catálogo? Señales, de más a menos fiable: NIF o
// registro de embotellador, dominio web exclusivo, nombre normalizado más
// lugar (municipio, código postal o coordenadas), teléfono y trigramas. Por
// encima del umbral se vincula; en la zona dudosa va a revisión (nunca se crea
// un duplicado); por debajo, es una bodega nueva.
//
// Pruebas en contra: NIF distinto, otra provincia (un dominio de grupo nunca
// basta), webs propias sin relación entre sí, o un nombre que solo coincide en
// el municipio («Bodegas Peñafiel» ≠ «Bodegas Tierras de Peñafiel»).
//
// Las supresiones del admin también son candidatas: una bodega fusionada es un
// alias del superviviente y una bodega borrada bloquea su recreación.
import { dominioWeb, esDominioGenerico } from "../lib/contacto.ts";
import { claveNombreBodega, claveTexto } from "../lib/texto.ts";
import { similitud } from "../lib/trigram.ts";
import { claveMarca } from "./bodegas.ts";
import { codigoPostal, codigoProvincia, coordenadas, distanciaKm, municipioDeDireccion, telefonos, type Coordenadas } from "./lugar.ts";

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
  provincia?: string | null;
  codigoPostal?: string | null;
  /** Uno o varios teléfonos en texto libre. */
  telefono?: string | null;
  ubicacion?: Coordenadas | null;
  /** Dirección postal: si falta el municipio o el CP, se sacan de aquí. */
  direccion?: string | null;
}

export interface BodegaCatalogo extends DatosBodega {
  id: string;
}

/** Columnas de `bodegas` que usa el emparejador (para el `select` de cada fuente). */
export const COLUMNAS_EMPAREJAR_BODEGA =
  "id, nombre, municipio, provincia, codigo_postal, web, telefono, ubicacion, nif, registro_embotellador";

export interface FilaBodegaEmparejar {
  id: string;
  nombre: string;
  municipio: string | null;
  provincia?: string | null;
  codigo_postal?: string | null;
  web: string | null;
  telefono?: string | null;
  ubicacion?: unknown;
  nif: string | null;
  registro_embotellador: string | null;
}

/** Fila de `bodegas` (con COLUMNAS_EMPAREJAR_BODEGA) → candidata del emparejador. */
export function bodegaCatalogoDeFila(b: FilaBodegaEmparejar): BodegaCatalogo {
  return {
    id: b.id,
    nombre: b.nombre,
    municipio: b.municipio,
    provincia: b.provincia ?? null,
    codigoPostal: b.codigo_postal ?? null,
    web: b.web,
    telefono: b.telefono ?? null,
    ubicacion: coordenadas(b.ubicacion),
    nif: b.nif,
    registroEmbotellador: b.registro_embotellador,
  };
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
  | "marca"
  | "telefono";

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
  /** Clave sin espacios («bosque mata asnos» → «bosquematasnos»). */
  compacta: string;
  /** Claves de los tramos del nombre («Alejandro Fernández - Tinto Pesquera» → «tinto pesquera»…). */
  tramos: string[];
  municipio: string | null;
  cp: string | null;
  provincia: string | null;
  telefonos: string[];
  ubicacion: Coordenadas | null;
  dominio: string | null;
  /** Etiqueta del dominio sin TLD («vinotierraranda.es» → «vinotierraranda»). */
  etiqueta: string | null;
  /** Ruta de la web sin separadores («ferrerwines.com/valdubon/» → «valdubon»). */
  ruta: string;
  nif: string | null;
  re: string | null;
  marcas: string[];
}

// Marcas registradas que no identifican a una bodega.
const MARCAS_GENERICAS = new Set(["ribera duero", "ribera del duero", "vino", "vinos", "tinto", "rosado", "blanco", "crianza", "reserva", "vendimia seleccionada"]);

const normNif = (s: string | null | undefined) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null);
const normRe = (s: string | null | undefined) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null);
const normMunicipio = (s: string | null | undefined) => (s ? claveTexto(s) || null : null);
const redondear = (n: number) => Math.round(n * 1000) / 1000;

function etiquetaDominio(dominio: string | null): string | null {
  if (!dominio) return null;
  const partes = dominio.split(".");
  // «bodega.com.es», «bodega.es»: la etiqueta es la anterior a los sufijos cortos.
  while (partes.length > 1 && partes[partes.length - 1]!.length <= 3) partes.pop();
  return partes[partes.length - 1]!.replace(/-/g, "") || null;
}

function rutaWeb(web: string | null | undefined): string {
  const m = web?.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+([^?#]*)/i);
  if (!m) return "";
  let ruta = m[1]!;
  try {
    ruta = decodeURIComponent(ruta);
  } catch {
    // ruta mal codificada: se usa tal cual
  }
  return claveTexto(ruta).replace(/ /g, "");
}

function preparar(d: DatosBodega, destino: string, supresionId?: string): Preparada {
  const dominio = dominioWeb(d.web);
  const propio = dominio && !esDominioGenerico(dominio) ? dominio : null;
  const cp = codigoPostal(d.codigoPostal) ?? codigoPostal(d.direccion);
  const clave = claveNombreBodega(d.nombre);
  return {
    destino,
    nombre: d.nombre,
    supresionId,
    clave,
    compacta: clave.replace(/ /g, ""),
    tramos: d.nombre
      .split(/\s+[-–—|]\s+|\s*[,(]\s*/)
      .map(claveNombreBodega)
      .filter((t) => t.length >= 4 && t !== clave),
    municipio: normMunicipio(d.municipio ?? municipioDeDireccion(d.direccion)),
    cp,
    provincia: codigoProvincia(d.provincia, cp),
    telefonos: telefonos(d.telefono),
    ubicacion: d.ubicacion ?? null,
    dominio: propio,
    etiqueta: etiquetaDominio(propio),
    ruta: propio ? rutaWeb(d.web) : "",
    nif: normNif(d.nif),
    re: normRe(d.registroEmbotellador),
    marcas: (d.marcas ?? []).map(claveMarca).filter((m) => m.length >= 4 && !MARCAS_GENERICAS.has(m)),
  };
}

function contenida(corta: string, larga: string): boolean {
  if (corta.length < 4) return false;
  const pl = new Set(larga.split(" "));
  return corta.split(" ").every((p) => pl.has(p));
}

// Palabras de topónimo que no identifican a una bodega por sí solas.
const TOPONIMOS = new Set(["duero", "ribera", "rioja", "alavesa", "alta", "oriental"]);

/** ¿El nombre corto solo tiene palabras del lugar («Peñafiel» dentro de «Tierras de Peñafiel»)? */
function soloLugar(corta: string, a: Preparada, b: Preparada): boolean {
  const lugar = new Set([...(a.municipio?.split(" ") ?? []), ...(b.municipio?.split(" ") ?? [])]);
  return corta.split(" ").every((p) => lugar.has(p) || TOPONIMOS.has(p));
}

type Lugar = "igual" | "sin" | "distinto";

/**
 * Mismo sitio: mismo municipio o mismo CP; si falta el municipio en algún lado, a menos de
 * 1 km. Distinto: municipios o CP distintos (dos pueblos vecinos no son el mismo sitio).
 */
function compararLugar(a: Preparada, b: Preparada): Lugar {
  if (a.municipio && b.municipio && a.municipio === b.municipio) return "igual";
  if (a.cp && b.cp && a.cp === b.cp) return "igual";
  if (a.municipio && b.municipio) return "distinto";
  if (a.ubicacion && b.ubicacion && distanciaKm(a.ubicacion, b.ubicacion) <= 1) return "igual";
  if (a.cp && b.cp) return "distinto";
  return "sin";
}

/**
 * Webs distintas de la misma bodega: misma etiqueta con otro TLD
 * («vinotierraranda.es» / «.com»), una etiqueta dentro de la otra
 * («abadiasanquirce» / «bodegasabadiasanquirce») o una página de un grupo con
 * el nombre de la bodega en la ruta («ferrerwines.com/valdubon/»).
 */
function websRelacionadas(s: Preparada, c: Preparada): boolean {
  const [a, b] = [s.etiqueta, c.etiqueta];
  if (a && b) {
    if (a === b) return true;
    const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
    if (corta.length >= 6 && larga.includes(corta)) return true;
  }
  const nombra = (p: Preparada, otra: Preparada) => p.ruta.length >= 5 && otra.compacta.length >= 5 && p.ruta.includes(otra.compacta);
  return nombra(s, c) || nombra(c, s);
}

export class EmparejadorBodegas {
  private candidatas: Preparada[];
  private usosDominio = new Map<string, number>();
  private usosMarca = new Map<string, number>();
  private usosTelefono = new Map<string, number>();

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
    // Un dominio, una marca o un teléfono que comparten bodegas distintas (grupos) no sirven de clave.
    const contar = (mapa: Map<string, number>, valores: Iterable<string>) => {
      for (const v of new Set(valores)) mapa.set(v, (mapa.get(v) ?? 0) + 1);
    };
    for (const destino of new Set(this.candidatas.map((c) => c.destino))) {
      const deEsta = this.candidatas.filter((c) => c.destino === destino);
      contar(this.usosDominio, deEsta.map((c) => c.dominio).filter((x): x is string => !!x));
      contar(this.usosMarca, deEsta.flatMap((c) => c.marcas));
      contar(this.usosTelefono, deEsta.flatMap((c) => c.telefonos));
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

    if (s.nif && c.nif === s.nif) return { puntuacion: 1, motivo: "nif" };
    if (s.re && c.re === s.re) return { puntuacion: 1, motivo: "registro_embotellador" };

    const lugar = compararLugar(c, s);
    const otraProvincia = !!s.provincia && !!c.provincia && s.provincia !== c.provincia;

    if (s.dominio && c.dominio === s.dominio) {
      const exclusivo = (this.usosDominio.get(s.dominio) ?? 1) === 1;
      probar(exclusivo ? 0.97 : 0.8, exclusivo ? "dominio" : "dominio_compartido");
    }

    // Nombre: clave entera, sin espacios o por tramos («Alejandro Fernández - Tinto Pesquera»).
    let nombre = 0;
    if (s.clave && c.clave) {
      const ladoS = [s.clave, ...s.tramos];
      const ladoC = [c.clave, ...c.tramos];
      const igual = s.clave === c.clave || s.compacta === c.compacta || ladoS.some((x) => ladoC.includes(x));
      if (igual) {
        nombre = lugar === "igual" ? 0.97 : lugar === "sin" ? 0.85 : 0.5;
        probar(nombre, lugar === "igual" ? "nombre_municipio" : lugar === "sin" ? "nombre" : "nombre_otro_municipio");
      } else {
        const [corta, larga] = s.clave.length <= c.clave.length ? [s.clave, c.clave] : [c.clave, s.clave];
        if (contenida(corta, larga) && !soloLugar(corta, s, c)) {
          nombre = lugar === "igual" ? 0.92 : lugar === "sin" ? 0.8 : 0.4;
          probar(nombre, "nombre_contenido");
        } else {
          const t = similitud(s.clave, c.clave);
          nombre = lugar === "igual" ? 0.5 + 0.45 * t : lugar === "sin" ? 0.9 * t : 0.6 * t;
          // Lo único en común es el municipio: nunca pasa de revisión.
          if (contenida(corta, larga)) nombre = Math.min(nombre, 0.7);
          probar(nombre, "nombre_similar");
        }
      }
      // El nombre que da la fuente es una marca exclusiva de la candidata (razón social ≠ marca:
      // «Bodegas Durón» es una marca de Grupo Solar de Samaniego). Va a revisión con esa
      // candidata; solo se vincula si lo confirma el teléfono: hay bodegas inscritas aparte con
      // el nombre de una marca de otra del mismo pueblo («Dominio del Pidio» / Cillar de Silos).
      for (const m of c.marcas) {
        if ((this.usosMarca.get(m) ?? 1) !== 1) continue;
        const mk = claveNombreBodega(m);
        if (soloLugar(mk, s, c)) continue; // marca «La Horra» de una bodega de La Horra
        if (mk === s.clave || s.tramos.includes(mk)) {
          probar(lugar === "igual" ? 0.88 : lugar === "sin" ? 0.8 : 0.5, "marca");
        } else if (mk.length >= 5 && contenida(mk, s.clave) && s.clave.split(" ").length - mk.split(" ").length === 1) {
          // Una palabra de más («Finca Torremilanos» / marca «Torremilanos»).
          probar(lugar === "igual" ? 0.85 : lugar === "sin" ? 0.75 : 0.4, "marca");
        }
      }
    }

    // Teléfono exclusivo igual: corrobora un nombre parecido; solo, no basta para vincular.
    const telefono = lugar !== "distinto" && s.telefonos.some((t) => c.telefonos.includes(t) && (this.usosTelefono.get(t) ?? 1) === 1);
    if (telefono) probar(Math.max(nombre, mejor.puntuacion) >= 0.6 ? 0.95 : 0.85, "telefono");

    // Pruebas en contra.
    let p = mejor.puntuacion;
    if (s.nif && c.nif && s.nif !== c.nif) p = Math.min(p, 0.3);
    // Webs propias sin relación entre sí: dudoso salvo que lo confirme el teléfono.
    if (s.dominio && c.dominio && s.dominio !== c.dominio && !websRelacionadas(s, c) && !telefono) p = Math.min(p, 0.85);
    // Otra provincia: ni el nombre ni un dominio (de grupo) bastan.
    if (otraProvincia) p = Math.min(p, 0.6);
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
