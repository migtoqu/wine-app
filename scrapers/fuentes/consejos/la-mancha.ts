// C.R.D.O. La Mancha (lamanchawines.com, WordPress + Business Directory Plugin): el directorio
// vive en /enoturismo/<slug>/. robots.txt prohíbe toda URL con «?», así que no se pagina el listado:
// las fichas salen de los sitemaps `wpbdp_listing-sitemap*.xml`. Cada ficha trae campos con clase
// `wpbdp-field-<nombre>` (dirección, CP, población, provincia, teléfono, web, marcas…).
// La descripción larga, el logo y las redes sociales no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ErrorHttp } from "../../lib/http.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-la-mancha";
export const BASE = "https://lamanchawines.com";
export const URL_SITEMAP = `${BASE}/sitemap.xml`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(url: string): string | null {
  const m = /^\/enoturismo\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(url, BASE).pathname);
  return m ? m[1]! : null;
}

/** Sitemaps de fichas del directorio dentro del índice de Yoast. */
export function sitemapsDeFichas(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+wpbdp_listing-sitemap\d*\.xml)\s*<\/loc>/g)].map((m) => m[1]!);
}

/** URLs de ficha de un sitemap (sin imágenes, sin duplicados, sin papelera). */
export function fichasDeSitemap(xml: string): EntradaListado[] {
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const slug = slugDe(m[1]!);
    if (!slug || slug.startsWith("trashed") || vistos.has(slug)) continue;
    vistos.add(slug);
    out.push({ url: `${BASE}/enoturismo/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  }
  return out;
}

/** «YEMANUEVA, YEMAVERDE Y YEMASERENA» → tres marcas. */
export function partirMarcas(texto: string | null): string[] {
  if (!texto) return [];
  return texto
    .split(/\s*(?:[,;\/\n·]|\s[yY]\s|\s-\s)\s*/)
    .map((m) => t(m.replace(/^["“”']+|["“”'.]+$/g, "")))
    .filter((m): m is string => !!m && m.length > 1);
}

const siNo = (v: string | null): boolean | null => {
  const c = claveTexto(v ?? "");
  return c === "si" ? true : c === "no" ? false : null;
};

/** Provincias de la D.O.; «Otras (embotellado)» son embotelladores de fuera (Madrid, Alemania, Suiza…). */
export const PROVINCIAS_DO = ["Albacete", "Ciudad Real", "Cuenca", "Toledo"];

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo | null {
  const $ = cheerio.load(html);
  const nombre = t($("h1.entry-title").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const campo = (c: string) => {
    const v = $(`.wpbdp-field-${c} > .value`).first();
    // Los saltos de línea del valor separan elementos (marcas en varias líneas).
    v.find("br").replaceWith("\n");
    return v.length ? textoONull(v.text().split("\n").map(limpiarEspacios).filter(Boolean).join("\n")) : null;
  };
  const web = campo("web");
  const email = campo("email") ?? campo("e_mail") ?? campo("correo_electronico");
  const categorias = $(".wpbdp-field-provincia_categoria .value a")
    .map((_, a) => t($(a).text()))
    .get()
    .filter((c): c is string => !!c && claveTexto(c) !== "castilla la mancha");

  const deLaDo = new Set(PROVINCIAS_DO.map(claveTexto));
  if (categorias.length && !categorias.some((c) => deLaDo.has(claveTexto(c)))) return null;

  const extra: Record<string, unknown> = {};
  for (const c of ["elaboracion", "crianza", "embotellado"]) {
    const v = siNo(campo(c));
    if (v !== null) extra[c] = v;
  }
  if (categorias.length) extra.categorias = categorias;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: campo("direccion")?.replace(/\n/g, ", ") ?? null,
    codigo_postal: campo("codigo_postal"),
    municipio: campo("poblacion"),
    provincia_texto: campo("provincia"),
    ubicacion: null,
    web: web && /^(https?:\/\/)?[^\s@]+\.[a-z]{2,}/i.test(web) ? (/^https?:\/\//i.test(web) ? web : `http://${web}`) : null,
    telefono: campo("telefono")?.split("\n")[0] ?? null,
    email: email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) ? email.toLowerCase() : null,
    marcas: partirMarcas(campo("marcas_do_la_mancha")),
    enoturismo: siNo(campo("enoturismo")),
    extra,
  };
}

export const consejoLaMancha: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "la-mancha", nombre: "La Mancha" },
  urlsRobots: [URL_SITEMAP, `${BASE}/enoturismo/bodegas-la-tercia/`],
  async listar(ctx: Contexto) {
    let sitemaps = sitemapsDeFichas((await ctx.http.get(URL_SITEMAP)).texto);
    // El índice de Yoast a veces llega sin los sitemaps del directorio (se regenera): se prueban
    // los nombres conocidos, parando en el primer 404.
    const respaldo = sitemaps.length === 0;
    if (respaldo) {
      ctx.log.warn("El índice de sitemaps no trae los del directorio: se prueban los nombres conocidos");
      sitemaps = Array.from({ length: 9 }, (_, i) => `${BASE}/wpbdp_listing-sitemap${i ? i + 1 : ""}.xml`);
    }
    const out: EntradaListado[] = [];
    const vistos = new Set<string>();
    for (const url of sitemaps) {
      let xml: string;
      try {
        xml = (await ctx.http.get(url)).texto;
      } catch (e) {
        if (respaldo && e instanceof ErrorHttp && e.status === 404) break;
        throw e;
      }
      for (const e of fichasDeSitemap(xml)) {
        if (!vistos.has(e.url)) out.push(e), vistos.add(e.url);
      }
    }
    return out;
  },
  parsearFicha,
};
