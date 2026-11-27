// C.R.D.O.P. Bullas (vinosdebullas.es, WordPress): /bodegas/ trae todas las bodegas en una página,
// cada una con párrafos etiquetados («Dirección», «Teléfono», «Web», «Tienda»). No hay fichas: el
// listado es la ficha. El email está ofuscado por script y no se lee; tampoco el responsable ni la
// descripción. Toda la D.O. está en la Región de Murcia.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { puntoEnEspana, type Punto } from "../../lib/geo.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-bullas";
export const BASE = "https://vinosdebullas.es";
export const URL_LISTADO = `${BASE}/bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

/** «latitud N37.97931, longitud W1.71829» → punto. */
export function coordenadasDe(texto: string): Punto | null {
  const m = /latitud\s*([NS])?\s*(\d+(?:\.\d+)?)\s*,?\s*longitud\s*([EWO])?\s*(\d+(?:\.\d+)?)/i.exec(texto);
  if (!m) return null;
  const p = { lat: Number(m[2]) * (/s/i.test(m[1] ?? "") ? -1 : 1), lng: Number(m[4]) * (/[wo]/i.test(m[3] ?? "") ? -1 : 1) };
  return puntoEnEspana(p) ? p : null;
}

/**
 * «C/ Ginés de Paco, 22. 30430 Cehegín (Murcia)», «Paraje Casa Enrique. Caravaca de la Cruz, (Murcia)»,
 * «C12 - Polígono … Mula, 30.193 (Murcia)» → calle, CP y municipio.
 */
export function partirDireccion(texto: string | null): { direccion: string | null; cp: string | null; municipio: string | null } {
  if (!texto) return { direccion: null, cp: null, municipio: null };
  const s = texto.replace(/coordenadas:.*$/i, "").replace(/\(\s*murcia\s*\)/i, "").replace(/[\s.,]+$/, "");
  const conCp = /^(.*?)[\s.,]*\b(\d{5})\s+([^\d.,()]+)$/.exec(s);
  if (conCp) return { direccion: t(conCp[1]), cp: conCp[2]!, municipio: t(conCp[3]) };
  const cpDetras = /^(.*?)\s+([^\d.,()"]+),\s*(\d{2})\.(\d{3})$/.exec(s);
  if (cpDetras) return { direccion: t(cpDetras[1]), cp: cpDetras[3]! + cpDetras[4]!, municipio: t(cpDetras[2]) };
  const segs = s.split(/\.\s+/);
  const ultimo = segs.at(-1)!;
  if (segs.length > 1 && !/\d/.test(ultimo)) return { direccion: t(segs.slice(0, -1).join(". ")), cp: null, municipio: t(ultimo.split("-").at(-1)) };
  return { direccion: t(s), cp: null, municipio: null };
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  $(".wineries_feed_item_infos").each((_, it) => {
    const nombre = t($(it).find("h2").first().text());
    if (!nombre) return;
    const clave = claveTexto(nombre);
    if (vistos.has(clave)) return;
    vistos.add(clave);
    const campos = new Map<string, { texto: string; href: string | null }>();
    $(it).find("p").each((_, p) => {
      const etiqueta = claveTexto($(p).find("strong").first().text());
      if (!etiqueta || campos.has(etiqueta)) return;
      const texto = limpiarEspacios($(p).text().replace(/^[^:]*:/, ""));
      campos.set(etiqueta, { texto, href: $(p).find("a[href^='http']").attr("href")?.trim() ?? null });
    });
    const direccionTexto = campos.get("direccion")?.texto ?? null;
    const dir = partirDireccion(direccionTexto);
    const telefono = t(campos.get("telefono")?.texto.split(/\s*[/–(]\s*|\s+-\s+/)[0]);
    let web = campos.get("web")?.href ?? null;
    const extra: Record<string, unknown> = {};
    const tienda = campos.get("tienda")?.href;
    if (tienda) extra.tienda_online = tienda;
    // Una subpágina de la web de un grupo (mgwinesgroup.com/bodegas-lavia) no es la web de la bodega:
    // emparejar por ese dominio la fundiría con las demás bodegas del grupo.
    if (web && new URL(web).pathname.replace(/\/+$/, "").length > 0) {
      extra.web_grupo = web;
      web = null;
    }
    out.push({
      url: URL_LISTADO,
      datos: {
        url: URL_LISTADO,
        id_externo: `nombre:${clave.replace(/\s+/g, "-")}`,
        nombre,
        direccion: dir.direccion,
        codigo_postal: dir.cp,
        municipio: dir.municipio,
        provincia_texto: "Murcia",
        ubicacion: direccionTexto ? coordenadasDe(direccionTexto) : null,
        web,
        telefono,
        email: null,
        marcas: [],
        enoturismo: null,
        extra,
      },
    });
  });
  return out;
}

export const consejoBullas: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "bullas", nombre: "Bullas" },
  urlsRobots: [URL_LISTADO],
  provinciaUnica: "Murcia",
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
};
