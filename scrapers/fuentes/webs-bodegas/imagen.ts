// Imágenes enlazadas (fase B), nunca descargadas: una foto de la bodega o del
// viñedo por bodega y la botella de cada vino. Fuera logos, sellos, iconos,
// imágenes pequeñas y de terceros; solo hosts del propio sitio o de la CDN de
// su plataforma.
import type { Doc } from "./html.ts";

export interface CandidataImagen {
  url: string;
  alt: string | null;
  /** og:image, imagen del contenido o del JSON-LD `Product`. */
  origen: "og" | "contenido" | "producto";
  ancho: number | null;
}

const NO_FOTO = /logo|icon|favicon|sello|medall?a|award|premio|badge|brand|marca|placeholder|default|sprite|avatar|banner-cookies|cookie|flag|bandera|whatsapp|facebook|instagram|twitter|youtube|tripadvisor|google|mapa|map[_-]|loader|spinner|pixel|blank|transparent|qr|firma|signature|kit-digital|next-?generation|feder|fondos?-europeos|ministerio|gobierno|junta|diputacion/i;
const EXT_NO = /\.(svg|gif|ico)(?:$|[?#])/i;
const VINEDO = /vi[ñn]edo|vineyard|vi[ñn]as?\b|cepas?|parcela|paraje|vendimia|terroir|finca/i;
const BODEGA = /bodega|winery|cellar|barric|calado|cueva|nave|sala|edificio|fachada|instalaciones|equipo|familia/i;
/** CDNs de plataforma que sirven las imágenes del propio sitio. */
const CDN_PLATAFORMA = /(^|\.)(wp\.com|wixstatic\.com|cdn\.shopify\.com|squarespace-cdn\.com|cloudfront\.net)$/i;

export function hostPermitido(url: string, hostsSitio: (host: string) => boolean): boolean {
  try {
    const h = new URL(url).host;
    return hostsSitio(h) || CDN_PLATAFORMA.test(h);
  } catch {
    return false;
  }
}

function absoluta(src: string | undefined, base: string): string | null {
  if (!src) return null;
  try {
    const u = new URL(src.trim().split(/\s+/)[0]!, base);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** og:image y las imágenes grandes del contenido de una página. */
export function candidatasDePagina($: Doc, base: string): CandidataImagen[] {
  const out: CandidataImagen[] = [];
  // El logo declarado por el tema (custom-logo, link rel=icon…) nunca es una foto de la bodega.
  const logos = new Set<string>();
  $(".custom-logo, .logo img, header img, .site-logo img, #logo img, [class*=logo] img, img[class*=logo]").each((_, el) => {
    const u = absoluta($(el).attr("src"), base);
    if (u) logos.add(u);
  });
  const og = absoluta($('meta[property="og:image"]').attr("content") ?? $('meta[name="og:image"]').attr("content"), base);
  if (og && !logos.has(og)) {
    const ancho = Number($('meta[property="og:image:width"]').attr("content")) || null;
    out.push({ url: og, alt: $('meta[property="og:image:alt"]').attr("content") ?? null, origen: "og", ancho });
  }
  $("main img, article img, .entry-content img, #content img, body img").each((_, el) => {
    const $el = $(el);
    if ($el.closest("header, footer, nav, .menu, .logo").length) return;
    const src = $el.attr("data-src") ?? $el.attr("data-lazy-src") ?? $el.attr("src");
    const u = absoluta(src, base);
    if (!u || logos.has(u) || u.startsWith("data:")) return;
    const ancho = Number($el.attr("width")) || null;
    if (!out.some((c) => c.url === u)) out.push({ url: u, alt: $el.attr("alt")?.trim() || null, origen: "contenido", ancho });
  });
  return out.slice(0, 40);
}

export function esFoto(c: CandidataImagen): boolean {
  const nombre = decodeURIComponent(new URL(c.url).pathname.split("/").pop() ?? "");
  if (EXT_NO.test(c.url) || NO_FOTO.test(nombre) || NO_FOTO.test(c.alt ?? "")) return false;
  if (c.ancho != null && c.ancho < 600) return false;
  // Miniaturas de WordPress («foto-150x150.jpg», «-300x200»).
  const dim = nombre.match(/-(\d{2,4})x(\d{2,4})\.\w+$/);
  if (dim && Number(dim[1]) < 600) return false;
  return true;
}

export interface ImagenElegida {
  url: string;
  alt: string | null;
  tipo: "bodega" | "vinedo" | "botella";
  pagina: string;
}

/**
 * Foto de la bodega: og:image de las páginas de historia, luego la portada, luego una imagen del
 * contenido de historia cuyo nombre o alt diga bodega/viñedo. `paginas` va en orden de preferencia.
 */
export function elegirImagenBodega(
  paginas: { url: string; candidatas: CandidataImagen[] }[],
  hostsSitio: (host: string) => boolean,
): ImagenElegida | null {
  const validas = (p: { candidatas: CandidataImagen[] }) => p.candidatas.filter((c) => hostPermitido(c.url, hostsSitio) && esFoto(c));
  for (const p of paginas) {
    const og = validas(p).find((c) => c.origen === "og");
    if (og) return { url: og.url, alt: og.alt, tipo: tipoFoto(og), pagina: p.url };
  }
  for (const p of paginas) {
    const c = validas(p).find((x) => x.origen === "contenido" && (VINEDO.test(texto(x)) || BODEGA.test(texto(x))) && (x.ancho == null || x.ancho >= 800));
    if (c) return { url: c.url, alt: c.alt, tipo: tipoFoto(c), pagina: p.url };
  }
  return null;
}

const texto = (c: CandidataImagen) => `${decodeURIComponent(new URL(c.url).pathname)} ${c.alt ?? ""}`;
const tipoFoto = (c: CandidataImagen): "bodega" | "vinedo" => (VINEDO.test(texto(c)) && !BODEGA.test(c.alt ?? "") ? "vinedo" : "bodega");

/** Botella del vino: imagen del producto (Woo / JSON-LD), sin logos ni iconos. */
export function imagenBotella(url: string | null | undefined, alt: string | null, pagina: string, hostsSitio: (host: string) => boolean): ImagenElegida | null {
  if (!url) return null;
  let abs: string;
  try {
    abs = new URL(url, pagina).href;
  } catch {
    return null;
  }
  const c: CandidataImagen = { url: abs, alt, origen: "producto", ancho: null };
  if (!hostPermitido(abs, hostsSitio) || EXT_NO.test(abs)) return null;
  const nombre = decodeURIComponent(new URL(abs).pathname.split("/").pop() ?? "");
  if (/logo|icon|placeholder|woocommerce-placeholder|default/i.test(nombre)) return null;
  return { url: c.url, alt, tipo: "botella", pagina };
}
