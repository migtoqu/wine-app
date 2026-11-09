// C.R.D.O. Toro (www.dotoro.com, WordPress + Elementor): listado único → fichas /bodegas/<slug>/.
// La ficha es una secuencia de encabezados «ETIQUETA:» seguidos de sus valores.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-toro";
export const BASE = "https://www.dotoro.com";
export const URL_LISTADO = `${BASE}/bodegas-y-marcas/`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

/**
 * Municipios de la D.O.: Zamora, salvo tres de Valladolid. La tabla manda sobre el «(Zamora)» de la
 * ficha cuando no hay código postal (Villafranca de Duero viene marcada como Zamora).
 */
export const PROVINCIA_POR_MUNICIPIO: Record<string, string> = Object.fromEntries([
  ...["San Román de Hornija", "Villafranca de Duero", "Pedrosa del Rey"].map((m) => [claveTexto(m), "Valladolid"]),
  ...[
    "Toro", "Morales de Toro", "El Pego", "Valdefinjas", "Venialbo", "Sanzoles", "Argujillo", "El Piñero",
    "Villabuena del Puente", "Fuentesecas", "Peleagonzalo", "Villalazán", "Matilla la Seca", "La Bóveda de Toro",
    "Bustillo del Oro", "Pinilla de Toro", "San Miguel de la Ribera", "Villardondiego", "Fresno de la Ribera",
  ].map((m) => [claveTexto(m), "Zamora"]),
]);

/** «Pedrosa del Rey: Pago de Villaester de Arriba» → «Pedrosa del Rey»; «Toro, Toro» → «Toro». */
export function limpiarMunicipio(texto: string | null): string | null {
  if (!texto) return null;
  const partes = texto.split(":")[0]!.split(",").map((p) => limpiarEspacios(p)).filter(Boolean);
  return partes[0] ?? null;
}

/** Slug de una URL de ficha (/bodegas/<slug>/) o null. */
export function slugDe(url: string): string | null {
  const m = /^\/bodegas\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(url, BASE).pathname);
  return m ? m[1]! : null;
}

export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const vistos = new Set<string>();
  const out: EntradaListado[] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href")!;
    const slug = slugDe(href);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({ url: `${BASE}/bodegas/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  });
  return out;
}

/** «Numanthia, Termes y Termanthia» → tres marcas. */
export function partirMarcas(texto: string | null): string[] {
  if (!texto) return [];
  return texto
    .split(/\s*(?:,|;|\/|\s+y\s+|\s+e\s+)\s*/i)
    .map((m) => limpiarEspacios(m))
    .filter((m) => m !== "" && m !== "-");
}

interface Valor {
  texto: string;
  href: string | null;
}

/** Encabezados en orden: «ETIQUETA:» → valores hasta la siguiente etiqueta (gana la primera aparición). */
function bloques($: cheerio.CheerioAPI): Map<string, Valor[]> {
  const out = new Map<string, Valor[]>();
  let actual: Valor[] | null = null;
  $("#content .elementor-heading-title, #content a.elementor-button").each((_, el) => {
    const texto = t($(el).text());
    if (!texto) return;
    if (/:$/.test(texto) && texto === texto.toUpperCase()) {
      const etiqueta = texto.replace(/:$/, "");
      actual = out.has(etiqueta) ? null : [];
      if (actual) out.set(etiqueta, actual);
      return;
    }
    const href = $(el).is("a") ? $(el).attr("href")! : ($(el).find("a").first().attr("href") ?? null);
    actual?.push({ texto, href });
  });
  return out;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("#content h1").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const b = bloques($);
  const valor = (k: string) => b.get(k)?.[0]?.texto ?? null;

  let direccion: string | null = null;
  let cp: string | null = null;
  let municipio: string | null = null;
  let provincia: string | null = null;
  for (const v of b.get("DIRECCIÓN") ?? []) {
    if (/^\d{5}$/.test(v.texto)) cp = v.texto;
    else if (/^\(.*\)$/.test(v.texto)) provincia = v.texto.slice(1, -1);
    else if (v.href?.includes("/project-category/")) municipio = v.texto;
    else if (!direccion) direccion = v.texto;
  }
  // Respaldo: la etiqueta de municipio de la cabecera.
  municipio ??= t($("#content a[href*='/project-category/']").first().text());
  municipio = limpiarMunicipio(municipio);

  // «Visitar web»: el botón externo de la ficha (los del propio consejo no cuentan).
  const web =
    $("#content a.elementor-button[href^='http']")
      .filter((_, a) => !/dotoro\.(com|es)/i.test($(a).attr("href")!))
      .first()
      .attr("href") ?? null;
  const email = (b.get("CORREO ELECTRÓNICO") ?? []).map((v) => v.href?.replace(/^mailto:/i, "") ?? v.texto)[0] ?? null;
  const inscripcion = valor("INSCRIPCIÓN");

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion,
    codigo_postal: cp,
    municipio,
    provincia_texto: provincia,
    ubicacion: null,
    web,
    telefono: valor("TELÉFONO"),
    email,
    marcas: partirMarcas(valor("MARCAS")),
    enoturismo: null,
    extra: /^(19|20)\d\d$/.test(inscripcion ?? "") ? { anio_inscripcion: Number(inscripcion) } : {},
  };
}

export const consejoToro: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "toro", nombre: "Toro" },
  urlsRobots: [URL_LISTADO, `${BASE}/bodegas/bodegas-numanthia/`],
  provinciaPorMunicipio: PROVINCIA_POR_MUNICIPIO,
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
