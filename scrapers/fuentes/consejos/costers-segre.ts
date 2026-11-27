// C.R. D.O. Costers del Segre (costersdelsegre.es, Drupal): /ca/cellers y /ca/cellers?page=N enlazan
// las fichas /ca/cellers/<slug>. Cada ficha trae bloques con icono: dirección («Calle, Municipio, 25300 -
// (Lleida)»), web, teléfono, email y visitas («Si»/«No»), y el carrusel de sus vinos (marcas).
// La descripción, las imágenes y el mapa (sus coordenadas no son reales) no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { capitalizarSiMayusculas, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-costers-segre";
export const BASE = "https://costersdelsegre.es";
export const URL_LISTADO = `${BASE}/ca/cellers`;
export const urlPagina = (n: number) => (n === 0 ? URL_LISTADO : `${URL_LISTADO}?page=${n}`);

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const m = /^\/ca\/cellers\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $("a[href*='/ca/cellers/']").each((_, a) => {
    const slug = slugDe($(a).attr("href")!);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({ url: `${BASE}/ca/cellers/${slug}`, datos: { id_externo: `slug:${slug}` } });
  });
  return out;
}

/** «Av. Tarragona s/n, Tàrrega, 25300 - (Lleida)» → calle, municipio, CP y provincia. */
export function partirDireccion(texto: string | null): {
  direccion: string | null; cp: string | null; municipio: string | null; provincia: string | null;
} {
  if (!texto) return { direccion: null, cp: null, municipio: null, provincia: null };
  const m = /^(.*?),\s*([^,]+?),\s*(\d{5})\s*-?\s*(?:\(([^)]*)\))?\s*$/.exec(texto);
  if (!m) return { direccion: t(texto), cp: null, municipio: null, provincia: null };
  return { direccion: t(m[1]), cp: m[3]!, municipio: t(m[2]), provincia: t(m[4]) };
}

/** Primer teléfono: «Telèfon: (+34) 973 580 200 Fax: …», «973 050 018 | 973 392 539». */
export function primerTelefono(texto: string | null): string | null {
  if (!texto) return null;
  const m = /(?:\(?\+34\)?\s?)?[6789]\d{2}(?:[\s.]?\d{2,3}){2,3}/.exec(texto.split(/fax/i)[0]!);
  return m ? m[0].trim() : null;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const h1 = t($("h1").first().text());
  const nombre = h1 ? capitalizarSiMayusculas(h1) : entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  const bloques = new Map<string, ReturnType<typeof $>>();
  $(".celler-info").each((_, b) => {
    const icono = /([a-z]+)-icon/.exec($(b).find("span[class$='-icon']").attr("class") ?? "")?.[1];
    if (icono && !bloques.has(icono)) bloques.set(icono, $(b).find("p").first());
  });
  const texto = (k: string) => t(bloques.get(k)?.text());
  const dir = partirDireccion(texto("gps"));

  const hrefWeb = bloques.get("web")?.find("a[href]").attr("href")?.trim() ?? texto("web");
  const web = hrefWeb && /\./.test(hrefWeb) ? (/^https?:\/\//i.test(hrefWeb) ? hrefWeb : `http://${hrefWeb}`) : null;
  const mail = (bloques.get("email")?.find("a[href^='mailto:']").attr("href")?.slice(7) ?? texto("email"))?.trim().toLowerCase() ?? null;
  const visitas = texto("visit");

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
    telefono: primerTelefono(texto("phone")),
    email: mail && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(mail) ? mail : null,
    marcas: [...new Set($(".vins-nom").map((_, p) => t($(p).text())).get().filter((x): x is string => !!x))],
    enoturismo: visitas ? (/^(s[ií]|yes)\b/i.test(visitas) ? true : /^no\b/i.test(visitas) ? false : null) : null,
    extra: {},
  };
}

export const consejoCostersSegre: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "costers-del-segre", nombre: "Costers del Segre" },
  urlsRobots: [URL_LISTADO, `${URL_LISTADO}?page=1`, `${BASE}/ca/cellers/carviresa`],
  async listar(ctx: Contexto) {
    // «Show More» enlaza ?page=N (6 por página); se avanza mientras aparezcan cellers nuevos.
    const out: EntradaListado[] = [];
    const vistos = new Set<string>();
    for (let n = 0; n < 30; n++) {
      const nuevas = parsearListado((await ctx.http.get(urlPagina(n))).texto).filter((e) => !vistos.has(e.url));
      if (!nuevas.length) break;
      for (const e of nuevas) out.push(e), vistos.add(e.url);
    }
    return out;
  },
  parsearFicha,
};
