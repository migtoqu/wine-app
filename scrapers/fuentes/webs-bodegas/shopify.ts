// Tiendas Shopify: el catálogo público `/products.json` (paginado de 250 en 250) trae título,
// descripción, tipo, etiquetas, variantes con precio y stock, código de barras e imágenes en una
// petición. Aquí solo se traduce cada producto a la forma de la Store API de WooCommerce que ya
// consume `sitio.ts` (nombre, permalink, descripción, categorías, atributos, precios, imágenes).
import type { Clase } from "./clasificar.ts";
import { ES_SERVICIO, esNombreDeVino } from "./extraer.ts";
import { decodificarEntidades } from "./html.ts";

export interface VarianteShopify {
  title?: string;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  available?: boolean;
  sku?: string | null;
  barcode?: string | null;
}

export interface ProductoShopify {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  product_type?: string | null;
  tags?: string[] | string | null;
  variants?: VarianteShopify[];
  images?: { src?: string; alt?: string | null }[];
  options?: { name: string; values?: string[] }[];
}

/** Lo mismo que lee `sitio.ts` de un producto de la Store API de WooCommerce. */
export interface ProductoTienda {
  id: number;
  name: string;
  permalink: string;
  description?: string;
  short_description?: string;
  categories?: { name: string; slug: string }[];
  attributes?: { name: string; terms?: { name: string }[] }[];
  prices?: { price?: string; regular_price?: string; currency_minor_unit?: number; price_range?: { min_amount?: string; max_amount?: string } | null };
  images?: { src?: string; alt?: string }[];
  sku?: string;
  is_in_stock?: boolean;
}

export interface ProductoMapeado {
  producto: ProductoTienda;
  clase: Clase;
  categorias: string[];
  gtin: string | null;
}

/** Etiquetas internas de la tienda (códigos de ERP, campañas, plantillas de apps): no dicen nada del vino. */
const ETIQUETA_INTERNA = /^(?:code_|bf-|spo-|catalogo-|navidad|black ?friday|cyber|oferta|promo|destacados?$|novedad|aov bundle$|\d+$)/i;
/** Tipos y etiquetas de producto que no son vino propio (reventa, alimentación, accesorios). */
const TIPO_NO_VINO = /gourmet|alimentaci[oó]n|delicatessen|merchandising|accesorios|aceites?|olive oil|conservas|quesos?|otras bodegas|otros vinos|importaci[oó]n|internacional|del mundo|champagne|oporto|porto|destilados|licores|tarjetas? de regalo|gift ?cards?|bebidas|caldos|cremas|zumos?|n[ée]ctar|leche|gazpacho|personalizad|fundas?|enfriador|sidras?/i;
/** Tipos y etiquetas de experiencias (van a servicios). */
const TIPO_SERVICIO = /visitas?|experiencias?|eventos?|enoturismo|catas?\b|tours?\b/i;
/** Productos de la tienda que no son un vino: promociones, velas, combinados («Blanco de Verano Limón»), lotes. */
const NOMBRE_NO_VINO = /\b(?:socios|clientes|precio especial|venta exclusiva|descuento|velas?|arom[aá]tic[oa]s?|favoritos|lim[oó]n|sangr[ií]a|tinto de verano)\b|^(?:pack|lote|estuche|caja combinada)\b/i;
/** Surtidos de varios vinos en un producto («Viña Arnaiz Crianza/Reserva/Roble»). */
const SURTIDO = /\b(?:crianza|reserva|roble|joven|tinto|blanco|rosado)\s*\/\s*\p{L}|\p{L}\/[^/]+\/\p{L}/iu;
/** Referencias de ERP publicadas sin ficha («VINO ANTAÑO BLANCO VDF2 3/4X6 HORECA»). */
const REFERENCIA_ERP = /\b\d\/\d\s?x\s?\d+\b|\bBT\.?\s?\d\/\d|\bHORECA\b|\bVDF\d|\bOPT\s?\d\/\d/i;
/**
 * Formato o envase pegado al nombre: «Crianza 2022 (Caja de 6 botellas)», «Marqués del Atrio Crianza -
 * Caja de 6 botellas de 75cl», «Castillo Ygay 2012 | Caja madera 1 botella 3L · Catálogo Navidad».
 */
const ENVASE = "(?:caja|estuche|pack|lote|botell[oó]n|botellas?|magnum|m[áa]gnum|\\d+\\s*(?:x|uds?\\.?|unidades|botellas))";
const SUFIJO_PARENTESIS = new RegExp(`\\s*\\((?=[^)]*\\b${ENVASE}\\b)[^)]*\\)\\s*$`, "i");
const SUFIJO_GUION = new RegExp(`\\s+[-–—]\\s+(?=${ENVASE}\\b)(.+)$`, "i");

