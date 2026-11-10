// Listados de categoría por plataforma: URL de cada página y tarjetas de producto.
import * as cheerio from "cheerio";
import { textoONull } from "../../lib/texto.ts";
import type { CategoriaTienda, ConfigTienda, ListadoTienda, TarjetaTienda } from "./tipos.ts";
import { parsearListadoVinatis } from "./vinatis.ts";

type ConfigListado = Pick<ConfigTienda, "base" | "plataforma" | "paramPagina">;

/** Parámetro de paginación por plataforma (WooCommerce pagina por ruta: `/page/N/`). */
function parametro(config: ConfigListado): string {
  if (config.paramPagina) return config.paramPagina;
  return config.plataforma === "magento" ? "p" : "page";
}

/** URL de la página `pagina` (1 = la URL limpia de la categoría). */
export function urlListado(config: ConfigListado, categoria: CategoriaTienda, pagina: number): string {
  const base = new URL(categoria.ruta, config.base);
  if (pagina <= 1) return base.href;
  if (config.plataforma === "woocommerce") {
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/page/${pagina}/`;
    return base.href;
  }
  base.searchParams.set(parametro(config), String(pagina));
  return base.href;
}

function limpia(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.search = "";
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

/** Selectores del enlace de cada producto en la rejilla principal. */
const ENLACES: Record<Exclude<ConfigTienda["plataforma"], "vinatis">, string> = {
  // Magento 2 (Luma y derivados): fuera de `.column.main` hay carruseles.
  magento: ".column.main li.product-item a.product-item-link, .products-grid li.product-item a.product-item-link",
  woocommerce: "ul.products li.product a.woocommerce-LoopProduct-link, ul.products li.product a.woocommerce-loop-product__link",
  // PrestaShop 1.6 (`ul.product_list`) y 1.7+ (`article.product-miniature`).
  prestashop: "ul.product_list a.product-name, #js-product-list article.product-miniature .product-title a, .products article.product-miniature .product-title a",
};

/** Mayor página enlazada en el paginador de esta misma categoría. */
function maxPaginaEnlazada($: cheerio.CheerioAPI, config: ConfigListado, categoria: CategoriaTienda): number | null {
  const ruta = new URL(categoria.ruta, config.base).pathname.replace(/\/+$/, "");
  let max: number | null = null;
  $("a[href]").each((_, a) => {
    let u: URL;
    try {
      u = new URL($(a).attr("href")!, config.base);
    } catch {
      return;
    }
    let p: number;
    if (config.plataforma === "woocommerce") {
      const m = u.pathname.match(/^(.*)\/page\/(\d+)\/?$/);
      if (!m || m[1]!.replace(/\/+$/, "") !== ruta) return;
      p = Number(m[2]);
    } else {
      if (u.pathname.replace(/\/+$/, "") !== ruta) return;
      p = Number(u.searchParams.get(parametro(config)));
    }
    if (Number.isInteger(p) && p > 0) max = Math.max(max ?? 0, p);
  });
  return max;
}

/** Total de productos si el listado lo dice («Hay 140 productos», «Artículos 1-24 de 369», «de 140 artículos»). */
function totalDe($: cheerio.CheerioAPI): number | null {
  const numeros = $("#toolbar-amount .toolbar-number")
    .map((_, n) => Number($(n).text().trim()))
    .get();
  if (numeros.length > 0 && Number.isInteger(numeros[numeros.length - 1])) return numeros[numeros.length - 1]!;
  const texto = $(".heading-counter, .product-count, .total-products, .woocommerce-result-count").text();
  const m = texto.match(/\bde\s+(\d+)\b/i) ?? texto.match(/\b(\d+)\s+(?:productos?|resultados?|art[ií]culos?)/i);
  return m ? Number(m[1]) : null;
}

export function parsearListado(html: string, config: ConfigListado, categoria: CategoriaTienda): ListadoTienda {
  if (config.plataforma === "vinatis") return parsearListadoVinatis(html, config.base);
  const $ = cheerio.load(html);
  const tarjetas: TarjetaTienda[] = [];
  $(ENLACES[config.plataforma]).each((_, a) => {
    const href = $(a).attr("href");
    const url = href ? limpia(href, config.base) : null;
    const nombre = textoONull($(a).attr("title") ?? null) ?? textoONull($(a).text());
    if (!url || !nombre || new URL(url).origin !== new URL(config.base).origin) return;
    if (!tarjetas.some((t) => t.url === url)) tarjetas.push({ url, nombre });
  });
  return { tarjetas, fichas: [], maxPagina: maxPaginaEnlazada($, config, categoria), total: totalDe($) };
}
