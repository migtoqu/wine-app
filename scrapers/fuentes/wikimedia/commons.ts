// Wikimedia Commons: lectura del HTML público de categorías (/wiki/Category:…) y fichas de
// archivo (/wiki/File:…). El robots.txt de Commons y Wikidata excluye /w/ (API) y /sparql, así
// que no se usan. Solo licencias libres (CC0, dominio público, CC BY, CC BY-SA); la imagen se
// enlaza (upload.wikimedia.org) con autor, licencia y enlace a la ficha del archivo.
import * as cheerio from "cheerio";
import { claveNombreBodega, claveTexto, limpiarEspacios } from "../../lib/texto.ts";

export const ORIGEN = "https://commons.wikimedia.org";

/** Raíces del árbol de categorías de bodegas de España. */
export const RAICES = [
  "Category:Wineries_in_Spain_by_autonomous_community",
  "Category:Wineries_in_Spain_by_province",
  "Category:Winemaking_cooperatives_in_Spain",
];

export interface Categoria {
  titulo: string;
  url: string;
}

export interface PaginaCategoria {
  subcategorias: Categoria[];
  archivos: Categoria[];
}

export function urlWiki(titulo: string): string {
  return `${ORIGEN}/wiki/${encodeURIComponent(titulo.replace(/ /g, "_")).replace(/%3A/g, ":").replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")")}`;
}

function tituloDeHref(href: string | undefined): string | null {
  if (!href?.startsWith("/wiki/")) return null;
  try {
    return decodeURIComponent(href.slice(6).split("#")[0]!).replace(/_/g, " ");
  } catch {
    return null;
  }
}

export function parsearCategoria(html: string): PaginaCategoria {
  const $ = cheerio.load(html);
  const subcategorias: Categoria[] = [];
  $("#mw-subcategories a").each((_, el) => {
    const t = tituloDeHref($(el).attr("href"));
    if (t?.startsWith("Category:") && !subcategorias.some((c) => c.titulo === t)) subcategorias.push({ titulo: t, url: urlWiki(t) });
  });
  const archivos: Categoria[] = [];
  $("#mw-category-media a").each((_, el) => {
    const t = tituloDeHref($(el).attr("href"));
    if (t?.startsWith("File:") && !archivos.some((c) => c.titulo === t)) archivos.push({ titulo: t, url: urlWiki(t) });
  });
  return { subcategorias, archivos };
}

/** Categorías que agrupan bodegas (por zona, antiguas, cooperativas…) frente a la de una bodega concreta. */
const CONTENEDORA = /^Category:(Wineries|Former wineries|Winemaking cooperatives|Wine cellars|Bodegas|Cellers) (in|of|by)\b|\bby (city|province|autonomous community|municipality)\b/i;
/** Categorías que no son de una bodega ni contienen bodegas. */
const AJENA = /^Category:(Logos|Interiors?|Wine bottles|Wine labels|Barrels|Wine tourism|Vineyards|Wine|Grapes|People|Events|Videos|Maps|Aerial)\b|\b(logos?|labels?|bottles?|interiors?|wines of|museums?|monuments?|streets?|festivals?)\b/i;

export function esContenedora(titulo: string): boolean {
  return CONTENEDORA.test(titulo);
}

export function esCategoriaDeBodega(titulo: string): boolean {
  return !esContenedora(titulo) && !AJENA.test(titulo);
}

/** Nombre de la bodega en el título de su categoría: sin «Category:», sin «, Haro» ni «(Haro)». */
export function nombreDeCategoria(titulo: string): string {
  return limpiarEspacios(titulo.replace(/^Category:/, "").replace(/\s*\([^)]*\)\s*$/, "").replace(/,\s*[^,]+$/, ""));
}

