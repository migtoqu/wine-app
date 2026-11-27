// C.R.D.O. Arlanza (arlanza.org, WordPress + tema Eltd): /bodegas-y-productores/ enlaza las fichas
// /bodegas-productores/<slug>/ con el texto «Razón social (Municipio)». Cada ficha trae campos con
// título h5 («CONTACTO:», «UBICACIÓN:», «TELÉFONO:», «PAGINA WEB:»). El municipio sale del listado: la
// «ubicación» es a veces la sede social en otra ciudad (va a `extra.direccion_contacto`). No se leen las
// notas de cata, los horarios ni los nombres de personas de «CONTACTO» (solo email y teléfono).
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { capitalizarSiMayusculas, claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import { municipioDe } from "./comun/normalizar.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-arlanza";
export const BASE = "https://arlanza.org";
export const URL_LISTADO = `${BASE}/bodegas-y-productores/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const m = /^\/bodegas-productores\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

/** «Monte Amán S.L. (Castrillo de Solarana)» → municipio; «Quintanilla - Tordueles» → «Quintanilla-Tordueles». */
export function municipioDeListado(texto: string): string | null {
  const m = /\(([^()]+)\)\s*$/.exec(texto);
  return m ? t(m[1]!.replace(/\s*-\s*/g, "-")) : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $("a[href*='/bodegas-productores/']").each((_, a) => {
    const slug = slugDe($(a).attr("href")!);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    const texto = limpiarEspacios($(a).text());
    out.push({
      url: `${BASE}/bodegas-productores/${slug}/`,
      datos: { id_externo: `slug:${slug}`, municipio: municipioDeListado(texto), nombre: t(texto.replace(/\s*\([^()]*\)\s*$/, "")) ?? undefined },
    });
  });
  return out;
}

/** Clave sin artículos ni preposiciones: «Castrillo Solarana» = «Castrillo de Solarana». */
const claveSuelta = (s: string) => claveTexto(s).replace(/\b(?:de|del|la|las|el|los|y)\b/g, " ").replace(/\s+/g, " ").trim();

const PROVINCIAS = /\b(burgos|palencia|valladolid)\b/i;

/**
 * «Calle Real, nº 7 09343 Villahoz, Burgos», «C/Fuente lugar 25, Quintanilla del Agua 09347, Burgos»
 * → calle sin municipio, CP y provincia, y si el texto nombra el municipio dado.
 */
export function partirUbicacion(texto: string | null, municipio: string | null, nombres: string[] = municipio ? [municipio] : []): {
  direccion: string | null; cp: string | null; provincia: string | null; nombraMunicipio: boolean;
} {
  if (!texto) return { direccion: null, cp: null, provincia: null, nombraMunicipio: false };
  const cp = /\b(\d{5})\b/.exec(texto)?.[1] ?? null;
  const provincia = PROVINCIAS.exec(texto.replace(/^.*\b\d{5}\b/, "") || texto)?.[1] ?? null;
  const clave = municipio ? claveSuelta(municipio) : null;
  const nombraMunicipio = !!clave && claveSuelta(texto).includes(clave);
  // La calle es lo que va antes del CP o del municipio, lo primero que aparezca.
  let corte = texto.length;
  if (cp) corte = Math.min(corte, texto.indexOf(cp));
  for (const nom of nombres) {
    const i = texto.toLowerCase().lastIndexOf(nom.toLowerCase());
    if (i > 0) corte = Math.min(corte, i);
  }
  const calle = t(texto.slice(0, corte).replace(/[\s,.;-]+$/, "").replace(/,?\s*espa[ñn]a\s*$/i, ""));
  return { direccion: calle && !PROVINCIAS.test(calle) ? calle : null, cp, provincia: provincia ? capitalizarSiMayusculas(provincia.toUpperCase()) : null, nombraMunicipio };
}

/** Primer teléfono de un texto («Móvil: 609 4153 52», «(+34) 947 570 859 (+34) 676…»). */
export function primerTelefono(texto: string | null): string | null {
  const m = /(?:\(?\+34\)?\s?)?[6789]\d{2}(?:[\s.]?\d{2,4}){2,3}/.exec(texto ?? "");
  return m ? m[0].trim() : null;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const titulo = t($("h1.entry-title").first().text()) ?? entrada.datos.nombre;
  if (!titulo) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const nombre = capitalizarSiMayusculas(titulo.replace(/\s*\([^()]*\)\s*$/, ""));

  const campos = new Map<string, { texto: string | null; hrefs: string[] }>();
  $(".eltdf-portfolio-info-item").each((_, it) => {
    const clave = claveTexto($(it).find(".eltdf-portfolio-info-title").first().text());
    if (!clave || campos.has(clave)) return;
    campos.set(clave, {
      texto: t($(it).find("p, a").first().closest("p").text() || $(it).text().replace($(it).find("h5").text(), "")),
      hrefs: $(it).find("a[href]").map((_, a) => $(a).attr("href")!.trim()).get(),
    });
  });
  const campo = (...ks: string[]) => ks.map((k) => campos.get(k)).find(Boolean);

  const contacto = campo("contacto");
  const email = [...(contacto?.hrefs ?? []).filter((h) => /^mailto:/i.test(h)).map((h) => decodeURIComponent(h.slice(7)).trim()), contacto?.texto ?? ""]
    .map((x) => /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i.exec(x)?.[0].toLowerCase())
    .find(Boolean) ?? null;
  const telefono = primerTelefono(campo("telefono")?.texto ?? null) ?? primerTelefono(contacto?.texto ?? null);
  const webCampo = campo("pagina web", "web");
  const hrefWeb = webCampo?.hrefs.find((h) => /^https?:\/\//i.test(h)) ?? null;
  const webTexto = /(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\S*/i.exec(webCampo?.texto ?? "")?.[0] ?? null;
  const web = hrefWeb ?? (webTexto ? `http://${webTexto}` : null);

  const municipio = municipioDe(entrada.datos.municipio ?? null, ALIAS_MUNICIPIO);
  const ubicacion = campo("ubicacion")?.texto ?? null;
  const u = partirUbicacion(ubicacion, municipio, [municipio, entrada.datos.municipio].filter((x): x is string => !!x));
  const extra: Record<string, unknown> = {};
  // Con CP pero sin nombrar el municipio de la bodega: es la sede social (Palencia, Burgos capital…).
  const esSede = !!ubicacion && !!municipio && !u.nombraMunicipio && !!u.cp;
  if (esSede) extra.direccion_contacto = ubicacion;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: esSede ? null : u.direccion,
    codigo_postal: esSede ? null : u.cp,
    municipio,
    provincia_texto: esSede ? null : u.provincia,
    ubicacion: null,
    web: web && !web.includes("arlanza.org") ? web : null,
    telefono,
    email,
    marcas: [],
    enoturismo: null,
    extra,
  };
}

