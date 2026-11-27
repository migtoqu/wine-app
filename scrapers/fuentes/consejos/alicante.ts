// C.R.D.O.P. Alicante (vinosalicantedop.org, WordPress + Ultimate Addons): /conoce-las-bodegas-con-dop-alicante/
// agrupa las bodegas certificadas por comarca (encabezados h2) en tarjetas con el nombre y un enlace a la
// web de la bodega. No hay fichas: el listado es la ficha (nombre, web y comarca). Toda la D.O. está en
// la provincia de Alicante; el municipio no lo da. Los textos de las comarcas y los logos no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { capitalizarSiMayusculas, claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-alicante";
export const BASE = "https://vinosalicantedop.org";
export const URL_LISTADO = `${BASE}/conoce-las-bodegas-con-dop-alicante/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

/** Tarjetas de bodega con la comarca del último encabezado que las precede. */
export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  let comarca: string | null = null;
  $("h2, .ult-new-ib").each((_, el) => {
    if ($(el).is("h2")) {
      // Los h2 vacíos son el título de cada tarjeta; los que tienen texto, comarcas.
      if (!$(el).closest(".ult-new-ib").length) comarca = t($(el).text()) ?? comarca;
      return;
    }
    const nombre = t($(el).find(".ult-new-ib-content").text());
    const web = $(el).find("a.ult-new-ib-link").attr("href")?.trim() ?? null;
    if (!nombre) return;
    const clave = claveTexto(nombre);
    if (vistos.has(clave)) return;
    vistos.add(clave);
    out.push({
      url: URL_LISTADO,
      datos: {
        url: URL_LISTADO,
        id_externo: `nombre:${clave.replace(/\s+/g, "-")}`,
        nombre: capitalizarSiMayusculas(nombre),
        direccion: null,
        codigo_postal: null,
        municipio: null,
        provincia_texto: "Alicante",
        ubicacion: null,
        web: web && /^https?:\/\//i.test(web) && !web.includes("vinosalicantedop") ? web : null,
        telefono: null,
        email: null,
        marcas: [],
        enoturismo: null,
        extra: comarca ? { comarca } : {},
      },
    });
  });
  // Una web de grupo (mgwinesgroup.com para cuatro bodegas) no identifica a ninguna: emparejar por su
  // dominio las fundiría. Si un dominio se repite, ninguna de esas bodegas se queda con la web.
  const dominio = (w: string) => new URL(w).hostname.replace(/^www\./, "");
  const usos = new Map<string, number>();
  for (const e of out) if (e.datos.web) usos.set(dominio(e.datos.web), (usos.get(dominio(e.datos.web)) ?? 0) + 1);
  for (const e of out) {
    if (e.datos.web && usos.get(dominio(e.datos.web))! > 1) {
      e.datos.extra = { ...e.datos.extra, web_grupo: e.datos.web };
      e.datos.web = null;
    }
  }
  return out;
}

export const consejoAlicante: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "alicante", nombre: "Alicante" },
  urlsRobots: [URL_LISTADO],
  provinciaUnica: "Alicante",
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
};
