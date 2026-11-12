// Utilidades de HTML para webs de bodegas: texto principal por bloques (sin
// cabecera, pie, menús ni avisos de cookies), enlaces, título, migas, JSON-LD
// y meta robots. Nada de esto se guarda: solo alimenta la extracción de hechos.
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { limpiarEspacios } from "../../lib/texto.ts";

export type Doc = CheerioAPI;

export function cargar(html: string): Doc {
  return cheerio.load(html);
}

// Ruido habitual de WordPress y constructores (Divi, Elementor, WPBakery) y de los
// banners de cookies/accesibilidad: se quita antes de leer el texto.
const RUIDO = [
  "script", "style", "noscript", "template", "svg", "iframe", "form", "header", "footer", "nav",
  "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[aria-hidden=true]",
  "#cookie-law-info-bar", "#cmplz-cookiebanner-container", ".cmplz-cookiebanner", "#moove_gdpr_cookie_info_bar",
  "#moove_gdpr_cookie_modal", ".cookie-notice-container", "#cookie-notice", "#CybotCookiebotDialog",
  ".cky-consent-container", ".cky-modal", "#onetrust-consent-sdk", "[class*=cookie-banner]", "[id*=cookie-banner]",
  ".djacc", "#djacc", ".age-gate", "#age-gate", ".agegate", ".av_wrapper", ".menu", ".sub-menu",
  ".site-header", ".site-footer", "#footer", "#header", ".et-l--header", ".et-l--footer", "#main-header",
  "#main-footer", ".elementor-location-header", ".elementor-location-footer", ".breadcrumb", ".breadcrumbs",
  ".woocommerce-breadcrumb", ".screen-reader-text", ".skip-link", ".related", ".upsells", ".share", ".sharedaddy",
];

const BLOQUES = "h1, h2, h3, h4, h5, h6, p, li, dt, dd, td, th, blockquote, figcaption";

export interface Bloque {
  /** «h1».. «h6» o «p» para el resto. */
  tipo: string;
  texto: string;
}

/** Contenedor principal de la página, o el body. */
function principal($: Doc) {
  for (const sel of ["main", "article", "#main", "#content", ".entry-content", ".site-content", "#et-main-area"]) {
    const el = $(sel).first();
    if (el.length && limpiarEspacios(el.text()).length > 200) return el;
  }
  return $("body").length ? $("body") : $.root();
}

/** Texto principal como lista de bloques en orden de documento. */
export function bloques($: Doc): Bloque[] {
  const c = cheerio.load($.html());
  c(RUIDO.join(", ")).remove();
  const raiz = principal(c);
  const out: Bloque[] = [];
  raiz.find(BLOQUES).each((_, el) => {
    const $el = c(el);
    // Solo bloques hoja: un <li> con <p> dentro se lee por sus <p>.
    if ($el.find(BLOQUES).length > 0) return;
    const texto = limpiarEspacios($el.text());
    if (!texto) return;
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? "p";
    out.push({ tipo: /^h[1-6]$/.test(tag) ? tag : "p", texto });
  });
  // Constructores que ponen el texto en <div> sin párrafos: el texto plano como un bloque.
  if (out.length === 0) {
    const texto = limpiarEspacios(raiz.text());
    if (texto) out.push({ tipo: "p", texto });
  }
  return out;
}

const BLOQUES_DIV = `${BLOQUES}, div, section, article, span`;

/**
 * Bloques de un contenedor de ficha (adaptadores): como `bloques`, pero también los <div>, <section>
 * y <span> hoja, porque los constructores (Elementor, Divi, CMS a medida) ponen ahí etiqueta y valor
 * sin párrafos. Un elemento con hijos de bloque se lee por sus hijos.
 */