const ALIAS_MUNICIPIO: Record<string, string> = {
  "herreras valdecanas": "Herrera de Valdecañas",
  "castrillo solarana": "Castrillo de Solarana",
  "quintanilla tordueles": "Quintanilla del Agua y Tordueles",
  "santa ines": "Santa Inés",
};

export const consejoArlanza: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "arlanza", nombre: "Arlanza" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas-productores/bodegas-sierra/`],
  // La D.O. está entre Burgos y Palencia: provincia por municipio cuando no hay CP.
  provinciaPorMunicipio: {
    "covarrubias": "Burgos",
    "villalmanzo": "Burgos",
    "castrillo de solarana": "Burgos",
    "mahamud": "Burgos",
    "lerma": "Burgos",
    "ruyales del agua": "Burgos",
    "avellanosa de muno": "Burgos",
    "quintanilla del agua y tordueles": "Burgos",
    "santo domingo de silos": "Burgos",
    "cilleruelo de abajo": "Burgos",
    "villahoz": "Burgos",
    "santa ines": "Burgos",
    "quintanilla del agua": "Burgos",
    "torquemada": "Palencia",
    "palenzuela": "Palencia",
    "herrera de valdecanas": "Palencia",
  },
  aliasMunicipio: ALIAS_MUNICIPIO,
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
