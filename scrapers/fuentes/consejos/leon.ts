// C.R.D.O. León (doleon.es, WordPress): /bodegas/ lista las entradas de la categoría «Bodegas DO León»
// (una por bodega, /<slug>/). Cada entrada trae una lista con «Dirección», «Correo electrónico»,
// «Teléfono/s», «Web» y «Referencias» (sus marcas). No se leen la persona de contacto, los horarios,
// el texto ni las fotos. La D.O. está entre León y Valladolid.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-leon";
export const BASE = "https://doleon.es";
export const URL_LISTADO = `${BASE}/bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const u = new URL(href, BASE);
  if (u.hostname !== "doleon.es") return null;
  const m = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(u.pathname);
  return m && m[1] !== "bodegas" ? m[1]! : null;
}

/** Solo las entradas cuya categoría es «Bodegas DO León» (el listado mezcla noticias). */
export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $(".post-content-container").each((_, c) => {
    if (!$(c).find(".post-categories a[href*='/category/bodegas-es/']").length) return;
    const href = $(c).find("a.post-title[href]").attr("href");
    const slug = href ? slugDe(href) : null;
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({ url: `${BASE}/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  });
  return out;
}

const PROVINCIA_FINAL = /[\s,.;]*\b(le[oó]n|valladolid)\b[\s,.;]*$/i;

/**
 * «C/ La Bodega, 7. 24209 Pajares de los Oteros, LEÓN, España.», «Avenida Palanquinos 20, Valencia de
 * Don Juan, León», «C/ La Iglesia, s/n. Ardoncino. 24392, LEÓN» → calle, CP, municipio y provincia.
 */
export function partirDireccion(texto: string | null): {
  direccion: string | null; cp: string | null; municipio: string | null; provincia: string | null;
} {
  if (!texto) return { direccion: null, cp: null, municipio: null, provincia: null };
  let s = texto.replace(/[\s,.;]*espa[ñn]a[\s,.;]*$/i, "");
  const prov = PROVINCIA_FINAL.exec(s);
  const provincia = prov ? (/valladolid/i.test(prov[1]!) ? "Valladolid" : "León") : null;
  if (prov) s = s.slice(0, prov.index);
  s = s.replace(/[\s,.;–-]+$/, "");
  // «Ctra. Leon», «Avda. Coyanza»: el punto de una abreviatura no parte.
  s = s.replace(/\b(ctra|crta|avda|av|pza|pl|km|c)\.\s*/gi, "$1\u0001");
  const partir = (x: string) => x.split(/\s*[,;]\s*|\.\s+|\s+[–-]\s+/).map((p) => limpiarEspacios(p.replace(/[.,;]+$/, ""))).filter(Boolean);
  const cp = /\b(\d{5})\b/.exec(s);
  if (cp) {
    const antes = partir(s.slice(0, cp.index));
    const despues = partir(s.slice(cp.index + 5));
    // Tras el CP va el municipio («24326 Joara, Sahagún» → el último); si el CP cierra, va antes.
    const municipio = despues.length ? despues.at(-1)! : antes.length > 1 ? antes.pop()! : null;
    return { direccion: t(antes.join(", ").replace(/\u0001/g, ". ")), cp: cp[1]!, municipio: municipio && !/\d/.test(municipio) ? municipio : null, provincia };
  }
  const partes = partir(s);
  const junta = (ps: string[]) => t(ps.join(", ").replace(/\u0001/g, ". "));
  if (partes.length < 2 || /\d/.test(partes.at(-1)!)) return { direccion: junta(partes), cp: null, municipio: null, provincia };
  return { direccion: junta(partes.slice(0, -1)), cp: null, municipio: partes.at(-1)!, provincia };
}

/** «PRICUM, VALDEMUZ y PARAJE DEL SANTO.» → marcas. */
export function partirMarcas(texto: string | null): string[] {
  if (!texto) return [];
  return [...new Set(texto.split(/\s*,\s*|\s+y\s+/i).map((x) => t(x.replace(/[.;]+$/, ""))).filter((x): x is string => !!x && x.length > 1))];
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("a.post-title h1, h1").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  const campos = new Map<string, { texto: string; hrefs: string[] }>();
  let lista: ReturnType<typeof $> | null = null;
  $("li").each((_, li) => {
    const etiqueta = claveTexto($(li).children("strong").first().text());
    if (!etiqueta || campos.has(etiqueta)) return;
    if (etiqueta === "direccion") lista = $(li).closest("ul");
    campos.set(etiqueta, {
      texto: limpiarEspacios($(li).text().replace(/^[^:]*:/, "")),
      hrefs: $(li).find("a[href]").map((_, a) => $(a).attr("href")!.trim()).get(),
    });
  });
  const campo = (...ks: string[]) => ks.map((k) => campos.get(k)).find(Boolean);

  const dir = partirDireccion(t(campo("direccion")?.texto));
  const email = /[^\s@/|]+@[^\s@/|]+\.[a-z]{2,}/i.exec(campo("correo electronico", "email")?.texto ?? "")?.[0].toLowerCase() ?? null;
  // Algún «Teléfono/s» va en un <li> mal cerrado: entonces vale el enlace tel: de la misma lista.
  const textoTel = campo("telefono s", "telefono", "telefonos")?.texto ?? (lista as ReturnType<typeof $> | null)?.find("a[href^='tel:']").first().text() ?? "";
  const telefono = /(?:\+34\s?)?[6789]\d{1,2}(?:[\s.]?\d{2,3}){2,3}/.exec(textoTel)?.[0].trim() ?? null;
  // «https://pincernashop.com/ | www.pincernawines.com»: la tienda no es la web.
  const webs = (campo("web", "sitio web")?.texto ?? "")
    .split(/\s*\|\s*|\s+/)
    .map((w) => /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?$/i.exec(w)?.[0])
    .filter((w): w is string => !!w);
  const elegida = webs.find((w) => !/shop|tienda/i.test(w)) ?? webs[0] ?? null;
  const web = elegida ? (/^https?:\/\//i.test(elegida) ? elegida : `http://${elegida}`) : null;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: dir.direccion,
    codigo_postal: dir.cp,
    municipio: dir.municipio,
    provincia_texto: dir.provincia,
    ubicacion: null,
    web: web && !web.includes("doleon.es") ? web : null,
    telefono,
    email,
    marcas: partirMarcas(t(campo("referencias")?.texto)),
    enoturismo: null,
    extra: {},
  };
}

export const consejoLeon: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "leon", nombre: "León" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas-belote/`],
  // Sin CP: municipios de la D.O. por provincia (la mayoría, León).
  provinciaPorMunicipio: {
    "valencia de don juan": "León",
    benazolve: "León",
    valdevimbre: "León",
    "corbillos de los oteros": "León",
    "melgar de abajo": "Valladolid",
    mayorga: "Valladolid",
  },
  // Pedanías que la ficha da como municipio → su ayuntamiento.
  aliasMunicipio: { armunia: "León", ardoncino: "Chozas de Abajo", joara: "Sahagún", benazolve: "Santas Martas" },
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
