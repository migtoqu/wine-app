// C.R.D.O.P. Somontano (dosomontano.com, WordPress): /listado-bodegas/ enlaza las fichas
// /bodega/<slug>/. Cada ficha trae un bloque con la dirección («Ctra. N-240, km. 180 / 22124 LASCELLAS
// (Huesca)»), la web y el email, y una lista de datos («VISITAS», «CONTACTO», «VIÑEDO PROPIO»…).
// No se leen la descripción, las imágenes ni el nombre de la persona de contacto (solo su teléfono).
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-somontano";
export const BASE = "https://dosomontano.com";
export const URL_LISTADO = `${BASE}/listado-bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const m = /^\/bodega\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $("a[href*='/bodega/']").each((_, a) => {
    const slug = slugDe($(a).attr("href")!);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({ url: `${BASE}/bodega/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  });
  return out;
}

/** Líneas de un nodo partidas por <br>. */
function lineas($: cheerio.CheerioAPI, nodo: ReturnType<cheerio.CheerioAPI>): string[] {
  const c = nodo.clone();
  c.find("br").replaceWith("\n");
  return c.text().split("\n").map(limpiarEspacios).filter(Boolean);
}

/** «Ctra. N-240, km. 180 / 22124 LASCELLAS (Huesca)» → calle, CP, municipio y provincia. */
export function partirDireccion(ls: string[]): {
  direccion: string | null; cp: string | null; municipio: string | null; provincia: string | null;
} {
  // El CP puede abrir la línea o ir detrás de la calle («…km. 3.800 22300 BARBASTRO (Huesca)»).
  const re = /(?:^|\s)(\d{5})\s+([^\d(,]+?)\s*(?:\(([^)]+)\)|,\s*([^,]+))?$/;
  const i = ls.findIndex((l) => re.test(l));
  if (i < 0) return { direccion: t(ls.join(", ")), cp: null, municipio: null, provincia: null };
  const m = re.exec(ls[i]!)!;
  const antes = [...ls.slice(0, i), ls[i]!.slice(0, m.index)].map((l) => l.replace(/[,\s]+$/, "")).filter(Boolean);
  return { direccion: t(antes.join(", ")), cp: m[1]!, municipio: t(m[2]), provincia: t(m[3] ?? m[4]) };
}

/** Primer teléfono de un texto («Visitas: 974 26 97 08 Restaurante: …», «974 31 31 12 - 974 …»). */
export function primerTelefono(textos: string[]): string | null {
  for (const x of textos) {
    const m = /(?:\+34\s?)?[6789]\d{2}(?:[\s.]?\d{2,3}){2,3}/.exec(x);
    if (m) return m[0].trim();
  }
  return null;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("h1").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const bloque = $(".bodega-content-info-top-mid").first();

  // La dirección es el primer párrafo con un código postal.
  let dir = partirDireccion([]);
  bloque.find("p").each((_, p) => {
    if ($(p).hasClass("tienda-online")) return;
    const ls = lineas($, $(p));
    if (ls.some((l) => /(?:^|\s)\d{5}\s+\S/.test(l))) {
      dir = partirDireccion(ls);
      return false;
    }
  });
  let web: string | null = null;
  let email: string | null = null;
  bloque.find("a[href]").each((_, a) => {
    if ($(a).closest(".tienda-online").length) return;
    const href = $(a).attr("href")!.trim();
    if (/^mailto:/i.test(href)) email ??= href.slice(7).trim().toLowerCase();
    else if (/^https?:\/\//i.test(href) && !href.includes("dosomontano.com")) web ??= href;
  });
  const tienda = bloque.find(".tienda-online a[href^='http']").first().attr("href") ?? null;

  // Lista de datos: «TÍTULO:» + valor. De «CONTACTO» solo el teléfono (la otra línea es una persona).
  const datos = new Map<string, string[]>();
  $(".bodega-data-list-item").each((_, it) => {
    const titulo = claveTexto($(it).find(".title-list-item").first().text());
    if (titulo) datos.set(titulo, $(it).find("p").map((_, p) => t($(p).text())).get().filter(Boolean));
  });
  const telefono = primerTelefono(datos.get("contacto") ?? []);
  const visitas = datos.get("visitas")?.[0] ?? null;
  const enoturismo = visitas ? (/^s[ií]\b/i.test(visitas) ? true : /^no\b/i.test(visitas) ? false : null) : null;

  const extra: Record<string, unknown> = {};
  const hectareas = /(\d+(?:[.,]\d+)?)\s*(?:ha\b|hect)/i.exec(datos.get("vinedo propio")?.[0] ?? "");
  if (hectareas) extra.vinedo_propio_ha = Number(hectareas[1]!.replace(",", "."));
  const capacidad = /^[\d.]+$/.exec((datos.get("capacidad de elaboracion")?.[0] ?? "").replace(/\s/g, ""));
  if (capacidad) extra.capacidad_elaboracion = Number(capacidad[0].replace(/\./g, ""));
  if (tienda) extra.tienda_online = tienda;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: dir.direccion,
    codigo_postal: dir.cp,
    municipio: dir.municipio,
    provincia_texto: dir.provincia,
    ubicacion: null,
    web,
    telefono,
    email,
    marcas: [],
    enoturismo,
    extra,
  };
}

export const consejoSomontano: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "somontano", nombre: "Somontano" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodega/abinasa/`],
  // Toda la D.O. está en Huesca; alguna ficha puede no traer CP.
  provinciaUnica: "Huesca",
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
