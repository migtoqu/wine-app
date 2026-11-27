// C.R.D.O. Ribeiro (ribeiro.wine, WordPress): /es/bodegas-y-colleiteiros lista las bodegas y,
// aparte, los colleiteiros (cosecheros < 60.000 l/año con uva propia) → una ficha por bodega con
// un bloque «CONTACTO» de líneas «Etiqueta: valor». La descripción no se lee nunca, y tampoco la
// razón social ni la persona de contacto (en los colleiteiros son nombres de particulares).
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { puntoEnEspana, type Punto } from "../../lib/geo.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-ribeiro";
export const BASE = "https://www.ribeiro.wine";
export const URL_LISTADO = `${BASE}/es/bodegas-y-colleiteiros`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export function slugDe(href: string): string | null {
  const m = /^\/es\/bodegas-y-colleiteiros\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(href, BASE).pathname);
  return m ? m[1]! : null;
}

/** Fichas del listado con su sección («Bodegas» o «Colleiteiros»). */
export function parsearListado(html: string): EntradaListado[] {
  const $ = cheerio.load(html);
  const out: EntradaListado[] = [];
  const vistos = new Set<string>();
  let seccion: string | null = null;
  $("h2, a[href]").each((_, el) => {
    if ($(el).is("h2")) {
      const s = claveTexto(t($(el).text()) ?? "");
      seccion = s === "bodegas" ? "bodega" : s === "colleiteiros" ? "colleiteiro" : null;
      return;
    }
    if (!seccion) return;
    const slug = slugDe($(el).attr("href")!);
    const nombre = t($(el).text());
    if (!slug || !nombre || vistos.has(slug)) return;
    vistos.add(slug);
    out.push({
      url: `${URL_LISTADO}/${slug}`,
      datos: { id_externo: `slug:${slug}`, nombre, extra: { registro: seccion } },
    });
  });
  return out;
}

/** Líneas «Etiqueta: valor» del bloque de contacto, por etiqueta normalizada. */
export function lineasContacto($: cheerio.CheerioAPI): Map<string, { texto: string; href: string | null }> {
  const out = new Map<string, { texto: string; href: string | null }>();
  const bloque = $("h3")
    .filter((_, h) => claveTexto($(h).text()) === "contacto")
    .first()
    .parent();
  // Unas fichas envuelven las líneas en <p> y otras no; alguna olvida el <br/> y solo salta de línea.
  const copia = bloque.clone();
  copia.find("h3, hr, a:not([href^='mailto:']):has(i), p:has(> a > i)").remove();
  const html = copia.html() ?? "";
  for (const trozo of html.split(/<br\s*\/?>|<\/?p[^>]*>|\n/i)) {
    const $t = cheerio.load(`<div>${trozo}</div>`);
    const texto = t($t("div").text());
    const m = texto && /^([^:]{2,30}):\s*(.*)$/.exec(texto);
    if (!m) continue;
    const etiqueta = claveTexto(m[1]!);
    if (!out.has(etiqueta)) out.set(etiqueta, { texto: m[2]!.trim(), href: $t("a[href]").first().attr("href") ?? null });
  }
  return out;
}

/** «32429 Leiro» → CP y municipio; «Cenlle» → solo municipio. */
export function partirAyuntamiento(texto: string | null): { cp: string | null; municipio: string | null } {
  const m = /^(?:(\d{5})\s*)?(.*)$/.exec(limpiarEspacios(texto ?? ""));
  return { cp: m?.[1] ?? null, municipio: t(m?.[2]?.replace(/^[^\p{L}]+/u, "")) };
}

/** Parroquias o lugares que alguna ficha da como ayuntamiento (clave: `claveTexto`). */
export const ALIAS_MUNICIPIO: Record<string, string> = { gomariz: "Leiro" };

/** Coordenadas del botón «LOCALIZACIÓN» (google.com/maps/place/lat,lng). */
export function ubicacionDe($: cheerio.CheerioAPI): Punto | null {
  for (const a of $("a[href*='google.com/maps/place/']").toArray()) {
    const m = /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec($(a).attr("href")!);
    if (!m) continue;
    const p = { lat: Number(m[1]), lng: Number(m[2]) };
    if (puntoEnEspana(p)) return p;
  }
  return null;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = entrada.datos.nombre ?? t($("h1.title").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);
  const l = lineasContacto($);
  const valor = (...claves: string[]) => {
    for (const c of claves) {
      const v = t(l.get(c)?.texto);
      if (v) return v;
    }
    return null;
  };
  const sede = partirAyuntamiento(valor("ayuntamiento", "concello"));
  // «Localización instalaciones: Esposende 5, Cenlle»: la bodega está ahí; el ayuntamiento es la sede.
  const instalaciones = valor("localizacion instalaciones");
  // Solo vale como municipio si el último trozo es un nombre («A Ponte, 21» no lo trae).
  const ultimo = instalaciones?.includes(",") ? t(instalaciones.split(",").pop()) : null;
  const municipioInstalaciones = ultimo && !/\d/.test(ultimo) ? ultimo : null;
  const otroMunicipio =
    !!municipioInstalaciones && claveTexto(municipioInstalaciones) !== claveTexto(sede.municipio ?? "");
  const usarSede = !otroMunicipio;
  const cp = usarSede ? sede.cp : null;
  const municipio = otroMunicipio ? municipioInstalaciones : sede.municipio;
  const emailTexto = valor("e mail", "email", "correo electronico");
  const email = emailTexto && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(emailTexto) ? emailTexto.toLowerCase() : null;
  const hrefWeb = l.get("web")?.href ?? null;
  const webTexto = valor("web");
  const web = hrefWeb && /^https?:\/\//i.test(hrefWeb) ? hrefWeb : webTexto && /\./.test(webTexto) ? `http://${webTexto.replace(/^\/+/, "")}` : null;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: instalaciones ?? valor("direccion", "enderezo"),
    codigo_postal: cp,
    municipio,
    provincia_texto: null,
    ubicacion: ubicacionDe($),
    web,
    telefono: valor("telefono"),
    email,
    marcas: [],
    enoturismo: null,
    extra: { ...(entrada.datos.extra ?? {}) },
  };
}

export const consejoRibeiro: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "ribeiro", nombre: "Ribeiro" },
  urlsRobots: [URL_LISTADO, `${URL_LISTADO}/a-vilerma`],
  // Toda la D.O. está en Ourense; algunas fichas no traen CP.
  provinciaUnica: "Ourense",
  aliasMunicipio: ALIAS_MUNICIPIO,
  async listar(ctx: Contexto) {
    return parsearListado((await ctx.http.get(URL_LISTADO)).texto);
  },
  parsearFicha,
};
