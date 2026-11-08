// Ruta del Vino Ribera del Duero: extracción de datos crudos de la API pública
// de WooCommerce (actividades), la REST de WordPress (directorio) y el bloque de
// contacto del HTML de cada ficha. Solo hechos: nunca descripciones ni imágenes.
import * as cheerio from "cheerio";

export const BASE = "https://rutadelvinoriberadelduero.es";

// robots.txt (2026-11-08) prohíbe /wp-json/ y /?rest_route=: nada de API, solo sitemaps y HTML público.
export const URL_SITEMAP_PRODUCTOS = `${BASE}/product-sitemap.xml`;
export const URL_SITEMAP_DIRECTORIO = `${BASE}/directories-sitemap.xml`;

/** Producto (actividad) leído del HTML de `/producto/<slug>/`. */
export interface ProductoRuta {
  id: number;
  nombre: string;
  permalink: string;
  /** Euros; null si la web muestra 0 (el precio real está en el enlace de reserva). */
  precio: number | null;
  url_reserva: string | null;
  /** Categorías de WooCommerce (a partir del slug: «noviembre mes del enoturismo»). */
  categorias: string[];
  /** Duración (min) e idiomas (ISO) detectados en la descripción; la descripción no se guarda. */
  duracion_minutos: number | null;
  idiomas: string[];
}

export interface FichaDirectorio {
  id: number;
  slug: string;
  url: string;
  nombre: string;
  /** Categorías del directorio (el icono bajo el título: «Bodega», «Pueblo»…). */
  categorias: string[];
  /** Año de fundación si la prosa lo dice de forma inequívoca (el texto no se guarda). */
  anio_fundacion: number | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  /** «Lunes: 10:00 h - 17:00 h» … del bloque «Horario de visitas». */
  horario_visitas: { dia: string; horas: string }[];
  codigo_postal: string | null;
}

const entidades = (s: string) => cheerio.load(`<p>${s}</p>`)("p").text().replace(/\s+/g, " ").trim();

const IDIOMAS: Record<string, string> = {
  español: "es", castellano: "es", inglés: "en", ingles: "en", francés: "fr", frances: "fr",
  alemán: "de", aleman: "de", portugués: "pt", portugues: "pt", italiano: "it",
};

/** «Idiomas: español e inglés» → ["es", "en"]. Solo si la descripción lo dice con esa palabra. */
export function idiomasDe(texto: string): string[] {
  const m = /idiomas?\s*:\s*([^.;\n]{0,80})/i.exec(texto);
  if (!m) return [];
  const out: string[] = [];
  for (const palabra of m[1]!.toLowerCase().split(/[^a-záéíóúñ]+/)) {
    const c = IDIOMAS[palabra];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** «Duración: 2 horas», «duración aproximada de 90 minutos», «duración 1h 30». null si no está claro. */
export function duracionDe(texto: string): number | null {
  const m = /duraci[óo]n(?:\s+aproximada)?\s*(?:de|:)?\s*(?:unas?\s+)?(\d+(?:[.,]\d+)?)\s*(horas?|hs?\b|minutos?|min\b)/i.exec(texto);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  const minutos = /^h/i.test(m[2]!) ? Math.round(n * 60) : Math.round(n);
  return minutos > 0 && minutos <= 24 * 60 ? minutos : null;
}

/** URLs en español de un sitemap de Yoast que contienen `/<ruta>/` (las `/en/` son duplicados). */
export function urlsSitemap(xml: string, ruta: "producto" | "directories"): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = m[1]!;
    const p = new URL(url).pathname;
    if (new RegExp(`^/${ruta}/[^/]+/?$`).test(p) && !out.includes(url)) out.push(url);
  }
  return out;
}

const soloTexto = ($: cheerio.CheerioAPI, el: string) => {
  const c = $(el).first().clone();
  c.find("script, style, noscript").remove();
  return c.text().replace(/\s+/g, " ").trim();
};

/** «40,00 €» → 40; «1.250,50 €» → 1250,5. */
export function importeDe(texto: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/.exec(texto);
  if (!m) return null;
  const n = Number(m[1]!.replace(/\./g, "") + (m[2] ? `.${m[2]}` : ""));
  return n > 0 ? n : null;
}

