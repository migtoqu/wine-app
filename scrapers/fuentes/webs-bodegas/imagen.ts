// Imágenes enlazadas (fase B), nunca descargadas: una foto de la bodega o del
// viñedo por bodega y la botella de cada vino. Fuera logos, sellos, iconos,
// imágenes pequeñas y de terceros; solo hosts del propio sitio o de la CDN de
// su plataforma.
import type { AnyNode, Element } from "domhandler";
import type { Doc } from "./html.ts";

export interface CandidataImagen {
  url: string;
  alt: string | null;
  /** og:image, imagen del contenido (o fondo CSS de una sección) o del JSON-LD `Product`. */
  origen: "og" | "contenido" | "fondo" | "producto";
  ancho: number | null;
  alto?: number | null;
  /** Dentro de la cabecera del tema (`<header>`): un héroe vale, pero va detrás del contenido. */
  cabecera?: boolean;
}

const NO_FOTO = /logo|icon|favicon|sello|medall?a|award|premio|badge|brand|marca|placeholder|default|dummy|sprite|avatar|banner-cookies|cookie|flag|bandera|whatsapp|facebook|instagram|twitter|youtube|tripadvisor|google|mapa|map[_-]|loader|spinner|pixel|blank|transparent|qr|firma|signature|kit-digital|next-?generation|feder|fondos?-europeos|ministerio|gobierno|junta|diputacion|michelin|guia-?penin|parker|decanter|captura|screenshot|whatsapp|slogan|lettering|ilustracion|dibujo|anagrama|escudo|imagotipo|isotipo|decoration|decoracion|textura|texture|pattern|separador|divider|shape|mancha|trazo/i;
const EXT_NO = /\.(svg|gif|ico)(?:$|[?#])/i;
const EXT_FOTO = /\.(jpe?g|png|webp|avif)(?:$|[?#&/])|[?&](format|fm)=(jpe?g|png|webp|avif)/i;
const VINEDO = /vi[ñn]edo|vineyard|vinyes?|vi[ñn]as?\b|cepas?|parcela|paraje|vendimia|harvest|terroir|finca|paisaje|campo/i;
const BODEGA = /bodega|winery|celler|cellar|barric|calado|cueva|nave|sala|edificio|fachada|instalaciones|exterior|interior|equipo|familia|historia|nosotros|about/i;
/** Fotos de producto: no sirven como foto de la bodega. */
const PRODUCTO = /botell|bottle|producto|product|etiqueta|label|packshot|estuche|caja|pack\b|copa|glass|magnum|tienda|shop|cart\b|\b(?:crianza|reserva|roble|tinto|blanco|rosado|clarete|verdejo|fermentado|cosecha|joven|espumoso|cava)\b/i;
/** Nombres típicos de imagen de cabecera o portada. */
const HEROE = /hero|slider|slide|portada|cabecera|header|banner|fondo|background|\bbg\b|bg[-_]|home|inicio|principal|panoramic|aerea|vista/i;
/** CDNs de plataforma que sirven las imágenes del propio sitio. */
const CDN_PLATAFORMA = /(^|\.)(wp\.com|wixstatic\.com|cdn\.shopify\.com|squarespace-cdn\.com|cloudfront\.net|cdn-website\.com|website-editor\.net|siweb\.es|hubspotusercontent[\w-]*\.net|cmsstatic\.com|webnode\.page|jimcdn\.com|myshopify\.com)$/i;
/** Proxies de optimización (ShortPixel, Jetpack…) que llevan la URL original del sitio en la ruta. */
const PROXY_CON_ORIGEN = /(^|\.)(shortpixel\.ai|wp\.com|imagekit\.io|optimole\.com)$/i;
/** Plataformas que sirven la imagen sin extensión en la ruta. */
const SIN_EXTENSION = /(^|\.)(wixstatic\.com|squarespace-cdn\.com|cloudfront\.net|cdn\.shopify\.com|myshopify\.com|hubspotusercontent[\w-]*\.net)$/i;

export function hostPermitido(url: string, hostsSitio: (host: string) => boolean): boolean {
  try {
    const u = new URL(url);
    if (hostsSitio(u.host)) return true;
    if (PROXY_CON_ORIGEN.test(u.host)) {
      // https://sp-ao.shortpixel.ai/client/…/https://bodega.es/wp-content/… o https://i0.wp.com/bodega.es/…
      for (const m of u.pathname.matchAll(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\//gi)) if (hostsSitio(m[1]!.toLowerCase())) return true;
      return false;
    }
    return CDN_PLATAFORMA.test(u.host);
  } catch {
    return false;
  }
}

/**
 * URL absoluta y «canónica» de la imagen: sin plantillas sin rellenar (Shopify `{width}`), con el
 * original de Wix en vez de la miniatura difuminada, solo http(s).
 */
export function normalizarUrlImagen(src: string | undefined | null, base: string): string | null {
  if (!src) return null;
  const limpio = src.trim().split(/\s+/)[0]!;
  if (!limpio || limpio.startsWith("data:")) return null;
  try {
    const u = new URL(limpio.replace(/%7Bwidth%7D|\{width\}/gi, "1600"), base);
    if (!/^https?:$/.test(u.protocol)) return null;
    // Wix: /media/<id>~mv2.jpg/v1/fill/w_147,h_95,…/<id>.jpg → /media/<id>~mv2.jpg (el original).
    if (/(^|\.)wixstatic\.com$/i.test(u.host)) {
      const m = u.pathname.match(/^(\/media\/[^/]+)\/v1\//);
      if (m) return `${u.origin}${m[1]}`;
    }
    return u.href;
  } catch {
    return null;
  }
}

/** La URL más ancha de un `srcset` («a.jpg 300w, b.jpg 1600w»), con su ancho. */
function mayorDeSrcset(srcset: string | undefined, base: string): { url: string; ancho: number | null } | null {
  if (!srcset) return null;
  let mejor: { url: string; ancho: number | null } | null = null;
  for (const parte of srcset.split(/,\s+(?=\S)/)) {
    const [src, desc] = parte.trim().split(/\s+/);
    const url = normalizarUrlImagen(src, base);
    if (!url) continue;
    const ancho = desc?.endsWith("w") ? Number(desc.slice(0, -1)) || null : null;
    if (!mejor || (ancho ?? 0) > (mejor.ancho ?? 0)) mejor = { url, ancho };
  }
  return mejor;
}

/** Fichas de clase/id que marcan un logo: `logo`, `site-logo`, `custom-logo`, `navbar-brand`… (no `wp-custom-logo` del body). */
const TOKEN_LOGO = /^(?:(?:site|custom|header|main|nav|navbar|brand|mobile|sticky|footer)[-_])?logo(?:[-_]?(?:img|image|link|wrap|wrapper|container|box|holder|main|dark|light|white|black|sticky|mobile))?$|^navbar-brand$|^brand(?:ing)?$|^site-branding$/i;

function tieneTokenLogo(el: AnyNode): boolean {
  const a = (el as Element).attribs;
  if (!a) return false;
  return [...(a.class ?? "").split(/\s+/), a.id ?? ""].some((t) => t && TOKEN_LOGO.test(t));
}

/** og:image y las imágenes grandes del contenido de una página (también fondos CSS de secciones). */
export function candidatasDePagina($: Doc, base: string): CandidataImagen[] {
  const out: CandidataImagen[] = [];
  const meter = (c: CandidataImagen) => {
    if (!out.some((x) => x.url === c.url)) out.push(c);
  };
  // Logos: la propia imagen o un ancestro cercano (hasta 3 niveles, nunca body/html) con clase de logo.
  const esLogo = (el: AnyNode): boolean => {
    let n: AnyNode | null = el;
    for (let i = 0; n && i < 4; i++) {
      const tag = (n as Element).tagName?.toLowerCase();
      if (tag === "body" || tag === "html") return false;
      if (tieneTokenLogo(n)) return true;
      n = n.parent;
    }
    return false;
  };
  const logos = new Set<string>();
  $('link[rel~="icon"], link[rel="apple-touch-icon"]').each((_, el) => {
    const u = normalizarUrlImagen($(el).attr("href"), base);
    if (u) logos.add(u);
  });
  $("img").each((_, el) => {
    if (!esLogo(el)) return;
    const u = normalizarUrlImagen($(el).attr("data-src") ?? $(el).attr("src"), base);
    if (u) logos.add(u);
  });
  const og = normalizarUrlImagen($('meta[property="og:image"]').attr("content") ?? $('meta[name="og:image"]').attr("content") ?? $('meta[name="twitter:image"]').attr("content"), base);
  if (og && !logos.has(og)) {
    const ancho = Number($('meta[property="og:image:width"]').attr("content")) || null;
    const alto = Number($('meta[property="og:image:height"]').attr("content")) || null;
    meter({ url: og, alt: $('meta[property="og:image:alt"]').attr("content") ?? null, origen: "og", ancho, alto });
  }
  $("img, picture source").each((_, el) => {
    const $el = $(el);
    if ($el.closest("footer, nav, .menu, [role=navigation]").length || esLogo(el)) return;
    const img = el.tagName === "source" ? $el.parent().find("img").first() : $el;
    const srcset = mayorDeSrcset($el.attr("data-srcset") ?? $el.attr("data-lazy-srcset") ?? $el.attr("srcset"), base);
    const directa = normalizarUrlImagen($el.attr("data-src") ?? $el.attr("data-lazy-src") ?? $el.attr("data-original") ?? $el.attr("src"), base);
    const u = srcset?.url ?? directa;
    if (!u || logos.has(u) || (directa && logos.has(directa))) return;
    const anchoAttr = Number(img.attr("width")) || null;
    const altoAttr = Number(img.attr("height")) || null;
    const ancho = srcset?.ancho ?? anchoAttr;
    // El alto escala con el ancho elegido del srcset.
    const alto = altoAttr && anchoAttr && ancho ? Math.round((altoAttr * ancho) / anchoAttr) : altoAttr;
    meter({ url: u, alt: img.attr("alt")?.trim() || null, origen: "contenido", ancho, alto, cabecera: $el.closest("header").length > 0 });
  });
  // Fondos de sección (Elementor, Divi, Revolution Slider…): style="background-image:url(…)" y data-bg.
  $("[style*=background], [data-bg], [data-background], [data-lazy-background], [data-bg-image], [data-thumb]").each((_, el) => {
    const $el = $(el);
    if ($el.closest("footer, nav, .menu").length || esLogo(el)) return;
    const estilo = $el.attr("style") ?? "";
    const m = estilo.match(/background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    const src = m?.[1] ?? $el.attr("data-bg") ?? $el.attr("data-background") ?? $el.attr("data-lazy-background") ?? $el.attr("data-bg-image");
    const u = normalizarUrlImagen(src?.replace(/^url\(\s*['"]?|['"]?\s*\)$/g, ""), base);
    if (!u || logos.has(u)) return;
    meter({ url: u, alt: $el.attr("aria-label")?.trim() || $el.attr("title")?.trim() || null, origen: "fondo", ancho: null, alto: null, cabecera: $el.closest("header").length > 0 });
  });
  return out.slice(0, 60);
}

function nombreDe(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

export function esFoto(c: CandidataImagen): boolean {
  let host: string;
  try {
    host = new URL(c.url).host;
  } catch {
    return false;
  }
  const nombre = nombreDe(c.url);
  if (EXT_NO.test(c.url) || NO_FOTO.test(nombre) || NO_FOTO.test(c.alt ?? "")) return false;
  // Una URL que no parece de imagen (una página, «/img/bodega») no se enlaza como foto.
  if (!EXT_FOTO.test(c.url) && !SIN_EXTENSION.test(host)) return false;
  if (c.ancho != null && c.ancho < 600) return false;
  if (c.alto != null && c.alto < 300) return false;
  // Miniaturas («foto-150x150.jpg», «-300x200») y anchos en la propia URL (Wix «w_147», Duda «-270w»).
  const dim = nombre.match(/-(\d{2,4})x(\d{2,4})\.\w+$/);
  if (dim && Number(dim[1]) < 600) return false;
  const w = c.url.match(/[/,_-]w_(\d{2,4})\b|-(\d{2,4})w\.\w+(?:$|\?)/);
  if (w && Number(w[1] ?? w[2]) < 600) return false;
  return true;
}

export interface ImagenElegida {
  url: string;
  alt: string | null;
  tipo: "bodega" | "vinedo" | "botella";
  pagina: string;
}

const texto = (c: CandidataImagen) => `${decodeURIComponent(safePath(c.url))} ${c.alt ?? ""}`;
function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
const apaisada = (c: CandidataImagen) => c.ancho == null || c.alto == null || c.ancho >= c.alto * 1.15;
const esProducto = (c: CandidataImagen) => PRODUCTO.test(texto(c)) || (c.ancho != null && c.alto != null && c.alto > c.ancho * 1.3);
const grande = (c: CandidataImagen, min: number) => c.ancho == null || c.ancho >= min;

/**
 * Foto de la bodega. `paginas` va en orden de preferencia (historia, enoturismo y la portada al final):
 * 1. og:image de una página que no sea de producto;
 * 2. una imagen del contenido (o fondo de sección) cuyo nombre o alt diga bodega o viñedo;
 * 3. una imagen de cabecera o portada grande y apaisada (héroe), que no sea de producto.
 */
export function elegirImagenBodega(
  paginas: { url: string; candidatas: CandidataImagen[] }[],
  hostsSitio: (host: string) => boolean,
): ImagenElegida | null {
  const validas = (p: { candidatas: CandidataImagen[] }) => p.candidatas.filter((c) => hostPermitido(c.url, hostsSitio) && esFoto(c));
  const elegida = (c: CandidataImagen, pagina: string): ImagenElegida => ({ url: c.url, alt: c.alt, tipo: tipoFoto(c), pagina });
  for (const p of paginas) {
    const og = validas(p).find((c) => c.origen === "og" && !esProducto(c) && apaisada(c));
    if (og) return elegida(og, p.url);
  }
  // Fotos antes que gráficos: los PNG suelen ser recortes, ilustraciones o texto.
  const fotosPrimero = (cs: CandidataImagen[]) => [...cs].sort((a, b) => Number(/\.png(?:$|[?#])/i.test(a.url)) - Number(/\.png(?:$|[?#])/i.test(b.url)));
  for (const p of paginas) {
    const vs = fotosPrimero(validas(p).filter((x) => x.origen !== "og" && !esProducto(x) && apaisada(x) && grande(x, 600)));
    const c = vs.find((x) => !x.cabecera && (VINEDO.test(texto(x)) || BODEGA.test(texto(x)))) ?? vs.find((x) => VINEDO.test(texto(x)) || BODEGA.test(texto(x)));
    if (c) return elegida(c, p.url);
  }
  for (const p of paginas) {
    const c = fotosPrimero(validas(p)).find((x) => x.origen !== "og" && !esProducto(x) && apaisada(x) && (x.ancho != null ? x.ancho >= 1200 || (x.ancho >= 800 && HEROE.test(texto(x))) : HEROE.test(texto(x)) || x.origen === "fondo"));
    if (c) return elegida(c, p.url);
  }
  return null;
}

const tipoFoto = (c: CandidataImagen): "bodega" | "vinedo" => (VINEDO.test(texto(c)) && !BODEGA.test(c.alt ?? "") ? "vinedo" : "bodega");

/** Botella del vino: imagen del producto (Woo / JSON-LD), sin logos ni iconos. */
export function imagenBotella(url: string | null | undefined, alt: string | null, pagina: string, hostsSitio: (host: string) => boolean): ImagenElegida | null {
  const abs = normalizarUrlImagen(url, pagina);
  if (!abs) return null;
  if (!hostPermitido(abs, hostsSitio) || EXT_NO.test(abs)) return null;
  const nombre = nombreDe(abs);
  if (/logo|icon|placeholder|woocommerce-placeholder|default|dummy/i.test(nombre)) return null;
  return { url: abs, alt, tipo: "botella", pagina };
}
