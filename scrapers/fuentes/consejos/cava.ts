// C.R. D.O. Cava (cava.wine, Wagtail): /es/bodegas/?page=N (20 por página) lista nombre, municipio y
// zona → ficha /es/bodegas/<slug>/ con columnas «Contacto» (teléfono, email, web y dirección en
// líneas), «Enoturismo», «Tienda Online» y «Tipos de Cava». La descripción y los logos no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-cava";
export const BASE = "https://www.cava.wine";
export const URL_LISTADO = `${BASE}/es/bodegas/`;
export const urlPagina = (n: number) => `${URL_LISTADO}?page=${n}`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const m = /^\/es\/bodegas\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

/** Fichas de una página del listado y el número de la última página. */
export function parsearListado(html: string): { entradas: EntradaListado[]; ultimaPagina: number } {
  const $ = cheerio.load(html);
  const entradas: EntradaListado[] = [];
  const vistos = new Set<string>();
  $("h2 a.has-text-black[href]").each((_, a) => {
    const slug = slugDe($(a).attr("href")!);
    const nombre = t($(a).text());
    if (!slug || !nombre || vistos.has(slug)) return;
    vistos.add(slug);
    // «Avinyonet del Penedès (Comtats de Barcelona)»: municipio y zona de la D.O.
    const lugar = t($(a).closest("h2").nextAll(".is-italic").first().text());
    const m = lugar ? /^(.*?)\s*(?:\(([^)]+)\))?$/.exec(lugar) : null;
    const zona = t(m?.[2]);
    entradas.push({
      url: `${URL_LISTADO}${slug}/`,
      datos: { id_externo: `slug:${slug}`, nombre, municipio: t(m?.[1]), extra: zona ? { zona } : {} },
    });
  });
  const paginas = $(".pagination a[href*='page=']")
    .map((_, a) => Number(/page=(\d+)/.exec($(a).attr("href")!)?.[1] ?? 0))
    .get();
  return { entradas, ultimaPagina: Math.max(1, ...paginas) };
}

/** Líneas de texto de un nodo separadas por <br>, sin los hijos en bloque (redes sociales). */
function lineas($: cheerio.CheerioAPI, nodo: ReturnType<cheerio.CheerioAPI>): string[] {
  const copia = nodo.clone();
  copia.children("div").remove();
  return (copia.html() ?? "")
    .split(/<br\s*\/?>/i)
    .map((h) => t(cheerio.load(`<div>${h}</div>`)("div").text()))
    .filter((x): x is string => !!x);
}

/** «Masia Can Batlle / Avinyonet del Penedès / 08793» → dirección, municipio y CP. */
export function partirDireccion(ls: string[]): { direccion: string | null; municipio: string | null; cp: string | null } {
  const i = ls.findIndex((l) => /^\d{5}$/.test(l));
  if (i < 0) return { direccion: t(ls.join(", ")), municipio: null, cp: null };
  const antes = ls.slice(0, i);
  const municipio = antes.length > 1 ? antes.pop()! : null;
  return { direccion: t(antes.join(", ")), municipio, cp: ls[i]! };
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = entrada.datos.nombre ?? t($("h1").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const columna = (titulo: string) =>
    $(".lpad").filter((_, c) => claveTexto($(c).children("h2").first().text()) === titulo).first();

  const contacto = columna("contacto");
  let telefono: string | null = null;
  let email: string | null = null;
  let web: string | null = null;
  contacto.children("div").find("a[href]").each((_, a) => {
    const href = $(a).attr("href")!.trim();
    if (/^tel:/i.test(href)) telefono ??= t($(a).text()) ?? href.slice(4);
    else if (/^mailto:/i.test(href)) email ??= href.slice(7).trim().toLowerCase();
    else if (/^https?:\/\//i.test(href) && !href.includes("cava.wine")) web ??= href;
  });
  const dir = partirDireccion(lineas($, contacto.children(".bodega-social").first()));

  const tienda = columna("tienda online").find("a[href^='http']").first().attr("href") ?? null;
  const tipos = columna("tipos de cava")
    .children("div")
    .map((_, d) => t($(d).text()))
    .get()
    .filter((x): x is string => !!x);
  const enoturismo = columna("enoturismo").length > 0 ? true : null;

  const extra: Record<string, unknown> = { ...(entrada.datos.extra ?? {}) };
  if (tipos.length) extra.tipos_cava = tipos;
  if (tienda) extra.tienda_online = tienda;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: dir.direccion,
    codigo_postal: dir.cp,
    municipio: dir.municipio ?? entrada.datos.municipio ?? null,
    provincia_texto: null,
    ubicacion: null,
    web,
    telefono,
    email,
    marcas: [],
    enoturismo,
    extra,
  };
}

export const consejoCava: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "cava", nombre: "Cava" },
  urlsRobots: [URL_LISTADO, `${URL_LISTADO}artcava/`],
  async listar(ctx: Contexto) {
    const primera = parsearListado((await ctx.http.get(urlPagina(1))).texto);
    const out = [...primera.entradas];
    const vistos = new Set(out.map((e) => e.url));
    for (let n = 2; n <= Math.min(primera.ultimaPagina, 30); n++) {
      for (const e of parsearListado((await ctx.http.get(urlPagina(n))).texto).entradas) {
        if (!vistos.has(e.url)) out.push(e), vistos.add(e.url);
      }
    }
    return out;
  },
  parsearFicha,
};
