// C.R.D.O. Rueda (dorueda.com, WordPress + Participants Database): /bodegas/ es una tabla única con
// localidad, nombre, web, «Visitable» y tienda online. Las fichas `?pdb=N` devuelven la misma tabla,
// así que no se piden: la tabla es la ficha. Sin código postal: provincia por tabla de municipios.
import * as cheerio from "cheerio";
import { normalizarWeb } from "../../lib/contacto.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-rueda";
export const BASE = "https://dorueda.com";
export const URL_LISTADO = `${BASE}/bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

const lista = (provincia: string, municipios: string[]) => municipios.map((m) => [claveTexto(m), provincia] as const);

/** Municipios de la zona de producción (Valladolid, Segovia y Ávila). */
export const PROVINCIA_POR_MUNICIPIO: Record<string, string> = Object.fromEntries([
  ...lista("Valladolid", [
    "Alcazarén", "Aldeamayor de San Martín", "Ataquines", "Bobadilla del Campo", "Bocigas", "Brahojos de Medina",
    "Campillo", "Carpio", "Castrejón de Trabancos", "Castronuño", "Cervillego de la Cruz", "Fresno el Viejo",
    "Fuente el Sol", "Gomeznarro", "Hornillos de Eresma", "Llano de Olmedo", "Lomoviejo", "La Seca", "Matapozuelos",
    "Medina del Campo", "Mojados", "Moraleja de las Panaderas", "Muriel", "Nava del Rey", "Nueva Villa de las Torres",
    "Olmedo", "Pollos", "Pozal de Gallinas", "Pozaldez", "Puras", "Ramiro", "Rodilana", "Rubí de Bracamonte",
    "Rueda", "Salvador de Zapardiel", "San Pablo de la Moraleja", "San Vicente del Palacio", "Serrada",
    "Siete Iglesias de Trabancos", "Tordesillas", "Torrecilla de la Abadesa", "Torrecilla del Valle",
    "Valdestillas", "Velascálvaro", "Ventosa de la Cuesta", "Villafranca de Duero", "Villanueva de Duero",
    "Villaverde de Medina", "Zarza", "Íscar", "Villán de Tordesillas",
  ]),
  ...lista("Segovia", [
    "Aldeanueva del Codonal", "Aldehuela del Codonal", "Bernuy de Coca", "Codorniz", "Coca", "Donhierro",
    "Fuente de Santa Cruz", "Juarros de Voltoya", "Llano de San Vicente", "Montejo de Arévalo", "Moraleja de Coca",
    "Nava de la Asunción", "Nieva", "Rapariegos", "San Cristóbal de la Vega", "Santiuste de San Juan Bautista",
    "Tolocirio", "Villagonzalo de Coca", "Martín Muñoz de la Dehesa", "Navas de Oro", "Santa María la Real de Nieva",
  ]),
  ...lista("Ávila", [
    "Madrigal de las Altas Torres", "Arévalo", "Fontiveros", "Blasconuño de Matacabras", "Horcajo de las Torres",
    "Palacios de Goda", "Barromán", "Castellanos de Zapardiel", "Donvidas", "Espinosa de los Caballeros",
    "Fuentes de Año", "Langa", "Moraleja de Matacabras", "Rasueros", "Salvadiós", "San Esteban de Zapardiel",
    "Villanueva del Aceral", "Constanzana", "Cabezas del Pozo", "Mamblas", "Flores de Ávila", "Bercial de Zapardiel",
  ]),
]);

/** «Ruta del Vino de Rueda» / «Sí» → true; «No» → false; vacío → null. */
export function visitable(texto: string | null): boolean | null {
  const c = claveTexto(texto ?? "");
  if (!c) return null;
  if (c === "no") return false;
  return /^si\b|ruta del vino|visitable/.test(c) ? true : null;
}

/** Fila → entrada completa (la tabla es la ficha). */
export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  $("table.list-container tbody tr").each((_, tr) => {
    const fila = $(tr);
    const a = fila.find("td.bodega-field a[href]").first();
    const nombre = t(a.text()) ?? t(fila.find("td.bodega-field").text());
    const pdb = /[?&]pdb=(\d+)/.exec(a.attr("href") ?? "")?.[1];
    if (!nombre || !pdb || vistos.has(pdb)) return;
    vistos.add(pdb);
    const visitableTexto = t(fila.find("td.visitable-field").text());
    const tienda = normalizarWeb(fila.find("td.url_tienda_on_line-field a[href]").first().attr("href") ?? null);
    out.push({
      url: `${URL_LISTADO}?pdb=${pdb}`,
      datos: {
        id_externo: `pdb:${pdb}`,
        nombre,
        municipio: t(fila.find("td.city-field").text()),
        web: fila.find("td.website-field a[href]").first().attr("href") ?? t(fila.find("td.website-field").text()),
        enoturismo: visitable(visitableTexto),
        extra: {
          ...(visitableTexto ? { visitable: visitableTexto } : {}),
          ...(tienda ? { tienda_online: tienda } : {}),
        },
      },
    });
  });
  return out;
}

export const consejoRueda: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "rueda", nombre: "Rueda" },
  urlsRobots: [URL_LISTADO],
  provinciaPorMunicipio: PROVINCIA_POR_MUNICIPIO,
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
};
