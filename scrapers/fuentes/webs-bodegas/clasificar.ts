// Clasificación de páginas (URL, título, h1, migas, tipo de WordPress) y
// huella de plataforma. Puro: se prueba con fixtures.
import { plano } from "./diccionarios.ts";

export type Clase = "vino" | "historia" | "enoturismo" | "contacto" | "legal" | "otra";

export interface SenalesPagina {
  url: string;
  titulo?: string | null;
  h1?: string | null;
  migas?: string[];
  /** Tipo de contenido de WordPress (page, post, product, vino…). */
  tipoWp?: string | null;
  tiposJsonLd?: string[];
}

const RE: Record<Exclude<Clase, "otra">, RegExp> = {
  legal: /\b(aviso legal|nota legal|politica de (privacidad|cookies)|privacidad|cookies|terminos|condiciones (de uso|generales|de venta)|legal notice|privacy|rgpd|lopd|gastos de envio|formas de pago|como comprar|preguntas frecuentes|faq|devoluciones|envios)\b/,
  enoturismo: /\b(enoturismo|visitas?|visita la bodega|catas?|experiencias?|reservar|reservas|reserva (tu|una|de) visita|wine ?tourism|tours?|eventos?|actividades)\b/,
  vino: /\b(vinos?|nuestros vinos|wines?|productos?|tienda|shop|gama|marcas|coleccion)\b/,
  historia: /\b(historia|la bodega|bodega|nosotros|quienes somos|filosofia|familia|about|our story|about us|el proyecto|origen|origenes|equipo|vinedos?|terroir|la finca)\b/,
  contacto: /\b(contacto|contact|donde estamos|como llegar|localizacion|ubicacion)\b/,
};

const TIPOS_WP_VINO = /^(product|products|producto|productos|vino|vinos|wine|wines|anada|anadas|nuestros-vinos)$/;
const TIPOS_WP_ENOTURISMO = /^(visita|visitas|experiencia|experiencias|enoturismo|tour|tours|actividad|actividades|evento|eventos)$/;

function rutaSegmentos(url: string): string[] {
  try {
    return decodeURIComponent(new URL(url).pathname).toLowerCase().split("/").filter(Boolean);
  } catch {
    return [];
  }
}

/** Ruta legible para clasificar: «/es/nuestros-vinos/aalto-2021/» → «nuestros vinos aalto 2021». */
function rutaPlana(url: string): string {
  try {
    return plano(decodeURIComponent(new URL(url).pathname)).replace(/[-_/.]+/g, " ").trim();
  } catch {
    return "";
  }
}

export function clasificar(s: SenalesPagina): Clase {
  const tipoWp = s.tipoWp ? plano(s.tipoWp) : null;
  if (tipoWp && TIPOS_WP_VINO.test(tipoWp)) return "vino";
  if (tipoWp && TIPOS_WP_ENOTURISMO.test(tipoWp)) return "enoturismo";
  if (s.tiposJsonLd?.includes("Product")) return "vino";
  const ruta = rutaPlana(s.url);
  const titulo = plano([s.titulo ?? "", s.h1 ?? ""].join(" "));
  const migas = plano((s.migas ?? []).join(" "));
  if (ruta === "") return "historia"; // portada: respaldo para la historia
  // Artículos («los-10-mejores-vinos-de-ribera-del-duero-de-2024») fuera de una sección de vinos: no son fichas.
  const segs = rutaSegmentos(s.url);
  const ultimo = segs[segs.length - 1] ?? "";
  const bajoVinos = segs.slice(0, -1).some((x) => /^(vinos?|wines?|productos?|product|shop|tienda|ficha-?vinos?|nuestros-vinos|e-shop.*)$/.test(x));
  if (!tipoWp && ultimo.split("-").length > 6 && !bajoVinos) return "otra";
  // La ruta manda; después título y migas. El orden resuelve «visita-la-bodega» (enoturismo) frente a «la-bodega».
  // Fichas técnicas y notas de cata son de vinos, aunque digan «cata».
  if (/\b(fichas?(?: tecnicas?)?(?: de)? vinos?|fichas? tecnicas?|notas? de cata|ficha de cata)\b/.test(`${ruta} ${titulo}`)) return "vino";
  for (const texto of [ruta, titulo, migas]) {
    for (const clase of ["legal", "enoturismo", "vino", "historia", "contacto"] as const) {
      if (RE[clase].test(texto)) return clase;
    }
  }
  return "otra";
}

/** ¿Es una página en otro idioma que el español? (`/en/`, `/pt-pt/`, `?lang=en`). */
export function esOtroIdioma(url: string): boolean {
  try {
    const u = new URL(url);
    const lang = u.searchParams.get("lang");
    if (lang && !/^es/i.test(lang)) return true;
    const primero = u.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-z]{2}(?:[-_][a-z]{2})?$/i.test(primero) && !/^es(?:[-_]es)?$/i.test(primero) && !/^(vino|blog|wp|shop)$/i.test(primero);
  } catch {
    return false;
  }
}

export type Plataforma = "wordpress" | "shopify" | "wix" | "generico";

export interface Huella {
  plataforma: Plataforma;
  woocommerce: boolean;
  /** Raíz de la API REST de WordPress, si la anuncia la portada. */
  wpJson: string | null;
  generador: string | null;
}

export function huella(html: string, origen: string, cabeceras?: Headers): Huella {
  const generador = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] ?? null;
  const api = html.match(/<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]+href=["']([^"']+)/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']https:\/\/api\.w\.org\/["']/i)?.[1] ?? null;
  const woocommerce = /woocommerce|wc-block|\/wc\/store\//i.test(html);
  let plataforma: Plataforma = "generico";
  if (api || /\/wp-content\/|\/wp-includes\//i.test(html) || /wordpress/i.test(generador ?? "")) plataforma = "wordpress";
  else if (/cdn\.shopify\.com|Shopify\.theme/i.test(html) || cabeceras?.has("x-shopify-stage")) plataforma = "shopify";
  else if (/static\.wixstatic\.com|wix-bolt|X-Wix-/i.test(html) || cabeceras?.has("x-wix-request-id")) plataforma = "wix";
  let wpJson: string | null = null;
  if (plataforma === "wordpress") {
    try {
      wpJson = new URL(api ?? "/wp-json/", origen).href;
    } catch {
      wpJson = null;
    }
  }
  return { plataforma, woocommerce, wpJson, generador };
}
