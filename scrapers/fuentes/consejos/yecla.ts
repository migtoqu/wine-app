// C.R.D.O.P. Yecla (yeclavino.com, WordPress + Elementor): /bodegas/ enlaza las fichas /bodega/<slug>/.
// Cada ficha trae una lista con iconos: teléfono, email, web y dirección («Bodegas Evine, Camino de Sax
// Km.7 30510 Yecla (Murcia)»). El teléfono es el mismo en todas las fichas (el de una plantilla), así
// que no se lee. La D.O. es el término municipal de Yecla. La descripción y las fotos no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-yecla";
export const BASE = "https://yeclavino.com";
export const URL_LISTADO = `${BASE}/bodegas/`;

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

const VIA = /^(c\/|calle|avda|avenida|ctra|carretera|camino|paraje|traves[ií]a|plaza|pol[ií]gono|finca)\b/i;
const RELLENO = /^(espa[ñn]a|murcia|\(murcia\)|yecla|\d{5}|\(\d{5}\))$/i;

/**
 * «Bodega la Purísima, travesía Pinoso, 3 30510 Yecla, Murcia España», «Bodegas Castaño - Avenida de
 * Fuenteálamo nº 3 - 30510 - España - Murcia - Yecla» → la calle (sin el nombre de la bodega) y el CP.
 */
export function partirDireccion(texto: string | null): { direccion: string | null; cp: string | null } {
  if (!texto) return { direccion: null, cp: null };
  const cp = /\b(\d{5})\b/.exec(texto);
  const antes = cp ? texto.slice(0, cp.index) : texto;
  const partes = antes.split(/\s+-\s+|,\s+/).map((p) => limpiarEspacios(p.replace(/[(]\s*$/, ""))).filter((p) => p && !RELLENO.test(p));
  // La primera parte es el nombre de la bodega si no tiene números ni empieza por un tipo de vía.
  if (partes.length > 1 && !/\d/.test(partes[0]!) && !VIA.test(partes[0]!)) partes.shift();
  return { direccion: t(partes.join(", ")), cp: cp ? cp[1]! : null };
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("h1").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  let email = null as string | null;
  let web = null as string | null;
  let direccionTexto = null as string | null;
  $(".elementor-icon-list-item")
    .filter((_, li) => !$(li).closest("[data-elementor-type='footer'], footer").length)
    .each((_, li) => {
      const icono = $(li).find("i, svg").attr("class") ?? "";
      const href = $(li).find("a[href]").attr("href")?.trim() ?? "";
      const texto = t($(li).find(".elementor-icon-list-text").text());
      if (/^mailto:/i.test(href) || /envelope/.test(icono)) email ??= (href.replace(/^mailto:/i, "") || texto)?.toLowerCase() ?? null;
      else if (/map-marker/.test(icono)) direccionTexto ??= texto;
      else if (/link|globe/.test(icono) && /^https?:\/\/[^/]+\.[a-z]{2,}/i.test(href)) web ??= href;
    });
  const dir = partirDireccion(direccionTexto);

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: dir.direccion && claveTexto(dir.direccion) !== claveTexto(nombre) ? dir.direccion : null,
    codigo_postal: dir.cp,
    municipio: "Yecla",
    provincia_texto: "Murcia",
    ubicacion: null,
    web: web && !web.includes("yeclavino") ? web : null,
    telefono: null,
    email: email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) ? email : null,
    marcas: [],
    enoturismo: null,
    extra: {},
  };
}

export const consejoYecla: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "yecla", nombre: "Yecla" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodega/castano/`],
  provinciaUnica: "Murcia",
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
