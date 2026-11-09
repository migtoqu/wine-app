// C.R. DOCa Rioja (riojawine.com): extracción de datos crudos del HTML de bodegas, vinos y experiencias.
// Solo hechos: nunca las descripciones (`.__description`, `.__text`), imágenes ni redes sociales.
import * as cheerio from "cheerio";
import type { Punto } from "../../lib/geo.ts";
import { limpiarEspacios, textoONull } from "../../lib/texto.ts";
import { parsearPrecio } from "../consejos/comun/servicios.ts";

export { parsearPrecio };

export const BASE = "https://riojawine.com";
export const URL_SITEMAP = `${BASE}/sitemap-es-es.xml`;

export type TipoFicha = "bodega" | "vino" | "experiencia";

const RUTA: Record<TipoFicha, string> = { bodega: "bodegas-rioja", vino: "vinos-rioja", experiencia: "experiencia" };

/** Las URLs del sitemap redirigen (301) a `/es/…`: se pide directamente la definitiva. */
export function urlFicha(tipo: TipoFicha, slug: string): string {
  return `${BASE}/es/${RUTA[tipo]}/${slug}/`;
}

/** Slug de una URL de ficha (con o sin `/es/`), o null si no es de ese tipo. */
export function slugDe(url: string, tipo: TipoFicha): string | null {
  const m = new RegExp(`^/(?:es/)?${RUTA[tipo]}/([a-z0-9]+(?:-[a-z0-9]+)*)/?$`).exec(new URL(url, BASE).pathname);
  return m ? m[1]! : null;
}

export interface Sitemap {
  bodegas: string[];
  vinos: string[];
  experiencias: string[];
}

/** Slugs únicos y en orden de cada tipo de ficha del sitemap. */
export function parsearSitemap(xml: string): Sitemap {
  const out: Sitemap = { bodegas: [], vinos: [], experiencias: [] };
  const vistos = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let url: string;
    try {
      url = new URL(m[1]!, BASE).href;
    } catch {
      continue;
    }
    for (const [tipo, lista] of [["bodega", out.bodegas], ["vino", out.vinos], ["experiencia", out.experiencias]] as const) {
      const slug = slugDe(url, tipo);
      if (slug && !vistos.has(`${tipo}:${slug}`)) {
        vistos.add(`${tipo}:${slug}`);
        lista.push(slug);
      }
    }
  }
  return out;
}

type $ = cheerio.CheerioAPI;

/** Texto de un nodo con los espacios colapsados. */
const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export interface Contacto {
  /** Web propia (primer enlace de contacto que no es «Ver tienda»). */
  web: string | null;
  tienda: string | null;
  telefono: string | null;
  email: string | null;
  /** Texto de «Cómo llegar»: «Calle, 2, 26200 Haro». */
  direccion_texto: string | null;
}

export interface Territorio {
  zona: string | null;
  municipio: string | null;
}

/** Filas «etiqueta → valor(es)» de los desplegables («Información de visitas»…). */
export type Filas = Record<string, string[]>;

function territorio($: $): Territorio {
  const enlaces = $(".g__header__winery .__little a");
  const zona = t(enlaces.filter((_, a) => ($(a).attr("href") ?? "").includes("/zona-de-produccion/")).first().text());
  const municipio = t(enlaces.filter((_, a) => ($(a).attr("href") ?? "").includes("/municipios/")).first().text());
  return { zona, municipio };
}

function contacto($: $): Contacto {
  const col = $(".__contact_info").first();
  const arriba = col.find("a.__contact_row_top");
  const tienda = arriba.filter((_, a) => /tienda/i.test($(a).text())).first().attr("href") ?? null;
  const web = arriba.filter((_, a) => !/tienda/i.test($(a).text())).first().attr("href") ?? null;
  const tel = col.find("a.__phone").first();
  const mail = col.find("a.__mail").first();
  const dir = col.find("a.__goto").first();
  return {
    web: web ? web.trim() : null,
    tienda: tienda ? tienda.trim() : null,
    telefono: t(tel.text()) ?? t((tel.attr("href") ?? "").replace(/^tel:/i, "")),
    email: t(mail.text()) ?? t((mail.attr("href") ?? "").replace(/^mailto:/i, "")),
    direccion_texto: t(dir.text()),
  };
}

function coordenadas($: $): Punto | null {
  const el = $("[data-lat][data-lng]").first();
  const lat = Number(el.attr("data-lat"));
  const lng = Number(el.attr("data-lng"));
  return el.length && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}

/** Desplegables: título → filas. Cada fila tiene la etiqueta y un valor o una lista «a: b». */
function desplegables($: $): Record<string, Filas> {
  const out: Record<string, Filas> = {};
  $(".g__toggle").each((_, el) => {
    const titulo = t($(el).find(".__title__left").first().text());
    if (!titulo) return;
    const filas: Filas = {};
    $(el)
      .find(".__wrapper .__row")
      .each((_, fila) => {
        const cols = $(fila).children(".__col");
        if (cols.length >= 2) {
          const etiqueta = t(cols.first().text());
          const valor = cols.eq(1);
          const lista = valor.find("> div");
          const valores =
            lista.length > 0
              ? lista.map((_, d) => $(d).children("span").map((_, s) => t($(s).text())).get().filter(Boolean).join(": ")).get()
              : [t(valor.text())].filter((x): x is string => !!x);
          if (etiqueta) filas[etiqueta] = valores;
        } else {
          // Filas de una sola celda: listas de servicios o instalaciones.
          const texto = t($(fila).text());
          if (texto) (filas["_lista"] ??= []).push(texto);
        }
      });
    out[titulo] = filas;
  });
  return out;
}

