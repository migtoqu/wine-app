// Ficha de producto genérica: JSON-LD `Product`, microdatos schema.org y tabla de atributos
// (PrestaShop, WooCommerce, Magento). Solo se leen hechos; la descripción se devuelve como texto
// plano únicamente para extraer cifras en `normalizar.ts`.
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { claveTexto, textoONull } from "../../lib/texto.ts";
import type { ConfigTienda, FichaTienda } from "./tipos.ts";

const EAN = /^(\d{8}|\d{12,14})$/;

interface Estructurado {
  nombre: string | null;
  sku: string | null;
  gtin: string | null;
  precio: number | null;
  moneda: string | null;
  disponibilidad: string | null;
  imagen: string | null;
  marca: string | null;
  fabricante: string | null;
}

const VACIO: Estructurado = {
  nombre: null,
  sku: null,
  gtin: null,
  precio: null,
  moneda: null,
  disponibilidad: null,
  imagen: null,
  marca: null,
  fabricante: null,
};

function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Precio con dos decimales (PrestaShop sirve a veces «10.750001»). */
function precio(v: unknown): number | null {
  const n = numero(v);
  return n == null ? null : Math.round(n * 100) / 100;
}

/**
 * Disponibilidad rotulada en HTML cuando no viene en datos estructurados (PrestaShop 1.6 la quita
 * de los microdatos sin stock y muestra `#availability_value` «Sin stock…»).
 */
export function disponibilidadRotulada($: cheerio.CheerioAPI): string | null {
  const el = $("#availability_value, .product-availability, p.stock").first();
  if (el.length === 0) return null;
  const t = claveTexto(el.text());
  const clases = el.attr("class") ?? "";
  if (/\b(sin stock|agotad|no disponible|out of stock)/.test(t) || /label-danger|out-of-stock/.test(clases)) return "OutOfStock";
  if (/\b(en stock|disponible|in stock)\b/.test(t) || /label-success|in-stock/.test(clases)) return "InStock";
  return null;
}

function sinPrefijoSchema(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().replace(/^https?:\/\/schema\.org\//i, "") : null;
}

/** GTIN válido de 8, 12, 13 o 14 dígitos (con ceros a la izquierda de GTIN-14 quitados). */
export function gtinValido(v: unknown): string | null {
  const s = String(v ?? "").replace(/\s+/g, "");
  if (!EAN.test(s)) return null;
  const g = s.length === 14 && s.startsWith("0") ? s.slice(1) : s;
  // Dígito de control GS1 (módulo 10).
  const digitos = g.split("").map(Number);
  const control = digitos.pop()!;
  const suma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === control ? g : null;
}

function nombreDe(v: unknown): string | null {
  if (typeof v === "string") return textoONull(v);
  if (v && typeof v === "object" && "name" in v) return textoONull(String((v as { name: unknown }).name ?? ""));
  return null;
}

function esProducto(x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== "object") return false;
  const t = (x as { "@type"?: unknown })["@type"];
  return t === "Product" || (Array.isArray(t) && t.includes("Product"));
}

