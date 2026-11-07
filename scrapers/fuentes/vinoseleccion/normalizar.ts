// Vinoselección: de ficha + tarjeta a vino, añada, variedades e imagen.
import type { Database } from "../../../src/lib/supabase/database.types.ts";
import type { SenalesVino } from "../../emparejamiento/bodegas.ts";
import { claveTexto, limpiarEspacios, quitarTildes } from "../../lib/texto.ts";
import type { FichaVs, TarjetaVs } from "./parsear.ts";

export type TipoVino = Database["public"]["Enums"]["tipo_vino"];
export type CrianzaVino = Database["public"]["Enums"]["crianza_vino"];

export interface Variedad {
  nombre: string;
  porcentaje: number | null;
}

export interface CamposAnada {
  anio: number | null;
  temp_servicio_min: number | null;
  temp_servicio_max: number | null;
  meses_crianza: number | null;
  grado: number | null;
}

export interface VinoNormalizado {
  idExterno: string;
  url: string;
  /** Motivo por el que no es un vino (pack, otra D.O.…); null si lo es. */
  descarte: string | null;
  vino: { nombre: string; tipo: TipoVino | null; crianza: CrianzaVino | null };
  anada: CamposAnada;
  variedades: Variedad[];
  imagen: string | null;
  senales: SenalesVino;
  datos: DatosRegistroVs;
}

/** `registros_fuente.datos`: hechos de la ficha y la tarjeta (precio etc. hasta la Fase 2). */
export interface DatosRegistroVs {
  url: string;
  nombre: string;
  sku: string | null;
  ean: string | null;
  precio: number | null;
  moneda: string | null;
  disponibilidad: string | null;
  formato_ml: number | null;
  tarjeta: {
    precio: number | null;
    num_botellas: number | null;
    precio_por_botella: number | null;
    en_stock: boolean | null;
  };
  region: string | null;
  tipo_texto: string | null;
  variedades_texto: string | null;
  barrica_texto: string | null;
  temperatura_texto: string | null;
  grado_texto: string | null;
  bodega_tienda: { nombre: string; url: string } | null;
  grupo_tienda: string[];
  imagen_url: string | null;
  emparejamiento?: unknown;
}

const clave = (s: string) => claveTexto(s);

// Packs, lotes y colecciones: no son un vino (se guardan como 'descartado').
// Un estuche o caja sin número («Mágnum 2020 | Estuche») es una sola botella y sí cuenta.
const PACK =
  /\|\s*\d|\b\d+\s*(?:bot(?:ellas?)?|copas?|uds?|unidades)\b|\b(?:colecci[oó]n|collection|pack|lote|surtido|degustaci[oó]n|selecci[oó]n (?:mensual|privada))\b|\+\s*\S/i;

export function esPack(nombre: string): boolean {
  // Dos añadas en el nombre = dos vinos («Protos Genesis 2024 y Bela Crianza 2023»).
  const anios = nombre.match(/\b(19[5-9]\d|20[0-4]\d)\b/g) ?? [];
  return PACK.test(nombre) || new Set(anios).size > 1;
}

/** Año de la añada: del nombre («… 2023») o del JSON de la tarjeta. */
export function anioDesde(nombre: string, anioTarjeta?: string): number | null {
  const m = nombre.match(/\b(19[5-9]\d|20[0-4]\d)\b/g);
  const candidato = m ? Number(m[m.length - 1]) : Number(anioTarjeta);
  return Number.isInteger(candidato) && candidato >= 1950 && candidato <= 2049 ? candidato : null;
}

// Formatos que no forman parte del nombre del vino.
const FORMATOS =
  /\b(?:doble\s+m[aá]gnum|m[aá]gnum|jeroboam|imperial|benjam[ií]n|media\s+botella|\d+(?:[.,]\d+)?\s*(?:cl|ml|l))\b/gi;

/** Nombre del vino: sin añada, formato ni sufijos de pack. Conserva crianza («Legaris Crianza»). */
export function nombreVino(nombre: string): string {
  return limpiarEspacios(
    nombre
      .split("|")[0]!
      .replace(/\b(19[5-9]\d|20[0-4]\d)\b/g, " ")
      .replace(FORMATOS, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/[\s,.;:-]+$/g, ""),
  );
}

