// Ofertas de la tienda de la propia bodega (fase B, ola A): precio, formato,
// disponibilidad y EAN de cada vino, desde la Store API de WooCommerce o el
// JSON-LD `Offer`. Se guardan en `registros_fuente.datos` hasta que existan las
// tablas de ofertas (las crea otra sesión: `tiendas`, `ofertas`, `historial_precios`).
import { plano } from "./diccionarios.ts";

export interface OfertaWeb {
  url: string;
  precio: number | null;
  /** Precio sin rebaja, si la ficha muestra una. */
  precio_regular: number | null;
  moneda: string | null;
  /** null = no se sabe. */
  disponible: boolean | null;
  formato_ml: number | null;
  /** Botellas por unidad de venta (caja de 6 → 6). */
  unidades: number;
  ean: string | null;
  sku: string | null;
  /** Variación de Woo con precio distinto («Caja de 6»): rango del producto. */
  precio_max: number | null;
}

const FORMATOS: [RegExp, number][] = [
  [/\bdoble m[aá]gnum\b/i, 3000],
  [/\bjeroboam\b/i, 3000],
  [/\bimperial\b/i, 6000],
  [/\bm[aá]gnum\b/i, 1500],
  [/\bmedia botella\b|\b37[.,]5\s?cl\b/i, 375],
  [/\bbenjam[ií]n\b/i, 187],
];

/** Formato en ml del nombre o los atributos («75 cl», «1,5 L», «Mágnum»); null si no lo dice. */
export function formatoMl(texto: string): number | null {
  for (const [re, ml] of FORMATOS) if (re.test(texto)) return ml;
  const m = texto.match(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s?(cl|ml|l|litros?)\b/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  const unidad = m[2]!.toLowerCase();
  const ml = unidad === "ml" ? n : unidad === "cl" ? n * 10 : n * 1000;
  return ml >= 100 && ml <= 18000 ? Math.round(ml) : null;
}

/** «Caja de 6 botellas», «Pack 3 uds», «6 x 75 cl» → 6; si no, 1. */
export function unidades(texto: string): number {
  const p = plano(texto);
  const m = p.match(/\b(?:caja|estuche|pack|lote)\s+(?:de\s+)?(\d{1,2})\b/) ?? p.match(/\b(\d{1,2})\s*(?:x|uds?\.?|unidades|botellas)\b/);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 48 ? n : 1;
}

interface PreciosWoo {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_code?: string;
  currency_minor_unit?: number;
  price_range?: { min_amount?: string; max_amount?: string } | null;
}

interface ProductoWooOferta {
  name: string;
  permalink: string;
  sku?: string;
  prices?: PreciosWoo;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  attributes?: { name: string; terms?: { name: string }[] }[];
}

const importe = (v: string | undefined, minor: number) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) / 10 ** minor : null);

/** Oferta de un producto de la Store API (los importes vienen en unidades menores: «1200» = 12,00 €). */
export function ofertaDeWoo(p: ProductoWooOferta, ean: string | null): OfertaWeb | null {
  const pr = p.prices;
  if (!pr) return null;
  const minor = pr.currency_minor_unit ?? 2;
  const precio = importe(pr.price, minor);
  if (precio == null || precio <= 0) return null;
  const regular = importe(pr.regular_price, minor);
  const max = importe(pr.price_range?.max_amount, minor);
  // El atributo «Formato» con varias opciones (botella / caja) es la variación por defecto: se queda
  // el formato del nombre o, si solo hay una opción, la de ese atributo.
  const formato = (p.attributes ?? []).find((a) => /formato|tama[ñn]o|capacidad|size/i.test(a.name));
  const unico = formato?.terms?.length === 1 ? formato.terms[0]!.name : "";
  return {
    url: p.permalink,
    precio,
    precio_regular: regular != null && regular > precio ? regular : null,
    moneda: pr.currency_code ?? null,
    disponible: typeof p.is_in_stock === "boolean" ? p.is_in_stock : null,
    formato_ml: formatoMl(`${p.name} ${unico}`),
    unidades: unidades(`${p.name} ${unico}`),
    ean,
    sku: p.sku?.trim() || null,
    precio_max: max != null && max > precio ? max : null,
  };
}

/** Oferta del JSON-LD `Product.offers` (Offer o AggregateOffer). */
export function ofertaDeJsonLd(producto: Record<string, unknown>, url: string, nombre: string, ean: string | null): OfertaWeb | null {
  const ofertas = Array.isArray(producto.offers) ? producto.offers : producto.offers ? [producto.offers] : [];
  const o = ofertas.find((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (!o) return null;
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
  const precio = num(o.price) ?? num(o.lowPrice);
  if (precio == null || precio <= 0) return null;
  const disp = typeof o.availability === "string" ? o.availability : null;
  // El formato puede ir en el nombre de la oferta («Caja 6 botellas»), no en el del producto.
  const formato = typeof o.name === "string" ? `${nombre} ${o.name}` : nombre;
  return {
    url,
    precio,
    precio_regular: null,
    moneda: typeof o.priceCurrency === "string" ? o.priceCurrency : null,
    disponible: disp ? /InStock|LimitedAvailability|PreOrder/i.test(disp) : null,
    formato_ml: formatoMl(formato),
    unidades: unidades(formato),
    ean,
    sku: typeof producto.sku === "string" ? producto.sku : null,
    precio_max: num(o.highPrice),
  };
}