const PROVINCIAS = [
  "alava", "araba", "albacete", "alicante", "almeria", "asturias", "avila", "badajoz", "baleares", "barcelona", "burgos", "caceres",
  "cadiz", "cantabria", "coruna", "castellon", "ciudad real", "cordoba", "cuenca", "girona", "granada", "guadalajara", "gipuzkoa", "huelva",
  "huesca", "jaen", "la rioja", "las palmas", "leon", "lleida", "lugo", "madrid", "malaga", "murcia", "navarra", "ourense",
  "palencia", "pontevedra", "salamanca", "segovia", "sevilla", "soria", "tarragona", "tenerife", "teruel", "toledo", "valencia",
  "valladolid", "bizkaia", "zamora", "zaragoza",
];
const ALIAS_PROVINCIA: Record<string, string> = { araba: "alava", "rioja": "la rioja", "santa cruz de tenerife": "tenerife", "illes balears": "baleares", "islas baleares": "baleares", vizcaya: "bizkaia", guipuzcoa: "gipuzkoa", "a coruna": "coruna" };

/** Provincias que nombra la ruta de categorías («Wineries in the province of Valladolid»). */
export function provinciasDeRuta(ruta: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of ruta) {
    const k = ` ${claveTexto(t)} `;
    for (const p of PROVINCIAS) if (k.includes(` ${p} `)) out.add(ALIAS_PROVINCIA[p] ?? p);
  }
  return out;
}

export function claveProvincia(p: string | null | undefined): string | null {
  if (!p) return null;
  const k = claveTexto(p);
  if (ALIAS_PROVINCIA[k]) return ALIAS_PROVINCIA[k]!;
  const m = PROVINCIAS.find((x) => ` ${k} `.includes(` ${x} `));
  return m ? (ALIAS_PROVINCIA[m] ?? m) : k;
}

export interface BodegaRef {
  id: string;
  nombre: string;
  provincia: string | null;
  municipio: string | null;
}

/**
 * Bodega del catálogo para una categoría de Commons: misma clave de nombre y, si la ruta de
 * categorías nombra provincia, la misma provincia. Solo si hay una única candidata.
 */
export function emparejarCategoria(titulo: string, ruta: string[], porClave: Map<string, BodegaRef[]>): BodegaRef | null {
  const clave = claveNombreBodega(nombreDeCategoria(titulo));
  if (clave.length < 3) return null;
  const candidatas = porClave.get(clave) ?? [];
  const provs = provinciasDeRuta(ruta);
  const validas = candidatas.filter((b) => {
    const p = claveProvincia(b.provincia);
    return provs.size === 0 || !p || provs.has(p);
  });
  return validas.length === 1 ? validas[0]! : null;
}

/** Archivos de la categoría ordenados por idoneidad como foto de la bodega; fuera logos, botellas, etiquetas, planos… */
const ARCHIVO_NO = /logo|escudo|coat of arms|etiqueta|label|botell|bottle|cork|corcho|tap[oó]n|capsula|copa|glass|model\b|maqueta|award|premio|medall|wine list|carta|menu|plano|map\b|mapa|diagram|poster|cartel|anuncio|advert|signature|firma|\.(svg|gif|pdf|tiff?|djvu|webm|ogv|ogg|mp3|wav|stl)$/i;
const ARCHIVO_SI = /bodega|winery|celler|cellar|fachada|facade|exterior|edificio|building|vi[ñn]edo|vineyard|vinyes|calado|barric|nave|entrada|entrance|view|vista/i;

export function ordenarArchivos(archivos: Categoria[]): Categoria[] {
  return archivos
    .filter((a) => /\.(jpe?g|png|webp)$/i.test(a.titulo) && !ARCHIVO_NO.test(a.titulo.replace(/^File:/, "")))
    .map((a, i) => ({ a, i, p: (ARCHIVO_SI.test(a.titulo) ? 0 : 1) + (/\.png$/i.test(a.titulo) ? 1 : 0) }))
    .sort((x, y) => x.p - y.p || x.i - y.i)
    .map((x) => x.a);
}