export function bloquesDeContenedor(html: string): Bloque[] {
  const c = cheerio.load(`<html><body><main>${html}</main></body></html>`);
  // Las pestañas ocultas (`aria-hidden`) del contenedor son parte de la ficha: no se quitan.
  c(RUIDO.filter((r) => !/^(header|footer|nav|\.menu|\.sub-menu|\[aria-hidden=true\])$/.test(r)).join(", ")).remove();
  const out: Bloque[] = [];
  c("main").find(BLOQUES_DIV).each((_, el) => {
    const $el = c(el);
    if ($el.find(BLOQUES_DIV).length > 0 && $el.children().toArray().some((h) => c(h).is(BLOQUES_DIV))) {
      // Texto suelto junto a hijos de bloque («<div>Grado <div>14%</div></div>»): solo sus nodos de texto.
      const suelto = limpiarEspacios($el.contents().toArray().filter((n) => n.type === "text").map((n) => c(n).text()).join(" "));
      if (suelto) out.push({ tipo: "p", texto: suelto });
      return;
    }
    const texto = limpiarEspacios($el.text());
    if (!texto) return;
    // Un <span> dentro de un bloque ya leído no se repite.
    if ((el as { tagName?: string }).tagName === "span" && $el.parent().is(BLOQUES_DIV) && $el.parent().children().length === 1) return;
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? "p";
    out.push({ tipo: /^h[1-6]$/.test(tag) ? tag : "p", texto });
  });
  // Spans hermanos sueltos producen la misma línea varias veces: fuera los repetidos consecutivos.
  return out.filter((b, i) => i === 0 || b.texto !== out[i - 1]!.texto);
}

/** Texto plano de un fragmento HTML (contenido de la API de WordPress). */
export function bloquesDeFragmento(html: string): Bloque[] {
  // Shortcodes de constructores ([et_pb_text …], [vc_row]) que la API deja sin procesar.
  const limpio = html.replace(/\[\/?[a-z][a-z0-9_-]*(?:\s[^\]]*)?\]/gi, " ");
  return bloques(cargar(`<html><body><main>${limpio}</main></body></html>`));
}

export function textoDe(b: Bloque[]): string {
  return b.map((x) => x.texto).join("\n");
}

/** Título de la página sin el sufijo del sitio («Visitas – Bodegas X» → «Visitas»). */
export function titulo($: Doc): string | null {
  const t = limpiarEspacios($("title").first().text());
  if (!t) return null;
  return limpiarTitulo(t);
}

/**
 * Títulos que no nombran nada: plantillas de ficha («Ficha producto», «Ficha técnica»), etiquetado
 * nutricional y portadas («Inicio», «Tienda»).
 */
export const TITULO_GENERICO = /^(?:d\.?\s?o\.?\s|inicio$|home$|vinos?$|wines?$|tienda$|shop$|productos?$|fichas?(?:\s+de)?\s+(?:productos?|t[eé]cnicas?|vinos?|cata)$|fichas?$|etiquetado(?:\s+nutricional)?$|info(?:rmaci[oó]n)?\s+nutricional$|valores\s+nutricionales$|nutrition(?:al)?(?:\s+(?:facts|information))?$|ingredientes$|product\s+sheet$|technical\s+sheet$|data\s+sheet$|descargar(?:\s+ficha)?$|ver\s+producto$|detalles?(?:\s+del\s+producto)?$)/i;