/** Primer `Product` del JSON-LD (también dentro de `@graph` o de listas). */
export function productoJsonLd($: cheerio.CheerioAPI): Estructurado | null {
  let p: Record<string, unknown> | null = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    if (p) return;
    let d: unknown;
    try {
      d = JSON.parse($(s).text());
    } catch {
      return; // JSON-LD mal formado: se ignora
    }
    const cola: unknown[] = Array.isArray(d) ? [...d] : [d];
    while (cola.length && !p) {
      const x = cola.shift();
      if (esProducto(x)) p = x;
      else if (x && typeof x === "object" && Array.isArray((x as { "@graph"?: unknown })["@graph"])) {
        cola.push(...((x as { "@graph": unknown[] })["@graph"]));
      }
    }
  });
  if (!p) return null;
  const prod = p as Record<string, unknown>;
  const ofertas = Array.isArray(prod.offers) ? prod.offers : prod.offers ? [prod.offers] : [];
  const oferta = (ofertas[0] ?? {}) as Record<string, unknown>;
  const imagen = Array.isArray(prod.image) ? prod.image[0] : prod.image;
  const urlImagen = typeof imagen === "string" ? imagen : nombreDe(imagen) ? null : (imagen as { url?: string } | undefined)?.url;
  return {
    nombre: textoONull(prod.name as string | undefined),
    sku: textoONull(prod.sku != null ? String(prod.sku) : null),
    gtin: gtinValido(prod.gtin13 ?? prod.gtin ?? prod.gtin14 ?? prod.gtin12 ?? prod.gtin8 ?? null),
    precio: precio(oferta.price ?? oferta.lowPrice),
    moneda: textoONull(oferta.priceCurrency as string | undefined),
    disponibilidad: sinPrefijoSchema(oferta.availability),
    imagen: typeof urlImagen === "string" && /^https?:\/\//i.test(urlImagen) ? urlImagen : null,
    marca: nombreDe(prod.brand),
    fabricante: nombreDe(prod.manufacturer),
  };
}

/** Microdatos del primer elemento `itemtype=…/Product`, sin bajar a productos anidados (relacionados). */
export function productoMicrodatos($: cheerio.CheerioAPI): Estructurado | null {
  const raiz = $('[itemscope][itemtype*="schema.org/Product"]').first();
  if (raiz.length === 0) return null;
  const propio = (el: Element) => {
    const cerca = $(el).parent().closest('[itemscope][itemtype*="schema.org/Product"]');
    return cerca.length === 0 || cerca[0] === raiz[0];
  };
  const valor = (prop: string): string | null => {
    const el = raiz
      .find(`[itemprop]`)
      .filter((_, e) => (e.attribs.itemprop ?? "").split(/\s+/).some((p) => p.toLowerCase() === prop.toLowerCase()))
      .filter((_, e) => propio(e))
      .first();
    if (el.length === 0) return null;
    const a = el[0]!.attribs;
    return textoONull(a.content ?? a.href ?? a.src ?? el.text());
  };
  // La marca puede ser un `itemscope` Brand con `name` dentro: se toma su primer nombre.
  const marcaEl = raiz.find('[itemprop="brand"]').filter((_, e) => propio(e)).first();
  const marca = marcaEl.length
    ? textoONull(marcaEl.attr("content") ?? marcaEl.find('[itemprop="name"]').first().attr("content") ?? marcaEl.find('[itemprop="name"]').first().text() ?? marcaEl.text())
    : null;
  const imagen = valor("image");
  return {
    nombre: valor("name"),
    sku: valor("sku"),
    gtin: gtinValido(valor("gtin13") ?? valor("gtin") ?? valor("gtin14") ?? valor("gtin8")),
    precio: precio(valor("price") ?? valor("lowPrice")),
    moneda: valor("priceCurrency"),
    disponibilidad: sinPrefijoSchema(valor("availability")),
    imagen: imagen && /^https?:\/\//i.test(imagen) ? imagen : null,
    marca,
    fabricante: null,
  };
}

/**
 * Pares «etiqueta → valor» de la ficha técnica: `table.table-data-sheet` (PrestaShop 1.6),
 * `dl.data-sheet` (1.7), `table.woocommerce-product-attributes` (WooCommerce) y
 * `#product-attribute-specs-table` (Magento). Claves con `claveTexto`.
 */
export function atributosFicha($: cheerio.CheerioAPI): Map<string, string> {
  const pares = new Map<string, string>();
  const poner = (k: string, v: string) => {
    const clave = claveTexto(k.replace(/:$/, ""));
    const valor = textoONull(v);
    if (clave && valor && !pares.has(clave)) pares.set(clave, valor);
  };
  $("table.table-data-sheet tr, table.woocommerce-product-attributes tr, #product-attribute-specs-table tr").each((_, tr) => {
    const celdas = $(tr).find("th, td");
    if (celdas.length >= 2) poner($(celdas[0]).text(), $(celdas[1]).text());
  });
  $("dl.data-sheet dt, dl.product-features dt").each((_, dt) => poner($(dt).text(), $(dt).next("dd").text()));
  return pares;
}