export interface FichaArchivo {
  titulo: string;
  url: string;
  /** Miniatura de ~1280 px (o el original si es más pequeño), sin parámetros de seguimiento. */
  imagen: string;
  ancho: number | null;
  alto: number | null;
  autor: string | null;
  licencia: string | null;
  urlLicencia: string | null;
}

const LICENCIA_LIBRE = /^(CC0|Public domain|PD\b|CC BY(-SA)?( \d(\.\d)?)?( [A-Za-z-]{2,})?$|CC-BY(-SA)?-\d)/i;

export function licenciaLibre(l: string | null): boolean {
  return !!l && LICENCIA_LIBRE.test(l.trim());
}

function sinSeguimiento(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, ORIGEN);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    if (u.host === "thumb.wikimedia.org") u.host = "upload.wikimedia.org";
    return u.href;
  } catch {
    return null;
  }
}

export function parsearArchivo(html: string, titulo: string): FichaArchivo {
  const $ = cheerio.load(html);
  const licencias = $(".licensetpl_short").map((_, el) => limpiarEspacios($(el).text())).get().filter(Boolean);
  const licencia = licencias.find(licenciaLibre) ?? licencias[0] ?? null;
  const idx = licencia ? licencias.indexOf(licencia) : -1;
  const urlLicencia = idx >= 0 ? sinSeguimiento($(".licensetpl_link").eq(idx).text().trim() || undefined) : null;
  // Atribución pedida por el autor (si la hay) o el campo «Autor» del resumen.
  const atr = limpiarEspacios($(".licensetpl_attr").first().text());
  const aut = limpiarEspacios($("#fileinfotpl_aut").first().next("td").text().replace(/\((talk|discusión|contribs?)[^)]*\)/gi, ""));
  const autor = (atr || aut || "").slice(0, 120) || null;
  const info = $(".fileInfo").first().text();
  const dim = info.match(/([\d,.\s]+)\s*[×x]\s*([\d,.\s]+)\s*(pixels|píxeles)/i);
  const num = (s: string | undefined) => (s ? Number(s.replace(/[^\d]/g, "")) || null : null);
  const ancho = num(dim?.[1]);
  const alto = num(dim?.[2]);
  const original = sinSeguimiento($(".fullMedia a").first().attr("href") ?? $(".fullImageLink a").first().attr("href"));
  const t1280 = $(".mw-filepage-other-resolutions a")
    .map((_, el) => $(el).attr("href"))
    .get()
    .find((h) => /\/1280px-/.test(h));
  const imagen = (ancho && ancho > 1280 && sinSeguimiento(t1280)) || original || "";
  return { titulo, url: urlWiki(titulo), imagen, ancho, alto, autor, licencia, urlLicencia };
}

/** Texto de atribución: «Autor · Licencia · Wikimedia Commons · <ficha del archivo>». La UI enlaza la URL final. */
export function atribucion(f: FichaArchivo): string {
  return [f.autor, f.licencia, "Wikimedia Commons", f.url].filter(Boolean).join(" · ");
}

export function archivoValido(f: FichaArchivo): string | null {
  if (!licenciaLibre(f.licencia)) return `licencia no libre (${f.licencia ?? "sin licencia"})`;
  if (!f.autor && !/^(CC0|Public domain|PD)/i.test(f.licencia!)) return "sin autor";
  if (!/^https:\/\/upload\.wikimedia\.org\//.test(f.imagen)) return "sin URL de imagen";
  if (f.ancho != null && f.ancho < 800) return `demasiado pequeña (${f.ancho} px)`;
  if (f.ancho != null && f.alto != null && f.alto > f.ancho * 1.25) return "vertical";
  return null;
}

const VINEDO = /vi[ñn]edo|vineyard|vinyes?|vi[ñn]as?\b|cepas?|parcela|paraje|vendimia|harvest/i;
export function tipoArchivo(titulo: string): "bodega" | "vinedo" {
  return VINEDO.test(titulo) ? "vinedo" : "bodega";
}