/** Título de página sin el sufijo del sitio; si la primera parte es genérica, la siguiente que no lo sea. */
export function limpiarTitulo(t: string): string {
  const partes = limpiarEspacios(decodificarEntidades(t)).split(/\s+[|–—·•»:-]\s+/).map((x) => x.trim()).filter(Boolean);
  return partes.find((x) => !TITULO_GENERICO.test(x)) ?? partes[0] ?? "";
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#8211": "–", "#8212": "—", "#038": "&", "#8217": "’", "#8220": "“", "#8221": "”", "#039": "'" };

/** Decodifica las entidades más comunes (títulos de la API de WordPress vienen escapados). */
export function decodificarEntidades(s: string): string {
  return s
    .replace(/&(#?[a-z0-9]+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (ENTIDADES[k]) return ENTIDADES[k]!;
      if (/^#\d+$/.test(k)) return String.fromCodePoint(Number(k.slice(1)));
      if (/^#x[0-9a-f]+$/.test(k)) return String.fromCodePoint(parseInt(k.slice(2), 16));
      return m;
    })
    .replace(/<[^>]+>/g, "");
}

export function h1($: Doc): string | null {
  return limpiarEspacios($("h1").first().text()) || null;
}

export interface Enlace {
  url: string;
  texto: string;
}

/** Enlaces absolutos (sin #fragmento) del documento. */
export function enlaces($: Doc, base: string): Enlace[] {
  const out: Enlace[] = [];
  const vistos = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")!.trim();
    if (!href || /^(mailto|tel|javascript|whatsapp):/i.test(href) || href.startsWith("#")) return;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(url.protocol)) return;
    url.hash = "";
    const texto = limpiarEspacios($(el).text() || $(el).attr("title") || $(el).attr("aria-label") || "");
    const clave = `${url.href}|${texto}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    out.push({ url: url.href, texto });
  });
  return out;
}

/** Bloques JSON-LD (aplanando @graph). Los que no son JSON válido se ignoran. */
export function jsonLd($: Doc): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const meter = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(meter);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o["@graph"])) meter(o["@graph"]);
      else out.push(o);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      meter(JSON.parse($(el).text()));
    } catch {
      /* JSON-LD roto: se ignora */
    }
  });
  return out;
}

export function tiposJsonLd(nodos: Record<string, unknown>[]): string[] {
  return [...new Set(nodos.flatMap((n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).filter((t): t is string => typeof t === "string")))];
}

/** Migas de pan: JSON-LD BreadcrumbList o el HTML habitual. */
export function migas($: Doc, nodos: Record<string, unknown>[] = jsonLd($)): string[] {
  const bl = nodos.find((n) => n["@type"] === "BreadcrumbList");
  if (bl && Array.isArray(bl.itemListElement)) {
    return (bl.itemListElement as Record<string, unknown>[])
      .map((i) => (typeof i.name === "string" ? i.name : typeof (i.item as Record<string, unknown>)?.name === "string" ? ((i.item as Record<string, unknown>).name as string) : ""))
      .map((s) => limpiarEspacios(s))
      .filter(Boolean);
  }
  const html = $(".breadcrumb, .breadcrumbs, .woocommerce-breadcrumb, nav[aria-label*=readcrumb]").first();
  if (!html.length) return [];
  const items = html.find("a, span, li").map((_, el) => limpiarEspacios($(el).text())).get().filter(Boolean);
  return [...new Set(items)];
}

/** Directivas de `<meta name="robots">` (y `wine-app-bot` si la hubiera) en minúsculas. */
export function metaRobots($: Doc): string[] {
  const out: string[] = [];
  $('meta[name="robots"], meta[name="wine-app-bot"]').each((_, el) => {
    out.push(...($(el).attr("content") ?? "").toLowerCase().split(/\s*,\s*/).filter(Boolean));
  });
  return out;
}

/** Directivas de la cabecera X-Robots-Tag aplicables a nosotros (sin prefijo o con el de nuestro bot). */
export function xRobotsTag(valor: string | null | undefined): string[] {
  if (!valor) return [];
  return valor
    .toLowerCase()
    .split(/,(?![^:]*:)/)
    .flatMap((parte) => {
      const m = parte.trim().match(/^([a-z0-9_-]+):\s*(.*)$/);
      if (m && !["unavailable_after", "max-snippet", "max-image-preview", "max-video-preview"].includes(m[1]!)) {
        return m[1] === "wine-app-bot" ? m[2]!.split(/\s*,\s*/) : [];
      }
      return [parte.trim()];
    })
    .filter(Boolean);
}

// Palabras vacías muy frecuentes: distinguen español de inglés en unas pocas frases.
const VACIAS_ES = new Set(["el", "la", "los", "las", "de", "del", "y", "en", "con", "que", "por", "para", "su", "sus", "una", "un", "es", "se", "al", "nuestro", "nuestra", "vino"]);
const VACIAS_EN = new Set(["the", "and", "of", "with", "in", "to", "is", "our", "its", "this", "from", "for", "on", "wine", "aged", "months", "nose", "palate", "grapes"]);

/**
 * Idioma de un texto por sus palabras vacías («es», «en») o null si es corto o dudoso. Sirve para
 * las webs que publican la versión inglesa sin prefijo /en/ («/los-vinos-3/sheet-vastago/»).
 */
export function idiomaDeTexto(texto: string): "es" | "en" | null {
  const palabras = texto.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (palabras.length < 25) return null;
  let es = 0, en = 0;
  for (const p of palabras) {
    if (VACIAS_ES.has(p)) es++;
    if (VACIAS_EN.has(p)) en++;
  }
  if (en >= 5 && en > es * 2) return "en";
  if (es >= 5 && es > en * 2) return "es";
  return null;
}
