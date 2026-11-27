// C.R.D.O.P. Jumilla (jumilla.wine, WordPress + Elementor): /nuestras-bodegas/ enlaza las fichas
// /bodegas_cpt/<slug>/. Cada ficha es una secuencia de bloques de texto: «Municipio de la bodega»,
// descripción (no se lee nunca), dirección con «CP Municipio (Provincia)», teléfono/fax, web, tienda
// y email. Los iconos «Tienda online / Enoturismo / Ecológico» los muestra un script y en el HTML
// salen ocultos en todas las fichas: no se usan.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-jumilla";
export const BASE = "https://jumilla.wine";
export const URL_LISTADO = `${BASE}/nuestras-bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

/** Tiendas y marketplaces que algunas fichas ponen como web: no son la web de la bodega. */
const NO_WEB = /amazon\.|maticesgourmet\.|tienda\.|\/tienda|\/shop|catalogo/i;

/** La D.O. abarca municipios de Murcia y Albacete; algunas fichas no traen CP. */
export const PROVINCIA_POR_MUNICIPIO: Record<string, string> = Object.fromEntries(
  [
    ["Jumilla", "Murcia"], ["Ontur", "Albacete"], ["Albatana", "Albacete"], ["Fuente-Álamo", "Albacete"],
    ["Hellín", "Albacete"], ["Montealegre del Castillo", "Albacete"], ["Tobarra", "Albacete"],
  ].map(([m, p]) => [claveTexto(m!), p!]),
);

/** Grafías de las fichas → nombre del catálogo. «Ontur y Albatana» es una bodega con sede en Ontur. */
export const ALIAS_MUNICIPIO: Record<string, string> = {
  fuentealamo: "Fuente-Álamo", "ontur y albatana": "Ontur",
};

/** Compara municipios sin espacios, guiones ni tildes («Fuenteálamo» = «Fuente-Álamo»). */
const mismoMunicipio = (a: string, b: string) => {
  const k = (x: string) => claveTexto(ALIAS_MUNICIPIO[claveTexto(x)] ?? x).replace(/\s+/g, "");
  return k(a) === k(b);
};

export function slugDe(href: string): string | null {
  const m = /^\/bodegas_cpt\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $("a[href*='/bodegas_cpt/']").each((_, a) => {
    const slug = slugDe($(a).attr("href")!);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({ url: `${BASE}/bodegas_cpt/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  });
  return out;
}

/** «Paraje…, s/n / Ctra. …, km7 / 30520 Jumilla (Murcia)» → calle, CP, municipio y provincia. */
export function partirDireccion(lineas: string[]): {
  direccion: string | null; cp: string | null; municipio: string | null; provincia: string | null;
} {
  const i = lineas.findIndex((l) => /^\d{5}\b/.test(l));
  if (i < 0) return { direccion: t(lineas.join(", ")), cp: null, municipio: null, provincia: null };
  // «30520 Jumilla (Murcia)» o «30520 Jumilla, Murcia».
  const m = /^(\d{5})\s+(.*?)\s*(?:\(([^)]+)\)|,\s*([^,]+))?$/.exec(lineas[i]!)!;
  const calle = lineas.slice(0, i).filter((l) => !/apartado de correos/i.test(l));
  return { direccion: t(calle.join(", ").replace(/,(\s*,)+/g, ",").replace(/[,\s]+$/, "")), cp: m[1]!, municipio: t(m[2]), provincia: t(m[3] ?? m[4]) };
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const h1 = $("h1").first();
  const nombre = t(h1.text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  // Bloques de texto entre el título y los iconos, en orden de documento.
  const bloques: string[][] = [];
  $(".elementor-widget-text-editor, .elementor-widget-icon-list").each((_, el) => {
    // El pie trae el contacto del propio consejo.
    if ($(el).closest("footer, [data-elementor-type='footer']").length) return;
    const c = $(el).children(".elementor-widget-container").clone();
    c.find("br").replaceWith("\n");
    c.find("p").after("\n");
    const lineas = c
      .text()
      .split("\n")
      .map(limpiarEspacios)
      .filter(Boolean);
    if (lineas.length) bloques.push(lineas);
  });

  let municipioDo: string | null = null;
  let dir: ReturnType<typeof partirDireccion> | null = null;
  let telefono: string | null = null;
  const urls: string[] = [];
  let email: string | null = null;
  for (const b of bloques) {
    const texto = b.join("\n");
    const mun = /^Municipio de la bodega:\s*(.*)$/i.exec(b[0]!);
    if (mun) {
      municipioDo = t(mun[1]);
      continue;
    }
    if (!dir && b.some((l) => /^\d{5}\s+\S/.test(l)) && b.length <= 5) {
      dir = partirDireccion(b);
      continue;
    }
    const tel = /Tl[fé]\.?:\s*([+()\d][\d\s()+.-]{6,}\d)/i.exec(texto);
    if (tel) {
      telefono ??= t(tel[1]!.split(/\s+[–-]\s+/)[0]);
      continue;
    }
    if (b.length === 1 && /^https?:\/\/\S+$/i.test(b[0]!)) {
      urls.push(b[0]!);
      continue;
    }
    if (b.length === 1 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(b[0]!)) email ??= b[0]!.toLowerCase();
  }

  const web = urls.find((u) => !NO_WEB.test(u)) ?? null;
  const tienda = urls.find((u) => u !== web) ?? null;
  // Si la dirección es de otro municipio (la sede), no se toma como dirección de la bodega.
  const sede = !!municipioDo && !!dir?.municipio && !mismoMunicipio(dir.municipio, municipioDo);
  const extra: Record<string, unknown> = {};
  if (tienda) extra.tienda_online = tienda;
  if (sede) extra.direccion_contacto = [dir!.direccion, `${dir!.cp} ${dir!.municipio}`].filter(Boolean).join(", ");
  if (sede) dir = null;
  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: dir?.direccion ?? null,
    codigo_postal: dir?.cp ?? null,
    municipio: municipioDo ?? dir?.municipio ?? null,
    provincia_texto: dir?.provincia ?? null,
    ubicacion: null,
    web,
    telefono,
    email,
    marcas: [],
    enoturismo: null,
    extra,
  };
}

export const consejoJumilla: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "jumilla", nombre: "Jumilla" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas_cpt/bodegas-alceno/`],
  provinciaPorMunicipio: PROVINCIA_POR_MUNICIPIO,
  aliasMunicipio: ALIAS_MUNICIPIO,
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
