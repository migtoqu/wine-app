// C.R.D.O. Navarra (navarrawine.com, WordPress + Divi): sitemaps por tipo (bodegas, vinos, experiencias)
// → fichas. La REST pública no expone los campos (acf vacío), así que se lee el HTML.
// Solo hechos: nunca las descripciones (elaboración, historia, texto de la experiencia) ni imágenes.
import * as cheerio from "cheerio";
import type { Punto } from "../../../lib/geo.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../../lib/texto.ts";
import { tipoServicio, type TipoServicio } from "../comun/servicios.ts";

export const BASE = "https://navarrawine.com";
export const URL_SITEMAP = `${BASE}/sitemap_index.xml`;
export const URL_LISTADO = `${BASE}/bodegas-navarra/`;

export type TipoFicha = "bodega" | "vino" | "experiencia";
const RUTA: Record<TipoFicha, string> = { bodega: "bodegas", vino: "vinos", experiencia: "experiencias" };

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));
type $ = cheerio.CheerioAPI;

export const urlFicha = (tipo: TipoFicha, slug: string) => `${BASE}/${RUTA[tipo]}/${slug}/`;

/** Slug de una URL de ficha del tipo dado (con o sin www), o null. */
export function slugDe(url: string, tipo: TipoFicha): string | null {
  let u: URL;
  try {
    u = new URL(url, BASE);
  } catch {
    return null;
  }
  if (u.hostname.replace(/^www\./, "") !== "navarrawine.com") return null;
  const m = new RegExp(`^/${RUTA[tipo]}/([a-z0-9]+(?:-[a-z0-9]+)*)/?$`).exec(u.pathname);
  return m ? m[1]! : null;
}

/** Sitemaps hijos del índice que interesan («bodegas-sitemap.xml», «vinos-sitemap1.xml»…). */
export function parsearIndiceSitemaps(xml: string): Record<TipoFicha, string[]> {
  const out: Record<TipoFicha, string[]> = { bodega: [], vino: [], experiencia: [] };
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = m[1]!;
    const nombre = url.split("/").pop() ?? "";
    for (const tipo of Object.keys(RUTA) as TipoFicha[]) {
      if (new RegExp(`^${RUTA[tipo]}-sitemap\\d*\\.xml$`).test(nombre)) out[tipo].push(url);
    }
  }
  return out;
}

/** Slugs únicos de un sitemap de un tipo (se ignoran la portada del tipo y otras URLs). */
export function parsearSitemap(xml: string, tipo: TipoFicha): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const s = slugDe(m[1]!, tipo);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Listado de bodegas: slug → zona («Ribera Alta»), que la ficha no trae. */
export function parsearZonas(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const out = new Map<string, string>();
  $(".dmach-grid-item[data-posttype='bodegas']").each((_, el) => {
    const slug = slugDe($(el).find("a[href]").first().attr("href") ?? "", "bodega");
    const zona = t($(el).find("#acf_zona, [id^='acf_zona']").first().text())?.replace(/^Zona:?\s*/i, "") ?? null;
    if (slug && zona && !out.has(slug)) out.set(slug, zona);
  });
  return out;
}

/** «<b>Tipo de vino:</b> Tinto Crianza» → { "tipo de vino": "Tinto Crianza" } (clave por claveTexto). */
function etiquetas($: $): Map<string, string> {
  const out = new Map<string, string>();
  $("#main-content b, #main-content strong").each((_, b) => {
    const etiqueta = t($(b).text());
    if (!etiqueta || !/:\s*$/.test(etiqueta)) return;
    const valor = t($(b).parent().text().replace($(b).text(), ""));
    const clave = claveTexto(etiqueta);
    if (clave && valor && !out.has(clave)) out.set(clave, valor);
  });
  return out;
}

/** Bloque «Información»: «Tlf. …», «Email. …» y la dirección (`.fea-display-field` + población). */
function informacion($: $): { telefono: string | null; email: string | null; direccion: string | null } {
  const texto = t($("#main-content").text()) ?? "";
  const telefono = /\bTlf\.?\s*([+()\d][\d\s().-]{6,})/i.exec(texto)?.[1]?.trim() ?? null;
  const email = /\bEmail\.?\s*([^\s@]+@[^\s@]+\.[a-z]{2,})/i.exec(texto)?.[1] ?? null;
  const campo = $("#main-content .fea-display-field").first();
  const direccion = campo.length ? t(campo.parent().text()) : null;
  return { telefono, email, direccion };
}

function boton($: $, texto: RegExp): string | null {
  const a = $("#main-content a[href]").filter((_, el) => texto.test(t($(el).text()) ?? "")).first();
  const href = a.attr("href")?.trim();
  return href && /^https?:\/\//i.test(href) ? href : null;
}

function slugsEnlazados($: $, tipo: TipoFicha, dentro = "#main-content"): string[] {
  const out: string[] = [];
  $(`${dentro} a[href]`).each((_, a) => {
    const s = slugDe($(a).attr("href")!, tipo);
    if (s && !out.includes(s)) out.push(s);
  });
  return out;
}

/** Coordenadas del iframe de Google Maps («…&q=42.48%2C+-1.65»). */
export function coordenadasIframe(src: string | undefined): Punto | null {
  const q = src ? new URL(src, BASE).searchParams.get("q") : null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q ?? "");
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return lat || lng ? { lat, lng } : null;
}

