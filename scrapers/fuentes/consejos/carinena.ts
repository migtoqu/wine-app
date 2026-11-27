// C.R.D.O.P. Cariñena (carinenawines.com, la web actual del consejo; docarinena.com se perdió): /bodegas/
// enlaza las fichas /bodegas/<slug>/. Cada ficha trae el municipio (subtítulo de la cabecera), un bloque
// `.direcciones` con dirección, teléfono y email, y, si es visitable, «Enoturismo» con el botón a la web
// de la bodega. La descripción, el texto de enoturismo y las fotos no se leen.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-carinena";
export const BASE = "https://carinenawines.com";
export const URL_LISTADO = `${BASE}/bodegas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const u = new URL(href, BASE);
  if (u.hostname !== "carinenawines.com") return null;
  const m = /^\/bodegas\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(u.pathname);
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

/** «Ctra. Valencia km 45,700 Cariñena 50400 (Zaragoza)», «C. San Valero, 1, 50400 Cariñena, Zaragoza» → calle y CP. */
export function partirDireccion(texto: string | null, municipio: string | null): { direccion: string | null; cp: string | null } {
  if (!texto) return { direccion: null, cp: null };
  const cp = /\b(\d{5})\b/.exec(texto);
  let calle = cp ? texto.slice(0, cp.index) : texto.replace(/\(?zaragoza\)?.*$/i, "");
  if (municipio) calle = calle.replace(new RegExp(`[\\s,.–-]*${municipio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s,.–-]*$`, "i"), "");
  return { direccion: t(calle.replace(/[\s,.;–-]+$/, "")), cp: cp ? cp[1]! : null };
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("h1.h1-cabecera, h1").first().text()) ?? entrada.datos.nombre;
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const municipio = t($(".subtitulo-zona").first().text());

  const dato = (clase: string) => $(".direcciones .datosbodega").filter((_, d) => $(d).find(`i.${clase}`).length > 0).first();
  const dir = partirDireccion(t(dato("direccion").text()), municipio);
  const telefono = t(dato("telefono").text());
  const email = (dato("email").find("a[href^='mailto:']").attr("href")?.slice(7) ?? t(dato("email").text()))?.trim().toLowerCase() ?? null;
  const visitable = $(".enoturismo").length > 0;
  const web = $("a.enoturismo-boton[href^='http']").attr("href")?.trim() ?? null;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: dir.direccion,
    codigo_postal: dir.cp,
    municipio,
    provincia_texto: "Zaragoza",
    ubicacion: null,
    web: web && !web.includes("carinenawines") ? web : null,
    telefono,
    email: email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) ? email : null,
    marcas: [],
    // La ficha solo dice algo cuando la bodega es visitable; su ausencia no es un «no».
    enoturismo: visitable ? true : null,
    extra: {},
  };
}

export const consejoCarinena: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "carinena", nombre: "Cariñena" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas/care/`],
  provinciaUnica: "Zaragoza",
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
