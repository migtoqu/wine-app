// C.R. D.O. Empordà (doemporda.cat, gestor propio): /ca/els-cellers.html enlaza las fichas
// /ca/els-cellers/l/<id>-<slug>.html. Cada ficha trae un bloque `.aguantaDadesCeller` con dirección,
// «CP, Municipio», teléfono y web; un párrafo con «Ha en propietat», «Varietats de raïm», «Tipus de vi»
// y «Marques»; y el botón «Com arribar» con las coordenadas. La descripción y el logo no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { puntoEnEspana, type Punto } from "../../lib/geo.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-emporda";
export const BASE = "https://www.doemporda.cat";
export const URL_LISTADO = `${BASE}/ca/els-cellers.html`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

/** «/ca/els-cellers/l/60-aldea-de-buscaros.html» → id 60. */
export function idDe(href: string): string | null {
  const m = /^\/ca\/els-cellers\/l\/(\d+)-[a-z0-9-]+\.html$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $("a[href*='/els-cellers/l/']").each((_, a) => {
    const href = $(a).attr("href")!;
    const id = idDe(href);
    if (!id || vistos.has(id)) return;
    vistos.add(id);
    out.push({ url: new URL(href, BASE).href, datos: { id_externo: `id:${id}` } });
  });
  return out;
}

/** «Ha en propietat: 2», «Marques: A, B i C»… por etiqueta normalizada. */
function etiquetas($: cheerio.CheerioAPI): Map<string, string> {
  const out = new Map<string, string>();
  $(".descripcions .desc p").each((_, p) => {
    const c = $(p).clone();
    c.find("br").replaceWith("\n");
    for (const l of c.text().split("\n")) {
      const m = /^\s*([^:]{2,40}):\s*(.+?)\s*$/.exec(l);
      if (m) out.set(claveTexto(m[1]!), limpiarEspacios(m[2]!));
    }
  });
  return out;
}

/** «Aldea de Buscarós, Vinya X i Y» → marcas separadas por comas, «i» o «/». */
export function partirLista(texto: string | null | undefined): string[] {
  if (!texto) return [];
  return texto
    .split(/\s*(?:[,;\/]|\s[iy]\s)\s*/)
    .map((x) => t(x.replace(/[.]+$/, "")))
    .filter((x): x is string => !!x && x.length > 1);
}

export function ubicacionDe($: cheerio.CheerioAPI): Punto | null {
  const href = $("a.btn_com_arribar").attr("href") ?? "";
  const m = /\/dir\/\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(href);
  if (!m) return null;
  const p = { lat: Number(m[1]), lng: Number(m[2]) };
  return puntoEnEspana(p) && !(p.lat === 0 && p.lng === 0) ? p : null;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("h1").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  let direccion: string | null = null;
  let cp: string | null = null;
  let municipio: string | null = null;
  let telefono: string | null = null;
  let web: string | null = null;
  let email: string | null = null;
  const sueltas: string[] = [];
  $(".aguantaDadesCeller p").each((_, p) => {
    const a = $(p).find("a[href]").first();
    if (a.length) {
      const href = a.attr("href")!.trim();
      if (/^mailto:/i.test(href)) email ??= href.slice(7).trim().toLowerCase();
      else if (/^https?:\/\/[^/]+\.[a-z]{2,}/i.test(href) && !href.includes("doemporda")) web ??= href;
      return;
    }
    const l = t($(p).text());
    if (!l) return;
    const cpm = /^(\d{5})\s*,?\s*(.+)$/.exec(l);
    if (cpm && !cp) {
      cp = cpm[1]!;
      municipio = t(cpm[2]);
    } else if (/^[+()\d][\d\s()+.-]{7,}$/.test(l)) telefono ??= l;
    else if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(l)) email ??= l.toLowerCase();
    else if (!cp) sueltas.push(l);
  });
  direccion = t(sueltas.join(", "));

  const e = etiquetas($);
  const extra: Record<string, unknown> = {};
  const ha = /(\d+(?:[.,]\d+)?)/.exec(e.get("ha en propietat") ?? "");
  if (ha) extra.vinedo_propio_ha = Number(ha[1]!.replace(",", "."));
  const varietats = partirLista(e.get("varietats de raim"));
  if (varietats.length) extra.variedades = varietats;
  const tipus = partirLista(e.get("tipus de vi"));
  if (tipus.length) extra.tipos_vino = tipus;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `id:${idDe(entrada.url)}`,
    nombre,
    direccion,
    codigo_postal: cp,
    municipio,
    provincia_texto: null,
    ubicacion: ubicacionDe($),
    web,
    telefono,
    email,
    marcas: partirLista(e.get("marques")),
    enoturismo: null,
    extra,
  };
}

export const consejoEmporda: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "emporda", nombre: "Empordà" },
  urlsRobots: [URL_LISTADO, `${BASE}/ca/els-cellers/l/60-aldea-de-buscaros.html`],
  // Toda la D.O. está en Girona.
  provinciaUnica: "Girona",
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
