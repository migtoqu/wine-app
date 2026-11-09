// Vinopremier: de ficha a vino, añada y variedades. Solo hechos (cifras, nombres de uva,
// tipo): del texto libre de la tienda se extraen datos, nunca frases.
import type { SenalesVino } from "../../emparejamiento/bodegas.ts";
import { limpiarEspacios, quitarTildes } from "../../lib/texto.ts";
import {
  anioDesde,
  crianzaDesde,
  esPack,
  gradoDesde,
  nombreVino,
  temperaturaDesde,
  tipoDesde,
  variedadesDesde,
  type CamposAnada,
  type CrianzaVino,
  type TipoVino,
  type Variedad,
} from "../vinoseleccion/normalizar.ts";
import { rutaProducto, type Categoria, type FichaVp } from "./parsear.ts";

export type { CamposAnada, CrianzaVino, TipoVino, Variedad };

const EAN = /^(\d{8}|\d{12,14})$/;

export interface VinoNormalizadoVp {
  idExterno: string;
  url: string;
  /** Slug de la D.O. según la categoría que lo lista. */
  denominacion: string;
  denominacionNombre: string;
  /** Motivo por el que no es un vino de esta carga (pack, no es vino…); null si lo es. */
  descarte: string | null;
  vino: { nombre: string; tipo: TipoVino | null; crianza: CrianzaVino | null };
  anada: CamposAnada;
  variedades: Variedad[];
  imagen: string | null;
  ean: string | null;
  senales: SenalesVino;
  datos: DatosRegistroVp;
}

/** `registros_fuente.datos`: hechos de la ficha (precio y disponibilidad quedan aquí hasta la Fase 2). */
export interface DatosRegistroVp {
  url: string;
  nombre: string;
  sku: string | null;
  ean: string | null;
  precio: number | null;
  moneda: string | null;
  disponibilidad: string | null;
  formato_ml: number | null;
  denominacion: string;
  bodega_tienda: string | null;
  grupo_tienda: string[];
  imagen_url: string | null;
  emparejamiento?: unknown;
}

/** «Vino Tinto Orube Crianza» → «Orube Crianza»; «Estuche Vino Tinto X» → «X». */
export function nombreSinPrefijo(nombre: string): string {
  const limpio = nombreVino(nombre);
  const sin = limpio.replace(/^(?:estuche\s+)?vino\s+(?:(?:tinto|blanco|rosado|espumoso|dulce|generoso)\s+)?/i, "");
  return limpiarEspacios(sin) || limpio;
}

/** Formato en ml: «75cl», «Mágnum», «9 litros» (también en el slug de la URL). */
export function formatoDesde(nombre: string, url: string): number | null {
  const texto = `${nombre} ${new URL(url).pathname.replace(/[-_/]+/g, " ")}`;
  const m = texto.match(/\b(\d+(?:[.,]\d+)?)\s*(cl|ml|litros?|l)\b/i);
  if (m) {
    const n = Number(m[1]!.replace(",", "."));
    const u = m[2]!.toLowerCase();
    const ml = Math.round(u === "cl" ? n * 10 : u === "ml" ? n : n * 1000);
    if (ml >= 100 && ml <= 30000) return ml;
  }
  const t = quitarTildes(texto).toLowerCase();
  if (/doble\s+magnum/.test(t)) return 3000;
  if (/\bmagnum\b/.test(t)) return 1500;
  return null;
}

/** Año de la añada: del nombre o, si falta, del slug de la URL («…-2010-75cl»). */
export function anioFicha(nombre: string, url: string): number | null {
  const delNombre = anioDesde(nombre);
  if (delNombre) return delNombre;
  const slug = new URL(url).pathname;
  const m = slug.match(/[-/](19[5-9]\d|20[0-4]\d)(?:[-.]|$)/);
  return m ? Number(m[1]) : null;
}

const UVA_ROTULADA = /\bUvas?\s*:\s*([^.\n]+)/i;
const UVA_FRASE = /\b(?:combinando|ensamblaje\s+de|mezcla\s+de|elaborado\s+con|compuesto\s+por|variedades?\s+)\s*(?:las\s+variedades\s+)?([A-ZÁÉÍÓÚÑ][^.;]*?)(?=\s+en\s|\s+con\s|\.|;|$)/;

