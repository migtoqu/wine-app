// C.R.D.O. Ribera del Guadiana (riberadelguadiana.eu, WordPress + Elementor): /bodegas/ y
// /bodegas/page/N/ enlazan las fichas /bodegas/<slug>/. Cada ficha trae una lista con iconos
// (dirección con «C.P. 10136», teléfono, email y web) y las tarjetas de sus vinos (nombre y tipo).
// La descripción, las imágenes y los certificados no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ErrorHttp } from "../../lib/http.ts";
import { limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-ribera-guadiana";
export const BASE = "https://riberadelguadiana.eu";
export const URL_LISTADO = `${BASE}/bodegas/`;
export const urlPagina = (n: number) => (n === 1 ? URL_LISTADO : `${URL_LISTADO}page/${n}/`);

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const m = /^\/bodegas\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(href, BASE).pathname);
  return m && m[1] !== "page" ? m[1]! : null;
}

export function parsearListado(html: string): { entradas: EntradaListado[]; ultimaPagina: number } {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const entradas: EntradaListado[] = [];
  $("a[href*='/bodegas/']").each((_, a) => {
    const slug = slugDe($(a).attr("href")!);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    entradas.push({ url: `${BASE}/bodegas/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  });
  const paginas = $("a[href*='/bodegas/page/'], link[rel='next'][href*='/bodegas/page/']")
    .map((_, a) => Number(/\/page\/(\d+)/.exec($(a).attr("href")!)?.[1] ?? 0))
    .get();
  return { entradas, ultimaPagina: Math.max(1, ...paginas) };
}

/** «C/Coto Nº 54 C.P. 10136» o «Ctra. X, km 2. 06200 Almendralejo» → calle, CP y municipio. */
export function partirDireccion(texto: string | null): {
  direccion: string | null; cp: string | null; municipio: string | null; provincia?: string;
} {
  if (!texto) return { direccion: null, cp: null, municipio: null };
  const m = /^(.*?)[\s,.–-]*(?:C\.?\s?P\.?:?\s*)?\b(\d{5})\b[\s,.–-]*(.*)$/i.exec(texto);
  if (!m) {
    // Sin CP: «Carretera de Palomas, Km. 1,8, Villafranca de los Barros, Badajoz».
    const partes = texto.split(/,\s+/).map((x) => limpiarEspacios(x)).filter(Boolean);
    if (partes.length >= 3 && /^(badajoz|c[aá]ceres)$/i.test(partes.at(-1)!) && !/\d/.test(partes.at(-2)!)) {
      return { direccion: t(partes.slice(0, -2).join(", ")), cp: null, municipio: partes.at(-2)!, provincia: partes.at(-1)! };
    }
    return { direccion: t(texto), cp: null, municipio: null };
  }
  const resto = t(m[3]!.replace(/\(.*?\)/g, "").split(/[,–-]/)[0]);
  return { direccion: t(m[1]!.replace(/[\s,.–-]+$/, "")), cp: m[2]!, municipio: resto && !/\d/.test(resto) ? resto : null };
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("h1").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  let direccionTexto: string | null = null;
  let telefono: string | null = null;
  let email: string | null = null;
  let web: string | null = null;
  // Solo la primera lista con icono de dirección: el pie trae la del propio consejo.
  const lista = $(".elementor-icon-list-items")
    .filter((_, ul) => $(ul).find("i.fa-map-marker-alt").length > 0 && !$(ul).closest("footer, [data-elementor-type='footer']").length)
    .first();
  lista.find("li").each((_, li) => {
    const icono = $(li).find("i").attr("class") ?? "";
    const texto = t($(li).find(".elementor-icon-list-text").text());
    const href = $(li).find("a[href]").attr("href")?.trim() ?? "";
    if (/map-marker/.test(icono)) direccionTexto ??= texto;
    else if (/phone/.test(icono)) telefono ??= texto?.split(/\s*[/–-]\s+/)[0] ?? null;
    else if (/envelope/.test(icono) || /^mailto:/i.test(href)) email ??= (href.replace(/^mailto:/i, "") || texto)?.toLowerCase() ?? null;
    else if (/globe/.test(icono) || /^https?:\/\//i.test(href)) web ??= /^https?:\/\//i.test(href) ? href : texto;
  });
  const dir = partirDireccion(direccionTexto);

  const vinos = $(".elementor-flip-box__back .elementor-flip-box__layer__title")
    .map((_, h) => t($(h).text()))
    .get()
    .filter((v): v is string => !!v);

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: dir.direccion,
    codigo_postal: dir.cp,
    municipio: dir.municipio,
    provincia_texto: dir.provincia ?? null,
    ubicacion: null,
    web: web && /\./.test(web) ? (/^https?:\/\//i.test(web) ? web : `http://${web}`) : null,
    telefono,
    email: email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) ? email : null,
    marcas: [...new Set(vinos)],
    enoturismo: null,
    extra: {},
  };
}

export const consejoRiberaGuadiana: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "ribera-del-guadiana", nombre: "Ribera del Guadiana" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas/bodegas-canalva/`],
  async listar(ctx: Contexto) {
    const primera = parsearListado((await ctx.http.get(urlPagina(1))).texto);
    const out = [...primera.entradas];
    const vistos = new Set(out.map((e) => e.url));
    // Cada página solo enlaza la siguiente (`rel=next`): se avanza mientras aparezcan fichas nuevas.
    // Una página que no existe redirige a la primera o da 404.
    let siguiente = primera.ultimaPagina > 1 ? 2 : 0;
    while (siguiente && siguiente <= 20) {
      let pagina: ReturnType<typeof parsearListado>;
      try {
        pagina = parsearListado((await ctx.http.get(urlPagina(siguiente))).texto);
      } catch (e) {
        if (e instanceof ErrorHttp && e.status === 404) break;
        throw e;
      }
      const nuevas = pagina.entradas.filter((e) => !vistos.has(e.url));
      for (const e of nuevas) out.push(e), vistos.add(e.url);
      siguiente = nuevas.length && pagina.ultimaPagina > siguiente ? siguiente + 1 : 0;
    }
    return out;
  },
  parsearFicha,
};
