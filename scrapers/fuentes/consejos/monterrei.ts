// C.R.D.O. Monterrei (domonterrei.wine, WordPress + BeTheme): /bodegas/ enlaza las fichas
// /bodegas/<slug>/. Cada ficha trae «Datos de Interés» con párrafos etiquetados («Dirección:»,
// «Tlf:», «Email:», «Web:») y «Variedades de uva» / «Marcas comerciales» seguidos de su lista.
// No se leen la persona de contacto, la descripción ni las notas de cata.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-monterrei";
export const BASE = "https://www.domonterrei.wine";
export const URL_LISTADO = `${BASE}/bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const m = /^\/bodegas\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $("a[href*='/bodegas/']").each((_, a) => {
    const slug = slugDe($(a).attr("href")!);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({ url: `${BASE}/bodegas/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  });
  return out;
}

/**
 * «C/ Ladairo, 36, 32618, O Rosal, Oímbra, (Ourense)» → calle, CP y municipio (la última parte; la
 * aldea va con la calle). «Villamayor del Valle - Verín» → Verín.
 */
export function partirDireccion(texto: string | null): { direccion: string | null; cp: string | null; municipio: string | null } {
  if (!texto) return { direccion: null, cp: null, municipio: null };
  const sinProv = texto.replace(/[,\s]*\(?\s*ourense\s*\)?\s*$/i, "");
  const partes = sinProv.split(",").map((x) => limpiarEspacios(x)).filter(Boolean);
  let cp: string | null = null;
  const resto: string[] = [];
  for (const p of partes) {
    const m = /^(\d{5})\b\s*(.*)$/.exec(p);
    if (m && !cp) {
      cp = m[1]!;
      if (m[2]) resto.push(m[2]);
    } else resto.push(p);
  }
  // Sin CP («Mourazos, Verín») el municipio sigue siendo la última parte si hay más de una.
  if (resto.length < 2) return { direccion: t(resto.join(", ")), cp, municipio: null };
  const ultimo = resto.at(-1)!;
  const municipio = t(ultimo.split(/\s+-\s+/).at(-1));
  return { direccion: t(resto.slice(0, -1).join(", ")), cp, municipio: municipio && !/\d/.test(municipio) ? municipio : null };
}

/** «A, B y C (Godello, Mencía)» → marcas; las comas dentro de paréntesis no parten. */
export function partirMarcas(texto: string | null): string[] {
  if (!texto) return [];
  const sinParentesis = texto.replace(/\([^)]*\)/g, "");
  return [...new Set(sinParentesis.split(/\s*,\s*|\s+y\s+/).map((x) => t(x.replace(/[.;]+$/, ""))).filter((x): x is string => !!x && x.length > 1))];
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("#Subheader h1, h1").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  const etiquetas = new Map<string, { texto: string; nodo: ReturnType<typeof $> }>();
  const ps = $("p").toArray();
  ps.forEach((p, i) => {
    const texto = t($(p).text()) ?? "";
    const m = /^(Direcci[oó]n|Tl[fé]|Tel[eé]fono|Email|E-mail|Web|Variedades de uva|Marcas comerciales)\s*:?\s*(.*)$/i.exec(texto);
    if (!m) return;
    const clave = m[1]!.toLowerCase().replace(/^tl.*|^tel.*/, "tlf").replace(/^e-?mail/, "email").replace(/^direcci.*/, "direccion");
    if (etiquetas.has(clave)) return;
    // Las listas («Marcas comerciales») van en el párrafo siguiente.
    const siguiente = t($(ps[i + 1]).text()) ?? "";
    // Si el párrafo siguiente es otra etiqueta («Nombre de la bodega: …»), la lista está vacía.
    const valor = m[2] || (/^(variedades|marcas)/i.test(clave) && !/^[^:]{2,40}:/.test(siguiente) ? siguiente : "");
    etiquetas.set(clave, { texto: valor, nodo: $(p) });
  });
  const valor = (k: string) => t(etiquetas.get(k)?.texto);

  const dir = partirDireccion(valor("direccion"));
  const email = /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i.exec(valor("email") ?? "")?.[0].toLowerCase() ?? null;
  const telefono = t(valor("tlf")?.split(/\s*\/\s*/)[0]?.replace(/\s+con\s+whatsapp.*$/i, ""));
  const hrefWeb = etiquetas.get("web")?.nodo.find("a[href^='http']").attr("href")?.trim() ?? null;
  const webTexto = /(?:https?:\/\/)?(?:www\.)?[a-z0-9ñ-]+(?:\.[a-z0-9ñ-]+)*\.[a-z]{2,}\S*/i.exec(valor("web") ?? "")?.[0] ?? null;
  const web = hrefWeb ?? (webTexto ? (/^https?:\/\//i.test(webTexto) ? webTexto : `http://${webTexto}`) : null);

  const extra: Record<string, unknown> = {};
  const variedades = partirMarcas(valor("variedades de uva"));
  if (variedades.length) extra.variedades = variedades;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: dir.direccion,
    codigo_postal: dir.cp,
    municipio: dir.municipio,
    provincia_texto: "Ourense",
    ubicacion: null,
    web: web && !web.includes("domonterrei") ? web : null,
    telefono,
    email,
    marcas: partirMarcas(valor("marcas comerciales")),
    enoturismo: null,
    extra,
  };
}

export const consejoMonterrei: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "monterrei", nombre: "Monterrei" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas/abeledos/`],
  provinciaUnica: "Ourense",
  // Aldeas que la ficha da como último dato de la dirección → su concello.
  aliasMunicipio: { pazos: "Verín", queizas: "Verín", albarellos: "Monterrei", villaza: "Monterrei", "o rosal": "Oímbra" },
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
