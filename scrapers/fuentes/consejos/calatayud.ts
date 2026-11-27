// C.R.D.O.P. Calatayud (calatayudwine.com, WordPress + Divi): /bodegas/ enlaza las fichas
// /bodegas/<slug>/. Cada ficha trae un bloque con «Dirección» (calle, «CP Municipio (Provincia)»,
// «Tel. …») y la web, y «Vinos» con sus marcas. La descripción y las imágenes no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-calatayud";
export const BASE = "https://www.calatayudwine.com";
export const URL_LISTADO = `${BASE}/bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const m = /^\/bodegas\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $("a[href*='/bodegas/']").each((_, a) => {
    const slug = slugDe($(a).attr("href")!);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({ url: `${BASE}/bodegas/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  });
  return out;
}

/** Párrafos que siguen a cada h5 («Dirección», «Vinos») hasta el siguiente h5, partidos en líneas. */
function secciones($: cheerio.CheerioAPI): Map<string, { lineas: string[]; hrefs: string[] }> {
  const out = new Map<string, { lineas: string[]; hrefs: string[] }>();
  $("h5").each((_, h) => {
    const clave = claveTexto($(h).text());
    if (!clave || out.has(clave)) return;
    const lineas: string[] = [];
    const hrefs: string[] = [];
    let n = $(h).next();
    while (n.length && !n.is("h5")) {
      const c = n.clone();
      c.find("br").replaceWith("\n");
      lineas.push(...c.text().split("\n").map(limpiarEspacios).filter(Boolean));
      n.find("a[href]").each((_, a) => void hrefs.push($(a).attr("href")!.trim()));
      n = n.next();
    }
    out.set(clave, { lineas, hrefs });
  });
  return out;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("h1").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const s = secciones($);
  const dir = s.get("direccion") ?? { lineas: [], hrefs: [] };

  let cp: string | null = null;
  let municipio: string | null = null;
  let provincia: string | null = null;
  let telefono: string | null = null;
  let email: string | null = null;
  let webTexto: string | null = null;
  const calle: string[] = [];
  for (const l of dir.lineas) {
    const m = /^(\d{5})\s+(.*?)\s*(?:\(([^)]+)\))?$/.exec(l);
    if (m && !cp) {
      [cp, municipio, provincia] = [m[1]!, t(m[2]!.replace(/[.,]\s*Zaragoza$/i, "")), t(m[3])];
      continue;
    }
    const tel = /^(?:Tel[éf]?(?:ono)?\.?:?)\s*(.+)$/i.exec(l);
    if (tel) {
      telefono ??= t(tel[1]!.split(/\s+[/–-]\s+/)[0]);
      continue;
    }
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(l)) {
      email ??= l.toLowerCase();
      continue;
    }
    if (/^(?:https?:\/\/|www\.)/i.test(l)) {
      webTexto ??= /^https?:\/\//i.test(l) ? l : `http://${l}`;
      continue;
    }
    if (!cp) calle.push(l);
  }
  const href = dir.hrefs.find((h) => /^https?:\/\//i.test(h) && !h.includes("calatayudwine"));
  const mail = dir.hrefs.find((h) => /^mailto:/i.test(h));
  if (mail) email ??= mail.slice(7).trim().toLowerCase();

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: t(calle.join(", ")),
    codigo_postal: cp,
    municipio,
    provincia_texto: provincia,
    ubicacion: null,
    web: href ?? webTexto,
    telefono,
    email,
    // «Tranquera: Tinto Joven, Garnacha…» → la marca es lo que va antes de los dos puntos.
    marcas: [...new Set((s.get("vinos")?.lineas ?? []).map((l) => limpiarEspacios(l.split(":")[0]!)).filter(Boolean))],
    enoturismo: null,
    extra: {},
  };
}

export const consejoCalatayud: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "calatayud", nombre: "Calatayud" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas/bodegas-ateca/`],
  // Toda la D.O. está en Zaragoza.
  provinciaUnica: "Zaragoza",
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