/** Nombres de uva del texto libre: «Uva: 100% Tinto Fino» o «combinando Tempranillo, Garnacha y Graciano». */
export function uvasDesdeTexto(texto: string): Variedad[] {
  const rotulada = UVA_ROTULADA.exec(texto)?.[1];
  const candidato = rotulada ?? UVA_FRASE.exec(texto)?.[1];
  if (!candidato) return [];
  return variedadesDesde(candidato).filter((v) => v.nombre.split(/\s+/).length <= 3 && /^\p{Lu}/u.test(v.nombre));
}

/** Meses de barrica: «20 meses en barricas», «crianza … durante 12 meses». */
export function mesesBarrica(texto: string): number | null {
  const m = texto.match(/(?:crianza|barricas?)[^.]{0,100}?\b(\d{1,3})\s*meses\b|\b(\d{1,3})\s*meses\s+en\s+barrica/i);
  const n = Number(m?.[1] ?? m?.[2]);
  return Number.isInteger(n) && n > 0 && n <= 120 ? n : null;
}

/** Temperatura de servicio («servirlo a una temperatura entre 16 y 18 ºC»); la de conservación no cuenta. */
export function temperaturaServicio(texto: string): { min: number; max: number } | null {
  const m = texto.match(/\bserv\w*[^.]{0,80}?(\d{1,2}(?:[.,]\d)?\s*º?\s*(?:-|–|a|y)\s*\d{1,2}(?:[.,]\d)?\s*º\s*C|\d{1,2}(?:[.,]\d)?\s*º\s*C)/i);
  return temperaturaDesde(m?.[1] ?? null);
}

/** Graduación solo si la ficha la rotula («14 % vol», «graduación … 14,5 %»). */
export function graduacion(texto: string): number | null {
  const m = texto.match(/(\d{1,2}(?:[.,]\d{1,2})?\s*%\s*(?:vol|alc))|graduaci[oó]n[^.]{0,40}?(\d{1,2}(?:[.,]\d{1,2})?\s*%)/i);
  return gradoDesde(m?.[1] ?? m?.[2]);
}

export function normalizarVino(ficha: FichaVp, categoria: Categoria): VinoNormalizadoVp {
  const tipo = tipoDesde(null, ficha.nombre);
  const texto = ficha.descripcion;
  const ean = ficha.ean && EAN.test(ficha.ean) ? ficha.ean : null;

  let descarte: string | null = null;
  if (esPack(ficha.nombre)) descarte = "pack o estuche";
  else if (!tipo) descarte = "no es un vino (tipo no reconocido)";

  const nombre = nombreSinPrefijo(ficha.nombre);
  const bodega = ficha.bodega ?? ficha.fabricante ?? ficha.marca;
  const grupo = [...new Set([ficha.fabricante, ficha.marca].filter((g): g is string => !!g && g !== bodega))];
  const temp = temperaturaServicio(texto);

  return {
    idExterno: rutaProducto(ficha.url),
    url: ficha.url,
    denominacion: categoria.denominacion,
    denominacionNombre: categoria.nombre,
    descarte,
    vino: { nombre, tipo, crianza: crianzaDesde(ficha.nombre, null) },
    anada: {
      anio: anioFicha(ficha.nombre, ficha.url),
      temp_servicio_min: temp?.min ?? null,
      temp_servicio_max: temp?.max ?? null,
      meses_crianza: mesesBarrica(texto),
      grado: graduacion(texto),
    },
    variedades: uvasDesdeTexto(texto),
    imagen: ficha.imagen,
    ean,
    senales: { bodega, grupo, vino: nombre },
    datos: {
      url: ficha.url,
      nombre: ficha.nombre,
      sku: ficha.sku,
      ean,
      precio: ficha.precio,
      moneda: ficha.moneda,
      disponibilidad: ficha.disponibilidad,
      formato_ml: formatoDesde(ficha.nombre, ficha.url),
      denominacion: categoria.denominacion,
      bodega_tienda: bodega,
      grupo_tienda: grupo,
      imagen_url: ficha.imagen,
    },
  };
}