/** HTML de `/producto/<slug>/` → producto, o null si no parece una ficha de producto. */
export function parsearProducto(html: string, url: string): ProductoRuta | null {
  const $ = cheerio.load(html);
  const id = /\bpostid-(\d+)\b/.exec($("body").attr("class") ?? "")?.[1];
  const nombre = entidades($("h1.product_title").first().text() || "");
  if (!id || !nombre) return null;
  const reserva = $("form.cart").first().attr("action")?.trim();
  const categorias = [...new Set([...html.matchAll(/\bproduct_cat-([a-z0-9-]+)/g)].map((m) => m[1]!.replace(/-/g, " ")))];
  const descripcion = soloTexto($, "#content") || soloTexto($, "body");
  return {
    id: Number(id),
    nombre,
    permalink: url,
    precio: importeDe($("p.price .woocommerce-Price-amount").first().text()),
    url_reserva: reserva && /^https?:\/\//i.test(reserva) && reserva.replace(/\/$/, "") !== url.replace(/\/$/, "") ? reserva : null,
    categorias,
    duracion_minutos: duracionDe(descripcion),
    idiomas: idiomasDe(descripcion),
  };
}

const FUNDACION = /\b(?:fundad[ao]s?|fundaci[óo]n|constituid[ao])\s+(?:en|el)\s+(?:el\s+a[ñn]o\s+)?(1[0-9]{3}|20[0-2][0-9])\b/i;
/** Año de fundación solo si la prosa dice «fundada en 1985» (o equivalente); si hay varios, ninguno. */
export function anioFundacionDe(texto: string): number | null {
  const todos = [...texto.matchAll(new RegExp(FUNDACION.source, "gi"))].map((m) => Number(m[1]));
  const unicos = [...new Set(todos)];
  return unicos.length === 1 ? unicos[0]! : null;
}

/** Bloque «Información de contacto» y «Horario de visitas» de la ficha HTML. */
export function parsearContacto(html: string): Pick<FichaDirectorio, "direccion" | "telefono" | "email" | "web" | "horario_visitas" | "codigo_postal"> {
  const $ = cheerio.load(html);
  const caja = $(".agent-info__booking-section").first();
  const fila = (icono: string) => caja.find(`i.${icono}`).first().closest("div").next("div");
  const limpio = (s: string | undefined) => (s ? s.replace(/\s+/g, " ").trim() || null : null);
  const direccion = limpio(fila("fa-map-marker-alt").text());
  const telefono = limpio(fila("fa-phone-alt").find("a[href^='tel:']").first().attr("href")?.slice(4) ?? fila("fa-phone-alt").text());
  const email = limpio(fila("fa-envelope").find("a[href^='mailto:']").first().attr("href")?.slice(7));
  const web = limpio(fila("fa-globe").find("a").first().attr("href"));
  const horario: { dia: string; horas: string }[] = [];
  const titulo = $("#openTime").first();
  titulo.closest(".row").nextAll(".row").first().find("p").each((_, p) => {
    const dia = $(p).find("strong").first().text().replace(/:\s*$/, "").trim();
    const horas = $(p).clone().children("strong, i").remove().end().text().replace(/\s+/g, " ").trim();
    if (dia && horas) horario.push({ dia, horas });
  });
  // El código postal solo aparece en el mapa incrustado: «…+42351+España».
  const cp = /\+(\d{5})\+Espa/.exec($("iframe[src*='maps.google']").first().attr("src") ?? "")?.[1] ?? null;
  return { direccion, telefono, email, web, horario_visitas: horario, codigo_postal: cp };
}

/** HTML de `/directories/<slug>/` → ficha con contacto y categorías, o null si no es una ficha. */
export function parsearFichaDirectorio(html: string, url: string): FichaDirectorio | null {
  const $ = cheerio.load(html);
  const id = /\bpostid-(\d+)\b/.exec($("body").attr("class") ?? "")?.[1];
  const contenido = $(".agent-info__content").first();
  const nombre = entidades(contenido.find("h1").first().text());
  if (!id || !nombre) return null;
  const categorias = contenido.find("h1").first().next("div").find("img[alt]").map((_, i) => $(i).attr("alt")!.trim()).get();
  contenido.find("#similarPrppertycarousel, script, style").remove();
  const prosa = contenido.text().replace(/\s+/g, " ");
  return {
    id: Number(id),
    slug: new URL(url).pathname.split("/").filter(Boolean).pop()!,
    url,
    nombre,
    categorias,
    anio_fundacion: anioFundacionDe(prosa),
    ...parsearContacto(html),
  };
}

/** Las categorías de bodega del directorio. */
export const esBodega = (f: Pick<FichaDirectorio, "categorias">) =>
  f.categorias.some((c) => /^bodegas?( subterr[aá]neas?)?$/i.test(c.trim()));