/** Formato en ml: «Capacidad (cl)» de la ficha, `capacity` de la tarjeta o el nombre. */
export function formatoMl(capacidadCl: string | undefined, capacidadTarjeta: string | undefined, nombre: string): number | null {
  const cl = Number((capacidadCl ?? "").replace(",", "."));
  if (cl > 0) return Math.round(cl * 10);
  const m = capacidadTarjeta?.match(/(\d+(?:[.,]\d+)?)\s*(cl|ml|l)\b/i);
  if (m) {
    const n = Number(m[1]!.replace(",", "."));
    const unidad = m[2]!.toLowerCase();
    return Math.round(unidad === "cl" ? n * 10 : unidad === "l" ? n * 1000 : n);
  }
  if (/doble\s+m[aá]gnum/i.test(nombre)) return 3000;
  if (/m[aá]gnum/i.test(nombre)) return 1500;
  return null;
}

/** Tipo desde «Tipo de vino» («Vino Tinto», «Tinto Crianza», «Blanco»…) o, si falta, el nombre. */
export function tipoDesde(tipoTexto: string | null, nombre: string): TipoVino | null {
  for (const texto of [tipoTexto, nombre]) {
    if (!texto) continue;
    const t = quitarTildes(texto).toLowerCase();
    if (/\b(espumoso|cava|brut|champagne)\b/.test(t)) return "espumoso";
    if (/\b(generoso|fino|oloroso|amontillado|manzanilla|palo cortado)\b/.test(t)) return "generoso";
    if (/\bdulce\b/.test(t)) return "dulce";
    if (/\brosado\b/.test(t)) return "rosado";
    if (/\bblanco\b/.test(t)) return "blanco";
    if (/\btinto\b/.test(t)) return "tinto";
  }
  return null;
}

/** Crianza por palabras del nombre o del tipo; si no aparece ninguna, null (no se adivina). */
export function crianzaDesde(nombre: string, tipoTexto: string | null): CrianzaVino | null {
  const t = quitarTildes(`${nombre} ${tipoTexto ?? ""}`).toLowerCase();
  if (/\bgran reserva\b/.test(t)) return "gran_reserva";
  if (/\breserva\b/.test(t)) return "reserva";
  if (/\bcrianza\b/.test(t)) return "crianza";
  if (/\broble\b/.test(t)) return "roble";
  if (/\bjoven\b/.test(t)) return "joven";
  return null;
}

/** «15-16 ºC», «17 ºC», «entre 6 y 8º C» → {min, max}. Fuera de 4–22 ºC se descarta. */
export function temperaturaDesde(texto: string | null): { min: number; max: number } | null {
  if (!texto) return null;
  const t = texto.replace(",", ".");
  const rango = t.match(/(\d{1,2}(?:\.\d)?)\s*º?\s*(?:-|–|a|y)\s*(\d{1,2}(?:\.\d)?)\s*º?\s*C?/i);
  const uno = t.match(/(\d{1,2}(?:\.\d)?)\s*º\s*C?/i);
  let min: number;
  let max: number;
  if (rango) [min, max] = [Number(rango[1]), Number(rango[2])];
  else if (uno) min = max = Number(uno[1]);
  else return null;
  if (min > max) [min, max] = [max, min];
  return min >= 4 && max <= 22 ? { min, max } : null;
}

/** «12 meses» → 12; rangos («12 a 14 meses») u otros textos → null. */
export function mesesDesde(texto: string | undefined): number | null {
  const m = texto?.match(/^\s*(\d{1,3})\s*meses?\b[^\d]*$/i);
  return m ? Number(m[1]) : null;
}

/** «14,5 %», «14.5% vol» → 14.5 */
export function gradoDesde(texto: string | undefined): number | null {
  const m = texto?.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  if (!m) return null;
  const g = Number(m[1]!.replace(",", "."));
  return g > 0 && g <= 25 ? g : null;
}

/**
 * «100% Tempranillo», «Tinta del País 90%, Merlot 10%», «Merlot, Tempranillo».
 * Si la suma pasa de 100 se descartan los porcentajes.
 */
