// C.R. D.O. Binissalem (binissalemdo.com, WordPress + Elementor): /es/bodegas-do-binissalem/ agrupa las
// bodegas por municipio (encabezados h2) con su nombre (h3) y un botón «Ver más» a la ficha. Cada ficha
// trae «Contacto bodega» con la dirección (enlace al mapa), teléfonos, email y web. La descripción, el
// enoturismo y las fotos no se leen. Toda la D.O. está en Mallorca (Illes Balears).
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-binissalem";
export const BASE = "https://binissalemdo.com";
export const URL_LISTADO = `${BASE}/es/bodegas-do-binissalem/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const u = new URL(href, BASE);
  if (u.hostname !== "binissalemdo.com") return null;
  const m = /^\/(?:es\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(u.pathname);
  return m ? m[1]! : null;
}

/** Nombre (h3) y municipio (último h2 anterior) de cada botón «Ver más». */
export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  let municipio: string | null = null;
  let nombre: string | null = null;
  $("h2.elementor-heading-title, h3.elementor-heading-title, a.elementor-button-link").each((_, el) => {
    if ($(el).is("h2")) {
      municipio = t($(el).text());
      nombre = null;
    } else if ($(el).is("h3")) nombre = t($(el).text());
    else if (nombre && municipio) {
      const href = $(el).attr("href") ?? "";
      const slug = slugDe(href);
      if (!slug || vistos.has(slug)) return;
      vistos.add(slug);
      out.push({ url: new URL(href, BASE).href, datos: { id_externo: `slug:${slug}`, nombre, municipio } });
      nombre = null;
    }
  });
  return out;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = entrada.datos.nombre ?? t($("h1").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  const titulo = $("h2.elementor-heading-title").filter((_, h) => /^contacto bodegas?$/i.test(limpiarEspacios($(h).text()))).first();
  const bloque = titulo.closest(".elementor-widget-wrap").find(".elementor-widget-text-editor").first();

  // La dirección es el enlace al mapa: «Plaça Nova, 23, 07320 <br> Santa Maria del Camí, Illes Balears».
  const mapa = bloque.find("a[href*='goo.gl/maps'], a[href*='google.'][href*='maps']").first().clone();
  mapa.find("br").replaceWith("\n");
  // Un apartado de correos no es una calle: fuera la línea entera.
  const lineas = mapa.text().split("\n").filter((l) => !/^\s*ap(?:artat|artado|\.)?\s+de\s+corre/i.test(l))
    .flatMap((l) => l.split(/,\s+/)).map(limpiarEspacios).filter(Boolean);
  let cp: string | null = null;
  const calle: string[] = [];
  for (const l of lineas) {
    const m = /^(?:(.*?)\s+)?(\d{5})\b/.exec(l);
    if (m && !cp) {
      cp = m[2]!;
      if (m[1]) calle.push(m[1]);
      continue;
    }
    // Lo que va tras el CP es el municipio y la comunidad.
    if (!cp) calle.push(l);
  }

  const hrefs = bloque.find("a[href]").map((_, a) => $(a).attr("href")!.trim()).get();
  const telefono = t(bloque.find("a[href^='tel:']").first().text());
  const email = hrefs.find((h) => /^mailto:/i.test(h))?.slice(7).trim().toLowerCase() ?? null;
  const web = hrefs.find((h) => /^https?:\/\//i.test(h) && !/goo\.gl|google\.|binissalemdo/i.test(h)) ?? null;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: t(calle.join(", ")),
    codigo_postal: cp,
    municipio: entrada.datos.municipio ?? null,
    provincia_texto: "Illes Balears",
    ubicacion: null,
    web,
    telefono,
    email: email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) ? email : null,
    marcas: [],
    enoturismo: null,
    extra: {},
  };
}

export const consejoBinissalem: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "binissalem", nombre: "Binissalem" },
  urlsRobots: [URL_LISTADO, `${BASE}/es/vins-nadal/`],
  provinciaUnica: "Illes Balears",
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