function atributo(attrs: Map<string, string>, ...nombres: string[]): string | null {
  for (const n of nombres) {
    const v = attrs.get(claveTexto(n));
    if (v) return v;
  }
  return null;
}

/** «Botella de 75cl», «1,5 L», «0.75» → ml. */
export function formatoTexto(texto: string | null): number | null {
  if (!texto) return null;
  const m = texto.match(/(\d+(?:[.,]\d+)?)\s*(cl|ml|litros?|l)\b/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  const u = m[2]!.toLowerCase();
  const ml = Math.round(u === "cl" ? n * 10 : u === "ml" ? n : n * 1000);
  return ml >= 100 && ml <= 30000 ? ml : null;
}

/** Ficha de una tienda Magento/WooCommerce/PrestaShop a partir de su HTML. */
export function parsearFichaEstructurada(html: string, url: string, config: Pick<ConfigTienda, "selectorBodega">): FichaTienda {
  const $ = cheerio.load(html);
  const ld = productoJsonLd($) ?? VACIO;
  const md = productoMicrodatos($) ?? VACIO;
  const attrs = atributosFicha($);
  const nombre = ld.nombre ?? md.nombre ?? textoONull($("h1").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre: ${url}`);

  const bodegaSelector = config.selectorBodega ? textoONull($(config.selectorBodega).first().text()) : null;
  const bodegaAttr = atributo(attrs, "Bodega", "Elaborador", "Productor", "Bodegas");
  const bodega = bodegaSelector ?? bodegaAttr ?? ld.fabricante ?? ld.marca ?? md.marca;
  const grupo = [...new Set([ld.fabricante, ld.marca, md.marca].filter((g): g is string => !!g && g !== bodega))];

  const anioAttr = Number(atributo(attrs, "Añada", "Cosecha", "Año"));
  const gradoAttr = numero((atributo(attrs, "Vol", "Grados", "Graduación", "Grado alcohólico", "Alcohol") ?? "").replace(/%.*$/, "").trim());

  const desc = $('[itemprop="description"], .product-description, #description, .woocommerce-product-details__short-description, .product.attribute.overview .value')
    .first()
    .clone();
  desc.find("script,style").remove();

  return {
    url,
    nombre,
    sku: ld.sku ?? md.sku,
    ean: ld.gtin ?? md.gtin ?? gtinValido(atributo(attrs, "EAN", "EAN13", "Código de barras", "GTIN")),
    precio: ld.precio ?? md.precio,
    moneda: ld.moneda ?? md.moneda,
    disponibilidad: ld.disponibilidad ?? md.disponibilidad ?? disponibilidadRotulada($),
    imagen: ld.imagen ?? md.imagen,
    bodega,
    grupo,
    tipoTexto: atributo(attrs, "Tipo", "Tipo de vino", "Color"),
    denominacionTexto: atributo(attrs, "Denominación Origen", "Denominación de Origen", "Denominación", "D.O.", "DO"),
    uvasTexto: atributo(attrs, "Tipo Uva", "Uva", "Uvas", "Variedad", "Variedades"),
    anio: Number.isInteger(anioAttr) && anioAttr >= 1950 && anioAttr <= 2049 ? anioAttr : null,
    formatoMl: formatoTexto(atributo(attrs, "Capacidad", "Formato", "Volumen", "Tamaño")),
    grado: gradoAttr != null && gradoAttr > 0 && gradoAttr <= 25 ? gradoAttr : null,
    temperaturaTexto: atributo(attrs, "Temperatura de servicio", "Temperatura"),
    descripcion: desc.text().replace(/\s+/g, " ").trim(),
  };
}