/** Enlaces de ficha (data-permalink de las tarjetas relacionadas) de un tipo concreto. */
function tarjetas($: $, tipo: TipoFicha, dentro?: string): string[] {
  const dataType = tipo === "bodega" ? "winery" : tipo === "vino" ? "wine" : "experience";
  const raiz = dentro ? $(dentro) : $.root();
  const slugs: string[] = [];
  raiz.find(`[data-type="${dataType}"][data-permalink]`).each((_, el) => {
    const s = slugDe($(el).attr("data-permalink")!, tipo);
    if (s && !slugs.includes(s)) slugs.push(s);
  });
  return slugs;
}

export interface FichaBodega {
  url: string;
  slug_fuente: string;
  nombre: string;
  zona: string | null;
  municipio: string | null;
  contacto: Contacto;
  ubicacion: Punto | null;
  /** Primera línea destacada («Bodega familiar desde 1932 - …»); solo para extraer la fundación. */
  destacado: string | null;
  servicios_destacados: string[];
  visitas: Filas;
  instalaciones: string[];
  /** Vinos enlazados desde la ficha de bodega (explícitos), si los hubiera. */
  vinos_enlazados: string[];
  experiencias_enlazadas: string[];
}

export function parsearBodega(html: string, url: string): FichaBodega {
  const $ = cheerio.load(html);
  const nombre = t($("h1.__title").first().text());
  if (!nombre) throw new Error(`Ficha de bodega sin nombre: ${url}`);
  const d = desplegables($);
  const visitas = d["Información de visitas"] ?? {};
  const { Instalaciones: inst, ...resto } = visitas;
  return {
    url,
    slug_fuente: slugDe(url, "bodega") ?? "",
    nombre,
    ...territorio($),
    contacto: contacto($),
    ubicacion: coordenadas($),
    destacado: t($(".__description p.__high").first().text()),
    servicios_destacados: d["Servicios destacados"]?._lista ?? [],
    visitas: resto,
    instalaciones: inst ?? d["Información de visitas"]?.["_lista"] ?? [],
    vinos_enlazados: tarjetas($, "vino"),
    experiencias_enlazadas: tarjetas($, "experiencia"),
  };
}

export interface FichaVino {
  url: string;
  slug_fuente: string;
  nombre: string;
  /** «Bodega Ysios» tal como aparece sobre el nombre (sin enlace). */
  bodega_texto: string | null;
  zona: string | null;
  /** «€60,00» → 60. Solo informativo: los precios son de la Fase 2. */
  precio: number | null;
  tipo_texto: string | null;
  envejecimiento_texto: string | null;
  anada_texto: string | null;
  uvas: string[];
  /** «Más vinos de la bodega»: hermanos de la misma bodega (explícito). */
  vinos_hermanos: string[];
}

export function parsearVino(html: string, url: string): FichaVino {
  const $ = cheerio.load(html);
  const nombre = t($("h1.__name").first().text());
  if (!nombre) throw new Error(`Ficha de vino sin nombre: ${url}`);
  const detalles: Record<string, string> = {};
  $(".__details_item").each((_, el) => {
    const spans = $(el).children("span");
    const k = t(spans.first().text());
    if (k && !spans.eq(1).hasClass("__grapes")) detalles[k] = t(spans.eq(1).text()) ?? "";
  });
  const prename = $(".__prename").first();
  const uvas = $(".__grapes .g__tag_grape span")
    .map((_, s) => t($(s).text()))
    .get()
    .filter((x): x is string => !!x);
  return {
    url,
    slug_fuente: slugDe(url, "vino") ?? "",
    nombre,
    bodega_texto: t(prename.children("span").first().text()),
    zona: t(prename.clone().children("span").remove().end().text().replace(/^[\s·]+/, "")),
    precio: parsearPrecio($(".__price").first().text()),
    tipo_texto: detalles["Tipo de vino"] || null,
    envejecimiento_texto: detalles["Envejecimiento"] || null,
    anada_texto: detalles["Añada"] || null,
    uvas: [...new Set(uvas)],
    vinos_hermanos: tarjetas($, "vino", ".b__related_wine"),
  };
}

export interface FichaExperiencia {
  url: string;
  slug_fuente: string;
  titulo: string;
  zona: string | null;
  municipio: string | null;
  url_reserva: string | null;
  /** Slug de la bodega («Sobre la bodega»): enlace explícito. */
  bodega_slug: string | null;
  bodega_nombre: string | null;
  contacto: Contacto;
  ubicacion: Punto | null;
  info: Filas;
  incluye: string[];
}

export function parsearExperiencia(html: string, url: string): FichaExperiencia {
  const $ = cheerio.load(html);
  const titulo = t($("h1.__title").first().text());
  if (!titulo) throw new Error(`Ficha de experiencia sin título: ${url}`);
  const d = desplegables($);
  const reserva = $(".__sticky a.g__btn")
    .filter((_, a) => /reservar/i.test($(a).text()))
    .first()
    .attr("href");
  const bodega = $(".__winery_resume[data-permalink]").first();
  const { _lista: incluye, ...info } = d["Información de la experiencia"] ?? {};
  return {
    url,
    slug_fuente: slugDe(url, "experiencia") ?? "",
    titulo,
    ...territorio($),
    url_reserva: reserva ? reserva.trim() : null,
    bodega_slug: bodega.length ? slugDe(bodega.attr("data-permalink")!, "bodega") : null,
    bodega_nombre: t(bodega.attr("data-title")),
    contacto: contacto($),
    ubicacion: coordenadas($),
    info,
    incluye: d["La experiencia incluye"]?._lista ?? incluye ?? [],
  };
}