export function variedadesDesde(texto: string | null | undefined): Variedad[] {
  if (!texto) return [];
  const partes = texto
    .split(/\s*(?:,|;|\/|\by\b|\be\b)\s*/i)
    .map((p) => limpiarEspacios(p))
    .filter(Boolean);
  const lista: Variedad[] = [];
  for (const p of partes) {
    const m = p.match(/^(?:(\d{1,3}(?:[.,]\d+)?)\s*%\s*)?(.+?)(?:\s*(\d{1,3}(?:[.,]\d+)?)\s*%)?$/);
    if (!m) continue;
    // «% Merlot»: la tarjeta trae a veces el símbolo sin número.
    const nombre = m[2]!.replace(/^%\s*/, "").replace(/^(?:de|del)\s+/i, "").trim();
    if (!/\p{L}{3,}/u.test(nombre)) continue;
    const pct = m[1] ?? m[3];
    const porcentaje = pct ? Number(pct.replace(",", ".")) : null;
    if (!lista.some((v) => clave(v.nombre) === clave(nombre))) {
      lista.push({ nombre, porcentaje: porcentaje && porcentaje > 0 && porcentaje <= 100 ? porcentaje : null });
    }
  }
  const suma = lista.reduce((s, v) => s + (v.porcentaje ?? 0), 0);
  return suma > 100.5 ? lista.map((v) => ({ ...v, porcentaje: null })) : lista;
}

const esRibera = (region: string | null) => !!region && /ribera del duero/i.test(quitarTildes(region));

export function normalizarVino(ficha: FichaVs, tarjeta: TarjetaVs | null, idExterno: string): VinoNormalizado {
  const c = ficha.caracteristicas;
  const t = tarjeta?.datos ?? null;
  const tipoTexto = c["Tipo de vino"] ?? null;
  const tipo = tipoDesde(tipoTexto, ficha.nombre);
  // Un tinto por debajo de 10 ºC es un error de la ficha (p. ej. «entre 6 y 8º C» en un crianza).
  const t0 = temperaturaDesde(ficha.temperatura);
  const temperatura = t0 && tipo === "tinto" && t0.min < 10 ? null : t0;
  const variedadesTexto = t?.grape_variety_wine?.trim() || c["Variedad de uva"] || null;
  const grupo = [
    ...new Set([ficha.bodeguero, t?.item_brand].map((g) => g?.trim()).filter((g): g is string => !!g)),
  ];
  const bodegaTienda = ficha.bodega ?? tarjeta?.bodega ?? null;

  let descarte: string | null = null;
  if (esPack(ficha.nombre)) descarte = "pack o estuche";
  else if (!esRibera(ficha.region)) descarte = `región distinta: ${ficha.region ?? "sin región"}`;

  const nombre = nombreVino(ficha.nombre);
  return {
    idExterno,
    url: ficha.url,
    descarte,
    vino: { nombre, tipo, crianza: crianzaDesde(ficha.nombre, tipoTexto) },
    anada: {
      anio: anioDesde(ficha.nombre, t?.vintage_year_wine),
      temp_servicio_min: temperatura?.min ?? null,
      temp_servicio_max: temperatura?.max ?? null,
      meses_crianza: mesesDesde(c["Permanencia en barrica"]),
      grado: gradoDesde(c["Grado alcohólico"] ?? c["Graduación"] ?? c["Grado"]),
    },
    variedades: variedadesDesde(variedadesTexto),
    imagen: ficha.imagen,
    senales: { bodega: bodegaTienda?.nombre ?? null, grupo, vino: nombre },
    datos: {
      url: ficha.url,
      nombre: ficha.nombre,
      sku: ficha.sku,
      ean: t?.ean?.trim() || null,
      precio: ficha.precio,
      moneda: ficha.moneda,
      disponibilidad: ficha.disponibilidad,
      formato_ml: formatoMl(c["Capacidad (cl)"], t?.capacity, ficha.nombre),
      tarjeta: {
        precio: t?.price ?? null,
        num_botellas: t?.num_bottles ?? null,
        precio_por_botella: t?.pre_per_bottle ?? null,
        en_stock: t?.is_in_stock ? t.is_in_stock === "Yes" : null,
      },
      region: ficha.region,
      tipo_texto: tipoTexto,
      variedades_texto: variedadesTexto,
      barrica_texto: c["Permanencia en barrica"] ?? null,
      temperatura_texto: ficha.temperatura,
      grado_texto: c["Grado alcohólico"] ?? c["Graduación"] ?? c["Grado"] ?? null,
      bodega_tienda: bodegaTienda,
      grupo_tienda: grupo,
      imagen_url: ficha.imagen,
    },
  };
}
