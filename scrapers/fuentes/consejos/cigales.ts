// C.R.D.O. Cigales (do-cigales.es, WordPress + Elementor): /bodegas/ agrupa las fichas por
// municipio («Municipio de Cubillas de Santa Marta») → fichas /bodegas/<slug>/ con marcas y contacto.
// La descripción de la bodega no se lee nunca.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-cigales";
export const BASE = "https://do-cigales.es";
export const URL_LISTADO = `${BASE}/bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(url: string): string | null {
  const m = /^\/bodegas\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(url, BASE).pathname);
  return m ? m[1]! : null;
}

/** Municipios de la D.O. (todos en Valladolid salvo Dueñas, en Palencia). */
export const PROVINCIA_POR_MUNICIPIO: Record<string, string> = Object.fromEntries(
  [
    ["Cigales", "Valladolid"], ["Corcos", "Valladolid"], ["Cubillas de Santa Marta", "Valladolid"],
    ["Fuensaldaña", "Valladolid"], ["Mucientes", "Valladolid"], ["Trigueros del Valle", "Valladolid"],
    ["Valoria la Buena", "Valladolid"], ["Cabezón de Pisuerga", "Valladolid"], ["Quintanilla de Trigueros", "Valladolid"],
    ["San Martín de Valvení", "Valladolid"], ["Santovenia de Pisuerga", "Valladolid"], ["Dueñas", "Palencia"],
  ].map(([m, p]) => [claveTexto(m!), p!]),
);

/** El listado abrevia «Trigueros». */
export const ALIAS_MUNICIPIO: Record<string, string> = { trigueros: "Trigueros del Valle" };

/** Fichas en orden, con el municipio del encabezado que las precede. */
export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  let municipio: string | null = null;
  $("h1.sc_item_title, .sc_icons_item_title a[href]").each((_, el) => {
    if ($(el).is("h1")) {
      const m = /^Municipio de\s+(.+)$/i.exec(t($(el).text()) ?? "");
      municipio = m ? m[1]! : null;
      return;
    }
    const slug = slugDe($(el).attr("href")!);
    const nombre = t($(el).text());
    if (!slug || !nombre || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({ url: `${BASE}/bodegas/${slug}/`, datos: { id_externo: `slug:${slug}`, nombre, municipio } });
  });
  return out;
}

/** «Cam. Bodegas Protos, 24-28, 47300 Peñafiel, Valladolid» → calle, CP, municipio y provincia. */
export function partirDireccion(texto: string | null): {
  calle: string | null; cp: string | null; municipio: string | null; provincia: string | null;
} {
  const vacia = { calle: null, cp: null, municipio: null, provincia: null };
  if (!texto) return vacia;
  const m = /^(.*?)[,\s]*\b(\d{5})\b\s*([^,]*)(?:,\s*(.+))?$/.exec(limpiarEspacios(texto));
  if (!m) return { ...vacia, calle: limpiarEspacios(texto) };
  return { calle: t(m[1]), cp: m[2]!, municipio: t(m[3]), provincia: t(m[4]) };
}

/** La primera lista (`ul`) que sigue a cada encabezado h3 («Marcas de vino», «Contacto»). */
type Nodos = ReturnType<cheerio.CheerioAPI>;

function listasPorEncabezado($: cheerio.CheerioAPI): Map<string, Nodos> {
  const out = new Map<string, Nodos>();
  let encabezado: string | null = null;
  $("h3, ul").each((_, el) => {
    if ($(el).is("h3")) {
      encabezado = t($(el).text());
      return;
    }
    if (encabezado && !out.has(encabezado)) {
      out.set(encabezado, $(el));
      encabezado = null;
    }
  });
  return out;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = entrada.datos.nombre ?? t($("meta[property='og:title']").attr("content")?.split(/\s+[–-]\s+/)[0]);
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const listas = listasPorEncabezado($);

  const marcas = (listas.get("Marcas de vino")?.find("li") ?? $([]))
    .map((_, li) => t($(li).text()))
    .get()
    .filter((x): x is string => !!x);

  let direccionTexto: string | null = null;
  let telefono: string | null = null;
  let email: string | null = null;
  let web: string | null = null;
  // Las líneas sin enlace son la persona de contacto: dato personal, no se guarda.
  listas.get("Contacto")?.find("li a[href]").each((_, a) => {
    const href = $(a).attr("href")!.trim();
    const texto = t($(a).text());
    if (/^tel:/i.test(href)) telefono ??= texto ?? href.replace(/^tel:/i, "");
    else if (/^mailto:/i.test(href)) email ??= href.replace(/^mailto:/i, "");
    else if (/maps\.(app\.goo\.gl|google\.)|goo\.gl\/maps/i.test(href)) direccionTexto ??= texto;
    else if (/^https?:\/\//i.test(href) && !href.includes("do-cigales.es")) web ??= href;
  });

  // El municipio de la D.O. lo da el listado; la dirección de contacto puede ser la sede
  // (Protos: Peñafiel). Solo se usa como dirección de la bodega si es del mismo municipio.
  const dir = partirDireccion(direccionTexto);
  const municipio = entrada.datos.municipio ?? dir.municipio;
  const canonico = (m: string) => claveTexto(ALIAS_MUNICIPIO[claveTexto(m)] ?? m);
  const usarDireccion =
    !entrada.datos.municipio || (!!dir.municipio && !!municipio && canonico(dir.municipio) === canonico(municipio));

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: usarDireccion ? dir.calle : null,
    codigo_postal: usarDireccion ? dir.cp : null,
    municipio,
    provincia_texto: usarDireccion ? dir.provincia : null,
    ubicacion: null,
    web,
    telefono,
    email,
    marcas,
    enoturismo: null,
    extra: !usarDireccion && direccionTexto ? { direccion_contacto: direccionTexto } : {},
  };
}

export const consejoCigales: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "cigales", nombre: "Cigales" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas/bodegas-protos/`],
  provinciaPorMunicipio: PROVINCIA_POR_MUNICIPIO,
  aliasMunicipio: ALIAS_MUNICIPIO,
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