const items = ($: $, sel: string) =>
  $(sel).map((_, el) => t($(el).text())).get().filter((x): x is string => !!x);

// ---------------------------------------------------------------------------

export interface FichaBodegaNavarra {
  url: string;
  slug_fuente: string;
  nombre: string;
  direccion_texto: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  ubicacion: Punto | null;
  /** Servicios de enoturismo («Visitas a Bodegas con degustación»…) e instalaciones («Tienda»…). */
  enoturismo: string[];
  instalaciones: string[];
  vinos_enlazados: string[];
  experiencias_enlazadas: string[];
}

export function parsearBodega(html: string, url: string): FichaBodegaNavarra {
  const $ = cheerio.load(html);
  const nombre =
    t($("#main-content .et_pb_text_0_tb_body .et_pb_text_inner").first().text()) ??
    t($("meta[property='og:title']").attr("content")?.replace(/\s+-\s+D\.O\..*$/i, ""));
  if (!nombre) throw new Error(`Ficha de bodega sin nombre: ${url}`);
  const info = informacion($);
  return {
    url,
    slug_fuente: slugDe(url, "bodega") ?? "",
    nombre,
    direccion_texto: info.direccion,
    telefono: info.telefono,
    email: info.email,
    web: boton($, /acceder a la web/i),
    ubicacion: coordenadasIframe($("#main-content iframe[src*='maps']").first().attr("src")),
    enoturismo: items($, "#main-content .enoturismo-item span"),
    instalaciones: items($, "#main-content .instalacion-item span"),
    vinos_enlazados: slugsEnlazados($, "vino"),
    experiencias_enlazadas: slugsEnlazados($, "experiencia", "#main-content #grid_experiencias"),
  };
}

export interface FichaVinoNavarra {
  url: string;
  slug_fuente: string;
  nombre: string;
  bodega_texto: string | null;
  /** Slug de la bodega (enlace «Ver bodega»), si lo hay. */
  bodega_slug: string | null;
  /** «7,90€». Solo informativo (los precios son cosa del comparador). */
  precio_texto: string | null;
  tipo_texto: string | null;
  variedades_texto: string | null;
  crianza_texto: string | null;
  tienda: string | null;
  vinos_hermanos: string[];
}

export function parsearVino(html: string, url: string): FichaVinoNavarra {
  const $ = cheerio.load(html);
  // Cabecera: «VER TODOS LOS VINOS» y, a continuación, nombre, precio y bodega en módulos de texto.
  const textos = $("#main-content .et_pb_text_inner")
    .map((_, el) => t($(el).text()))
    .get()
    .filter((x): x is string => !!x);
  const nombre = textos[0] ?? t($("meta[property='og:title']").attr("content")?.replace(/\s+-\s+D\.O\..*$/i, ""));
  if (!nombre) throw new Error(`Ficha de vino sin nombre: ${url}`);
  const precio = textos.find((x) => /^\d[\d.,]*\s*€$/.test(x)) ?? null;
  const iPrecio = precio ? textos.indexOf(precio) : 0;
  const bodegaTexto = textos[iPrecio + 1] && !/:/.test(textos[iPrecio + 1]!) ? textos[iPrecio + 1]! : null;
  const e = etiquetas($);
  const bodegas = slugsEnlazados($, "bodega");
  return {
    url,
    slug_fuente: slugDe(url, "vino") ?? "",
    nombre,
    bodega_texto: bodegaTexto,
    bodega_slug: bodegas.length === 1 ? bodegas[0]! : null,
    precio_texto: precio,
    tipo_texto: e.get("tipo de vino") ?? null,
    variedades_texto: e.get("variedades de uva") ?? null,
    crianza_texto: e.get("crianza") ?? null,
    tienda: boton($, /tienda online/i),
    vinos_hermanos: slugsEnlazados($, "vino").filter((s) => s !== slugDe(url, "vino")),
  };
}

export interface FichaExperienciaNavarra {
  url: string;
  slug_fuente: string;
  titulo: string;
  /** Tipo deducido del título y del texto (el texto se usa para clasificar, no se guarda). */
  tipo: TipoServicio;
  bodega_slug: string | null;
  /** Filas «etiqueta → valor» (Precio, Duración, Idioma, Temporada, Horario, Público). */
  info: Record<string, string>;
  url_reserva: string | null;
  instalaciones: string[];
  direccion_texto: string | null;
}

export function parsearExperiencia(html: string, url: string): FichaExperienciaNavarra {
  const $ = cheerio.load(html);
  const titulo = t($("#main-content .et_pb_text_inner").first().text());
  if (!titulo) throw new Error(`Ficha de experiencia sin título: ${url}`);
  const bodegas = slugsEnlazados($, "bodega");
  const texto = $("#main-content .et_pb_text_inner p").map((_, p) => $(p).text()).get().join(" ");
  return {
    url,
    slug_fuente: slugDe(url, "experiencia") ?? "",
    titulo,
    tipo: tipoServicio(titulo, [texto]),
    bodega_slug: bodegas.length === 1 ? bodegas[0]! : null,
    info: Object.fromEntries(etiquetas($)),
    url_reserva: boton($, /reservar/i),
    instalaciones: items($, "#main-content .instalacion-item span"),
    direccion_texto: informacion($).direccion,
  };
}