/** Nombre del producto sin HTML, sin el formato o envase («| Caja…», «- Caja…», «(Caja…)»); y el formato aparte. */
export function nombreYFormato(titulo: string): { nombre: string; formato: string | null } {
  // Las etiquetas fuera antes de decodificar: «Marqués de Murrieta<br>Gran Reserva» lleva un espacio.
  let s = decodificarEntidades(titulo.replace(/<[^>]*>/g, " ")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const partes: string[] = [];
  // «Nombre | Formato · Campaña»: el nombre es lo primero; la campaña tras «·» se descarta.
  const corte = s.search(/\s*[|·]\s*/);
  if (corte > 0) {
    partes.push(s.slice(corte).replace(/^\s*[|·]\s*/, "").split(/\s*·\s*/)[0]!.trim());
    s = s.slice(0, corte).trim();
  }
  const guion = s.match(SUFIJO_GUION);
  if (guion) {
    partes.push(guion[1]!.trim());
    s = s.slice(0, guion.index).trim();
  }
  const par = s.match(SUFIJO_PARENTESIS);
  if (par) {
    partes.push(par[0].trim().replace(/^\(|\)$/g, ""));
    s = s.slice(0, par.index).trim();
  }
  const formato = partes.filter(Boolean).join(" ");
  return { nombre: s, formato: formato || null };
}

const etiquetasDe = (t: ProductoShopify["tags"]) =>
  (Array.isArray(t) ? t : typeof t === "string" ? t.split(",") : []).map((x) => x.trim()).filter((x) => x && !ETIQUETA_INTERNA.test(x));

const numero = (v: string | number | null | undefined) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const centimos = (n: number) => String(Math.round(n * 100));

/** EAN/UPC del código de barras de la variante (8, 12, 13 o 14 cifras). */
const gtinDe = (b: string | null | undefined) => (b && /^\d{8}$|^\d{12,14}$/.test(b.trim()) ? b.trim() : null);

/**
 * Un producto de `/products.json` en la forma de la Store API de Woo, con su clase (vino o
 * enoturismo). `null` si no es vino propio ni experiencia: reventa, alimentación, accesorios,
 * tarjetas regalo, packs y estuches de varios vinos o referencias de ERP sin ficha.
 */
export function productoDeShopify(p: ProductoShopify, base: string): ProductoMapeado | null {
  if (!p?.handle || !p.title) return null;
  const { nombre, formato } = nombreYFormato(p.title);
  if (!nombre || REFERENCIA_ERP.test(p.title) || SURTIDO.test(nombre) || NOMBRE_NO_VINO.test(nombre)) return null;
  const tipo = (p.product_type ?? "").trim();
  const etiquetas = etiquetasDe(p.tags);
  // En la tienda de una bodega, un producto sin tipo (o de tipo «Bottle», «Tinto»…) que pasa los
  // filtros es un vino: se marca como tal para no exigirle evidencias en una ficha corta.
  const tipoVino = !tipo || /vin|wine|tint|blanc|rosad|ros[ée]|bottle|botella|espumoso|cava/i.test(tipo);
  const categorias = [tipo, ...etiquetas, ...(tipoVino && !/vino|wine/i.test(tipo) ? ["Vino"] : [])].filter(Boolean);
  const cats = categorias.join(" ");
  const variantes = p.variants ?? [];
  const precios = variantes.map((v) => numero(v.price)).filter((n): n is number => n != null && n > 0);
  const disponible = variantes.some((v) => v.available === true);
  const descripcion = p.body_html ?? "";
  // Sin precio: agotado y sin descripción es un producto fantasma; «disponible» a 0 € es un lote
  // configurable o un regalo de la tienda («Descubre Marqués del Atrio», fundas).
  if (precios.length === 0 && (disponible || !descripcion.replace(/<[^>]*>/g, "").trim())) return null;
  const servicio = TIPO_SERVICIO.test(tipo) || TIPO_SERVICIO.test(etiquetas.join(" ")) || ES_SERVICIO.test(nombre);
  if (!servicio && (TIPO_NO_VINO.test(cats) || TIPO_NO_VINO.test(nombre) || !esNombreDeVino(nombre))) return null;

  const elegida =
    variantes.find((v) => v.available && (numero(v.price) ?? 0) > 0) ?? variantes.find((v) => (numero(v.price) ?? 0) > 0) ?? variantes[0];
  const precio = numero(elegida?.price);
  const regular = numero(elegida?.compare_at_price);
  const atributos: NonNullable<ProductoTienda["attributes"]> = [];
  for (const o of p.options ?? []) {
    const valores = (o.values ?? []).filter((x) => !/^default title$/i.test(x));
    if (!/^title$/i.test(o.name) && valores.length) atributos.push({ name: o.name, terms: valores.map((name) => ({ name })) });
  }
  // El formato del título («Caja de 6 botellas de 75cl») va como atributo: lo lee la oferta.
  if (formato && !atributos.some((a) => /formato|tama[ñn]o|capacidad|size/i.test(a.name))) atributos.push({ name: "Formato", terms: [{ name: formato }] });
  if (etiquetas.length) atributos.push({ name: "Etiquetas", terms: etiquetas.map((name) => ({ name })) });
  const img = (p.images ?? []).find((i) => i.src);
  return {
    clase: servicio ? "enoturismo" : "vino",
    categorias,
    gtin: gtinDe(elegida?.barcode) ?? variantes.map((v) => gtinDe(v.barcode)).find(Boolean) ?? null,
    producto: {
      id: p.id,
      // Una experiencia conserva el detalle del título («Caja regalo experiencias: Cata de 3 vinos»).
      name: servicio && formato ? `${nombre}: ${formato}` : nombre,
      permalink: new URL(`products/${p.handle}`, base.endsWith("/") ? base : `${base}/`).href,
      description: descripcion,
      categories: categorias.map((name) => ({ name, slug: name.toLowerCase().replace(/\s+/g, "-") })),
      attributes: atributos,
      prices: precio != null && precio > 0
        ? {
            price: centimos(precio),
            regular_price: regular != null && regular > precio ? centimos(regular) : undefined,
            currency_minor_unit: 2,
            price_range: precios.length > 1 ? { min_amount: centimos(Math.min(...precios)), max_amount: centimos(Math.max(...precios)) } : null,
          }
        : undefined,
      images: img ? [{ src: img.src, alt: img.alt ?? undefined }] : [],
      sku: elegida?.sku?.trim() || undefined,
      is_in_stock: variantes.length ? disponible : undefined,
    },
  };
}
