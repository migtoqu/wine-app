// Vinoselección: extracción de datos crudos del listado y de la ficha.
// Solo hechos: nunca la descripción, notas de cata ni maridaje (texto reservado).
import * as cheerio from "cheerio";
import { textoONull } from "../../lib/texto.ts";

export const BASE = "https://www.vinoseleccion.com";
export const URL_CATEGORIA = `${BASE}/vinos/espana/ribera-duero`;

/** Solo URLs limpias y `?p=N` (robots.txt: Disallow /*?* salvo Allow /*?p=*). */
export function urlListado(pagina: number): string {
  return pagina <= 1 ? URL_CATEGORIA : `${URL_CATEGORIA}?p=${pagina}`;
}

export interface Enlace {
  nombre: string;
  url: string;
}

/** JSON de analítica (GA4) de la tarjeta del listado: describe la botella suelta. */
export interface DatosTarjeta {
  item_id?: string;
  item_name?: string;
  price?: number;
  price_without_discount?: number;
  num_bottles?: number;
  pre_per_bottle?: number;
  vintage_year_wine?: string;
  grape_variety_wine?: string;
  capacity?: string;
  item_brand?: string;
  ean?: string;
  is_in_stock?: string;
}

export interface TarjetaVs {
  url: string;
  nombre: string;
  bodega: Enlace | null;
  datos: DatosTarjeta | null;
}

export interface ListadoVs {
  tarjetas: TarjetaVs[];
  /** Mayor `p` enlazado en el paginador. */
  maxPagina: number | null;
}

export interface FichaVs {
  url: string;
  nombre: string;
  sku: string | null;
  precio: number | null;
  moneda: string | null;
  disponibilidad: string | null;
  imagen: string | null;
  region: string | null;
  /** «Características generales»: etiqueta → valor («Tipo de vino» → «Vino Tinto»). */
  caracteristicas: Record<string, string>;
  temperatura: string | null;
  bodega: Enlace | null;
  bodeguero: string | null;
}

/** Ruta sin barra inicial ni query: identificador estable de la ficha. */
export function rutaProducto(url: string): string {
  return new URL(url, BASE).pathname.replace(/^\/+|\/+$/g, "");
}

function absoluta(href: string): string {
  const u = new URL(href, BASE);
  u.search = "";
  u.hash = "";
  return u.href;
}

/** El onclick lleva `dataLayer.push({"event":"select_item",…})`. */
export function datosDeOnclick(onclick: string | undefined): DatosTarjeta | null {
  if (!onclick) return null;
  const m = /push\((\{"event":"select_item"[\s\S]*?\})\);/.exec(onclick);
  if (!m) return null;
  try {
    const json = JSON.parse(m[1]!) as { ecommerce?: { items?: DatosTarjeta[] } };
    return json.ecommerce?.items?.[0] ?? null;
  } catch {
    return null;
  }
}

export function parsearListado(html: string): ListadoVs {
  const $ = cheerio.load(html);
  const tarjetas: TarjetaVs[] = [];
  // Cada tarjeta es un contenedor con id «product-item-info_<id>».
  $("[id^='product-item-info_']").each((_, el) => {
    const a = $(el).find("a.product-item-link[href]").first();
    const href = a.attr("href");
    const nombre = textoONull(a.text());
    if (!href || !nombre) return;
    const url = absoluta(href);
    if (tarjetas.some((t) => t.url === url)) return;
    const b = $(el).find("p.sdesc a[href*='/vinos/bodegas/']").first();
    const nombreBodega = textoONull(b.text());
    tarjetas.push({
      url,
      nombre,
      bodega: nombreBodega ? { nombre: nombreBodega, url: absoluta(b.attr("href")!) } : null,
      datos: datosDeOnclick(a.attr("onclick")),
    });
  });

  let maxPagina: number | null = null;
  $("a[href*='?p=']").each((_, a) => {
    const href = $(a).attr("href")!;
    let u: URL;
    try {
      u = new URL(href, BASE);
    } catch {
      return;
    }
    if (u.origin + u.pathname !== URL_CATEGORIA) return;
    const p = Number(u.searchParams.get("p"));
    if (Number.isInteger(p) && p > 0) maxPagina = Math.max(maxPagina ?? 0, p);
  });
  return { tarjetas, maxPagina };
}

interface ProductoLd {
  "@type"?: string;
  name?: string;
  sku?: string;
  image?: string | string[];
  offers?: { price?: number | string; priceCurrency?: string; availability?: string };
}

function productosLd($: cheerio.CheerioAPI): ProductoLd[] {
  const productos: ProductoLd[] = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const d = JSON.parse($(s).text()) as ProductoLd | ProductoLd[];
      for (const p of Array.isArray(d) ? d : [d]) if (p?.["@type"] === "Product") productos.push(p);
    } catch {
      // JSON-LD mal formado: se ignora
    }
  });
  return productos;
}

export function parsearFicha(html: string, url: string): FichaVs {
  const $ = cheerio.load(html);
  const ld = productosLd($);
  // Hay dos bloques Product: el que trae sku es el completo; la imagen sin /cache/ es la original.
  const conSku = ld.find((p) => p.sku) ?? ld[0];
  const imagenes = ld.flatMap((p) => (Array.isArray(p.image) ? p.image : p.image ? [p.image] : []));
  const imagen = imagenes.find((i) => !i.includes("/cache/")) ?? imagenes[0] ?? null;

  const nombre =
    textoONull($(".page-title [itemprop='name']").first().text()) ??
    textoONull(conSku?.name) ??
    textoONull($("h1").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre: ${url}`);

  const caracteristicas: Record<string, string> = {};
  $("#features .flex-custom-attributes-feature").each((_, f) => {
    const etiqueta = textoONull($(f).find(".attribute-subtitle").text());
    const valor = textoONull($(f).find(".attribute-content").text());
    if (etiqueta && valor) caracteristicas[etiqueta] = valor;
  });

  const servicio = $(".data-label.temperatura").first().parent().clone();
  servicio.find(".data-label").remove();

  // Bloque «La bodega»: pares título («Bodega», «Enólogo», «Bodeguero») → enlace.
  let bodega: Enlace | null = null;
  let bodeguero: string | null = null;
  $("#bloque-bodega .product-entity-title").each((_, t) => {
    const titulo = textoONull($(t).text());
    const a = $(t).next(".product-entity-data").find("a").first();
    const nombreEnlace = textoONull(a.text());
    if (!nombreEnlace) return;
    if (titulo === "Bodega" && !bodega) bodega = { nombre: nombreEnlace, url: absoluta(a.attr("href") ?? "/") };
    if (titulo === "Bodeguero" && !bodeguero) bodeguero = nombreEnlace;
  });

  const precio = conSku?.offers?.price;
  return {
    url,
    nombre,
    sku: conSku?.sku ?? null,
    precio: precio != null && !Number.isNaN(Number(precio)) ? Number(precio) : null,
    moneda: conSku?.offers?.priceCurrency ?? null,
    disponibilidad: conSku?.offers?.availability?.replace(/^https?:\/\/schema\.org\//, "") ?? null,
    imagen,
    region: textoONull($(".product-info-main .denominacion-origen a").first().text()),
    caracteristicas,
    temperatura: textoONull(servicio.text()),
    bodega,
    bodeguero,
  };
}
