// Vinopremier (Magento): extracción de datos crudos del listado y de la ficha.
// Solo se leen hechos. El texto de la descripción se devuelve únicamente para que
// `normalizar.ts` extraiga cifras y nombres de uva; nunca se guarda ni se publica.
import * as cheerio from "cheerio";
import { textoONull } from "../../lib/texto.ts";

export const BASE = "https://vinopremier.com";

/** Categorías de D.O. que se recorren (slug = `denominaciones.slug` del catálogo). */
export const CATEGORIAS = [
  { denominacion: "ribera-del-duero", nombre: "Ribera del Duero", ruta: "/vinos/denominaciones/d-o-ribera-del-duero" },
  { denominacion: "rioja", nombre: "Rioja", ruta: "/vinos/denominaciones/d-o-rioja" },
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/** Solo URLs limpias y `?p=N` (robots.txt no bloquea la paginación; sí `product_list_*`, `price=`…). */
export function urlListado(categoria: Categoria, pagina: number): string {
  const base = `${BASE}${categoria.ruta}`;
  return pagina <= 1 ? base : `${base}?p=${pagina}`;
}

export interface TarjetaVp {
  url: string;
  nombre: string;
}

export interface ListadoVp {
  tarjetas: TarjetaVp[];
  /** Mayor `p` enlazado en el paginador. */
  maxPagina: number | null;
  /** «Artículos 1-24 de 369» / «18 artículos». */
  total: number | null;
}

export interface FichaVp {
  url: string;
  nombre: string;
  sku: string | null;
  precio: number | null;
  moneda: string | null;
  disponibilidad: string | null;
  imagen: string | null;
  ean: string | null;
  /** Bodega del encabezado de la ficha (`h2.page-bodega`). */
  bodega: string | null;
  /** `manufacturer` y `brand` del JSON-LD. */
  fabricante: string | null;
  marca: string | null;
  /** Texto plano de la descripción: solo para extraer hechos; no se almacena. */
  descripcion: string;
}

/** Ruta sin barra inicial, sin query y sin `.html`: identificador estable de la ficha. */
export function rutaProducto(url: string): string {
  return new URL(url, BASE).pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "");
}

function absoluta(href: string): string {
  const u = new URL(href, BASE);
  u.search = "";
  u.hash = "";
  return u.href;
}

export function parsearListado(html: string, categoria: Categoria): ListadoVp {
  const $ = cheerio.load(html);
  const tarjetas: TarjetaVp[] = [];
  // Los carruseles del menú y los «destacados» quedan fuera de `.column.main`.
  $(".column.main li.product-item").each((_, el) => {
    const a = $(el).find("a.product-item-link[href]").first();
    const href = a.attr("href");
    const nombre = textoONull(a.text());
    if (!href || !nombre) return;
    const url = absoluta(href);
    if (!tarjetas.some((t) => t.url === url)) tarjetas.push({ url, nombre });
  });

  let maxPagina: number | null = null;
  const base = `${BASE}${categoria.ruta}`;
  $("a[href*='?p=']").each((_, a) => {
    let u: URL;
    try {
      u = new URL($(a).attr("href")!, BASE);
    } catch {
      return;
    }
    if (u.origin + u.pathname !== base) return;
    const p = Number(u.searchParams.get("p"));
    if (Number.isInteger(p) && p > 0) maxPagina = Math.max(maxPagina ?? 0, p);
  });

  const numeros = $("#toolbar-amount .toolbar-number")
    .map((_, n) => Number($(n).text().trim()))
    .get();
  const total = numeros.length > 0 && Number.isInteger(numeros[numeros.length - 1]) ? numeros[numeros.length - 1]! : null;
  return { tarjetas, maxPagina, total };
}

interface ProductoLd {
  "@type"?: string;
  name?: string;
  sku?: string;
  image?: string | string[];
  offers?: { price?: number | string; priceCurrency?: string; availability?: string }[] | { price?: number | string; priceCurrency?: string; availability?: string };
  brand?: { name?: string };
  manufacturer?: { name?: string };
}

function productoLd($: cheerio.CheerioAPI): ProductoLd | null {
  let producto: ProductoLd | null = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    if (producto) return;
    try {
      const d = JSON.parse($(s).text()) as ProductoLd | ProductoLd[];
      for (const p of Array.isArray(d) ? d : [d]) if (p?.["@type"] === "Product") producto = p;
    } catch {
      // JSON-LD mal formado: se ignora
    }
  });
  return producto;
}

export function parsearFicha(html: string, url: string): FichaVp {
  const $ = cheerio.load(html);
  const ld = productoLd($);
  const nombre = textoONull($("h1.page-title [itemprop='name']").first().text()) ?? textoONull(ld?.name) ?? textoONull($("h1").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre: ${url}`);

  const oferta = Array.isArray(ld?.offers) ? ld?.offers[0] : ld?.offers;
  const precio = oferta?.price;
  const imagen = Array.isArray(ld?.image) ? ld?.image[0] : ld?.image;
  const ean = /EAN:\s*(\d+)/i.exec($(".page-ean").first().text())?.[1] ?? null;

  const desc = $(".product.attribute.overview .value").first().clone();
  desc.find("script,style").remove();
  const descripcion = desc.text().replace(/\s+/g, " ").trim();

  return {
    url,
    nombre,
    sku: ld?.sku ?? null,
    precio: precio != null && !Number.isNaN(Number(precio)) ? Number(precio) : null,
    moneda: oferta?.priceCurrency ?? null,
    disponibilidad: oferta?.availability?.replace(/^https?:\/\/schema\.org\//, "") ?? null,
    imagen: imagen && /^https?:\/\//i.test(imagen) ? imagen : null,
    ean,
    bodega: textoONull($(".page-bodega").first().text()),
    fabricante: textoONull(ld?.manufacturer?.name),
    marca: textoONull(ld?.brand?.name),
    descripcion,
  };
}
