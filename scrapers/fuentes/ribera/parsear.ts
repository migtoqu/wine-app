// Ribera del Duero: extracción de datos crudos del HTML (listado y ficha).
// Solo hechos: nunca la descripción (.field--name-body), imágenes ni servicios.
import * as cheerio from "cheerio";
import type { Punto } from "../../lib/geo.ts";
import { textoONull } from "../../lib/texto.ts";

export const BASE = "https://www.riberadelduero.es";

export interface ListadoRibera {
  /** URLs absolutas de fichas, sin duplicados y en orden. */
  fichas: string[];
  /** Índice de la última página (`page=N` del enlace «Última»), si aparece. */
  ultimaPagina: number | null;
}

export interface Direccion {
  linea1: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  provincia: string | null;
  pais: string | null;
}

/** Ficha tal y como viene de la fuente (sin normalizar). */
export interface FichaRibera {
  url: string;
  slug_fuente: string;
  /** id de nodo Drupal: estable aunque cambie el slug. */
  nodo: string | null;
  nombre: string;
  direccion: Direccion;
  /** «Datos de la sociedad»: respaldo cuando la dirección principal viene vacía. */
  direccion_sociedad: Direccion;
  email: string | null;
  email_sociedad: string | null;
  telefono: string | null;
  telefono_href: string | null;
  web: string | null;
  web_sociedad: string | null;
  venta_online: string | null;
  ubicacion: Punto | null;
  marcas: string[];
}

export function urlListado(pagina: number): string {
  return `${BASE}/bodegas/resultados?termino=&page=${pagina}`;
}

const RUTA_FICHA = /^\/bodegas\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
// Rutas bajo /bodegas/ que no son fichas.
const NO_FICHAS = new Set(["resultados", "vino-online"]);

export function parsearListado(html: string): ListadoRibera {
  const $ = cheerio.load(html);
  const fichas: string[] = [];
  $("ul.bodegas__list li.views-row h3.bodega--title a[href]").each((_, a) => {
    const href = $(a).attr("href")!;
    const ruta = new URL(href, BASE).pathname;
    const m = RUTA_FICHA.exec(ruta);
    if (!m || NO_FICHAS.has(m[1]!)) return;
    const url = BASE + ruta;
    if (!fichas.includes(url)) fichas.push(url);
  });

  const hrefUltima = $("li.pager__item--last a[href]").attr("href");
  const pagina = hrefUltima ? new URL(hrefUltima, BASE).searchParams.get("page") : null;
  const ultimaPagina = pagina != null && /^\d+$/.test(pagina) ? Number(pagina) : null;

  return { fichas, ultimaPagina };
}

/** Texto de un campo «<strong>Etiqueta: </strong>valor» sin la etiqueta. */
function textoTrasEtiqueta($: cheerio.CheerioAPI, selector: string): string | null {
  const el = $(selector).first().clone();
  el.find("strong").remove();
  return textoONull(el.text());
}

function direccion($: cheerio.CheerioAPI, selector: string): Direccion {
  const dir = $(selector).first();
  const campo = (c: string) => textoONull(dir.find(c).first().text());
  return {
    linea1: campo(".address-line1"),
    codigo_postal: campo(".postal-code"),
    municipio: campo(".locality"),
    provincia: campo(".administrative-area"),
    pais: campo(".country"),
  };
}

/** lat/lng del parámetro `q` del iframe de Google Maps (la clave del iframe se ignora). */
export function ubicacionDesdeIframe(src: string | undefined): Punto | null {
  if (!src) return null;
  let q: string | null;
  try {
    q = new URL(src, "https://www.google.com").searchParams.get("q");
  } catch {
    return null;
  }
  const m = q?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function parsearFicha(html: string, url: string): FichaRibera {
  const $ = cheerio.load(html);
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop()!;

  const nombre =
    textoONull($(".block-field-blocknodebodegafield-display-title h1").first().text()) ??
    textoONull($("h1").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre (h1): ${url}`);

  let nodo: string | null = null;
  $('link[rel="shortlink"], link[rel="alternate"]').each((_, l) => {
    const m = /\/node\/(\d+)$/.exec($(l).attr("href") ?? "");
    if (m && !nodo) nodo = m[1]!;
  });

  const tel = $(".views--field__tel a[href^='tel:']").first();
  const telHref = tel.attr("href");

  const marcas: string[] = [];
  $("ul.marcas--list .marca--name").each((_, m) => {
    const t = textoONull($(m).text());
    if (t && !marcas.includes(t)) marcas.push(t);
  });

  return {
    url,
    slug_fuente: slug,
    nodo,
    nombre,
    direccion: direccion($, ".views--field__address .address"),
    direccion_sociedad: direccion($, ".views-field-field-bodega-direccion-sociedad .address"),
    email: textoTrasEtiqueta($, ".views--field__email"),
    email_sociedad: textoONull($(".views-field-field-email-sociedad .field-content").first().text()),
    telefono: textoONull(tel.text()) ?? textoTrasEtiqueta($, ".views--field__tel"),
    telefono_href: telHref ? decodeURIComponent(telHref.replace(/^tel:/, "")) : null,
    web: $(".views--field__web a[href]").first().attr("href") ?? textoTrasEtiqueta($, ".views--field__web"),
    web_sociedad: $(".views-field-field-bodega-web-sociedad a[href]").first().attr("href") ?? null,
    venta_online:
      $(".views--field__venta a[href]").first().attr("href") ?? textoTrasEtiqueta($, ".views--field__venta"),
    ubicacion: ubicacionDesdeIframe($(".geofield-embed-google-map iframe").first().attr("src")),
    marcas,
  };
}
