// C.R.D.O. Bierzo (www.crdobierzo.es, web propia): /es/bodegas-y-vinos/ lista todas las fichas
// (`ul.bodegas_lista`) → fichas /es/bodegas-y-vinos/<slug>/<id>/ con dirección, contacto y coordenadas.
// Los nombres de personas (contacto, directores) no se guardan.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-bierzo";
export const BASE = "https://www.crdobierzo.es/";
export const URL_LISTADO = `${BASE}es/bodegas-y-vinos/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

/** id numérico de una URL de ficha (/es/bodegas-y-vinos/<slug>/<id>/) o null. */
export function idDe(url: string): string | null {
  const m = /^\/es\/bodegas-y-vinos\/(?!buscador\/)[a-z0-9-]+\/(\d+)\/?$/.exec(new URL(url, BASE).pathname);
  return m ? m[1]! : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const base = $("base[href]").attr("href") ?? BASE;
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  $("ul.bodegas_lista li a[href]").each((_, a) => {
    const url = new URL($(a).attr("href")!, base).href.replace(/^http:/, "https:");
    const id = idDe(url);
    if (!id || vistos.has(id)) return;
    vistos.add(id);
    out.push({ url, datos: { id_externo: `id:${id}`, nombre: t($(a).attr("title") ?? $(a).text()) ?? undefined } });
  });
  return out;
}

/** Líneas de un bloque con <br>. */
function lineas($: cheerio.CheerioAPI, el: ReturnType<cheerio.CheerioAPI>): string[] {
  const html = el.html() ?? "";
  return html
    .split(/<br\s*\/?>/i)
    .map((trozo) => t(cheerio.load(`<p>${trozo}</p>`)("p").text()))
    .filter((x): x is string => !!x);
}

/** Etiqueta en <strong> → texto que la sigue hasta el siguiente <br> («Teléfono: 983 878 400 / …»). */
function campos($: cheerio.CheerioAPI): Map<string, string> {
  const out = new Map<string, string>();
  $("#interior_bodegas_izquierda span.bodegas_texto").each((_, span) => {
    for (const linea of lineas($, $(span))) {
      const m = /^([^:]{2,40}):\s*(.*)$/.exec(linea);
      if (m && !out.has(m[1]!.toLowerCase())) out.set(m[1]!.toLowerCase(), m[2]!.trim());
    }
  });
  return out;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("#interior_bodegas_izquierda h2").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  // Primer bloque: «Calle» / «24401 Ponferrada» / «León, España».
  const dir = lineas($, $("#interior_bodegas_izquierda span.bodegas_texto").first()).filter((l) => !/^[^:]{2,40}:/.test(l));
  let calle: string | null = null;
  let cp: string | null = null;
  let municipio: string | null = null;
  let provincia: string | null = null;
  for (const l of dir) {
    const m = /^(\d{5})\s+(.+)$/.exec(l);
    if (m) {
      cp = m[1]!;
      municipio = m[2]!;
    } else if (cp) provincia ??= l;
    else calle ??= l;
  }

  const c = campos($);
  const web = $("#interior_bodegas_izquierda a.btnVentaDirecta[href]").first().attr("href") ?? c.get("web") ?? null;
  const lat = Number($("#CoordenadasLat").attr("value"));
  const lng = Number($("#CoordenadasLng").attr("value"));

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `id:${idDe(entrada.url)}`,
    nombre,
    direccion: calle,
    codigo_postal: cp,
    municipio,
    provincia_texto: provincia,
    ubicacion: Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null,
    web,
    telefono: c.get("teléfono") ?? null,
    email: c.get("email") ?? null,
    marcas: [],
    enoturismo: null,
    extra: {},
  };
}

export const consejoBierzo: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "bierzo", nombre: "Bierzo" },
  urlsRobots: [URL_LISTADO, `${BASE}es/bodegas-y-vinos/bodegas-emilio-moro-sl/93/`],
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
