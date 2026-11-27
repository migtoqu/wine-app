// C.R.D.O. Jerez-Xérès-Sherry y Manzanilla-Sanlúcar de Barrameda (sherry.wine): «Bodegas listing» es una
// página única con todas las bodegas inscritas (nombre, razón social, dirección en tres líneas, email y
// web). Las pestañas `?t=crianza-y-expedicion` y `?t=crianza-y-almacenista` filtran por registro: se
// piden solo para saber el tipo de cada bodega. Las fichas no se piden. El listado solo existe en inglés,
// pero los datos (nombre, dirección) son los de la bodega.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-jerez";
export const BASE = "https://www.sherry.wine";
export const URL_LISTADO = `${BASE}/sherry-wine/bodegas/bodegas-listing`;
export const URL_EXPEDICION = `${URL_LISTADO}?t=crianza-y-expedicion`;
export const URL_ALMACENISTA = `${URL_LISTADO}?t=crianza-y-almacenista`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

/** Grafías del listado → municipio del catálogo. Guadalcacín es una pedanía de Jerez. */
export const ALIAS_MUNICIPIO: Record<string, string> = {
  [claveTexto("Chiclana")]: "Chiclana de la Frontera",
  [claveTexto("Guadalcacin")]: "Jerez de la Frontera",
  [claveTexto("El Puerto de Sta. María")]: "El Puerto de Santa María",
};

const PROVINCIAS = /\s+(C[áa]diz|Sevilla|Huelva|M[áa]laga|Madrid)\s*$/i;

/** «Calle Baños nº 1, | Sanlúcar de Barrameda Cádiz | 11540 Spain» → calle, municipio y CP. */
export function partesDireccion(lineas: string[]): { direccion: string | null; municipio: string | null; provincia: string | null; cp: string | null } {
  const l = lineas.map((x) => limpiarEspacios(x.replace(/\bNone\b/g, ""))).filter(Boolean);
  const cpLinea = l.findIndex((x) => /^\d{5}\b/.test(x));
  const cp = cpLinea >= 0 ? /^(\d{5})/.exec(l[cpLinea]!)![1]! : null;
  const resto = cpLinea >= 0 ? l.slice(0, cpLinea) : l;
  // Con una sola línea antes del CP, es el lugar si no parece una calle («None | None Sanlúcar…»).
  const soloLugar = resto.length === 1 && !/\d|^(?:c\/|calle|avda|avenida|ctra|carretera|plaza|pol)/i.test(resto[0]!);
  const lugar = resto.length >= 2 ? resto[resto.length - 1]! : soloLugar ? resto[0]! : null;
  const calle = resto.length >= 2 ? resto.slice(0, -1).join(", ") : soloLugar ? null : resto[0] ?? null;
  const prov = lugar ? PROVINCIAS.exec(` ${lugar}`)?.[1] ?? null : null;
  const municipio = lugar ? t(` ${lugar}`.replace(PROVINCIAS, "")) : null;
  return {
    direccion: calle ? t(calle.replace(/[\s,.]+$/, "")) : null,
    municipio,
    provincia: prov,
    cp,
  };
}

/** Listado → entradas completas (como Rueda: el listado es la ficha). */
export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  $(".bodega-informations .box-item").each((_, el) => {
    const b = $(el);
    const a = b.find("h2 a[href]").first();
    // Slugs con tildes codificadas («bodegas-arg%C3%BCeso») y alguno fuera de /sherry-wine/bodegas/.
    let url: URL | null = null;
    try { url = new URL(a.attr("href") ?? "", BASE); } catch { url = null; }
    const ultimo = url && url.host === new URL(BASE).host ? url.pathname.split("/").filter(Boolean).pop() : undefined;
    let slug: string | undefined;
    try { slug = ultimo ? decodeURIComponent(ultimo).toLowerCase() : undefined; } catch { slug = ultimo; }
    const nombre = t(a.text());
    if (!url || !slug || !nombre || vistos.has(slug)) return;
    vistos.add(slug);
    const addr = b.find("address").first();
    const lineas = (addr.html() ?? "").split(/<br\s*\/?>/i).map((h) => cheerio.load(`<p>${h}</p>`)("p").text());
    const d = partesDireccion(lineas);
    const enlaces = b.find(".box-item-links a[href]").toArray().map((x) => $(x).attr("href") ?? "");
    const email = enlaces.find((h) => h.startsWith("mailto:"))?.slice(7).trim().toLowerCase() ?? null;
    const web = enlaces.find((h) => /^https?:\/\//i.test(h)) ?? null;
    const razon = t(b.find("h3").first().text());
    out.push({
      url: url.href,
      datos: {
        id_externo: `slug:${slug}`,
        nombre,
        direccion: d.direccion,
        codigo_postal: d.cp,
        municipio: d.municipio,
        provincia_texto: d.provincia,
        web,
        email: email || null,
        extra: { ...(razon && claveTexto(razon) !== claveTexto(nombre) ? { razon_social: razon } : {}) },
      },
    });
  });
  return out;
}

/** Slugs de una pestaña del listado (para el tipo de registro). */
export function slugsDe(html: string): Set<string> {
  return new Set(parsearListado(html).map((e) => e.datos.id_externo!));
}

export const consejoJerez: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "jerez-xeres-sherry", nombre: "Jerez-Xérès-Sherry" },
  urlsRobots: [URL_LISTADO, URL_EXPEDICION],
  aliasMunicipio: ALIAS_MUNICIPIO,
  async listar(ctx: Contexto) {
    const todas = parsearListado((await ctx.http.get(URL_LISTADO)).texto);
    const expedicion = slugsDe((await ctx.http.get(URL_EXPEDICION)).texto);
    const almacenista = slugsDe((await ctx.http.get(URL_ALMACENISTA)).texto);
    for (const e of todas) {
      const id = e.datos.id_externo!;
      const registro = expedicion.has(id) ? "crianza_y_expedicion" : almacenista.has(id) ? "almacenista" : null;
      if (registro) e.datos.extra = { ...e.datos.extra, registro };
    }
    return todas;
  },
};
