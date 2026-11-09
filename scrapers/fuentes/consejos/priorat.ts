// C.R. DOQ Priorat (www.doqpriorat.org, WordPress + Avada, en catalán): /cellers/ paginado
// (/cellers/page/N) → fichas /cellers/<slug>/ con «Informació del celler» y «Visites».
// Los textos se dejan como están (no se traducen); solo se normalizan municipios con alias.
// La «Descripció» y los nombres de personas (responsable, enòlegs) no se guardan.
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-priorat";
export const BASE = "https://www.doqpriorat.org";
export const URL_LISTADO = `${BASE}/cellers/`;

// Hoy son 10 páginas; muchas más indicarían un cambio en la web.
const MAX_PAGINAS = 40;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

export const urlPagina = (n: number) => (n <= 1 ? URL_LISTADO : `${URL_LISTADO}page/${n}`);

export function slugDe(url: string): string | null {
  const m = /^\/cellers\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(url, BASE).pathname);
  return m && m[1] !== "page" ? m[1]! : null;
}

/** Municipios de la DOQ con su nombre oficial (catalán); alias para grafías abreviadas o castellanas. */
export const ALIAS_MUNICIPIO: Record<string, string> = Object.fromEntries(
  [
    ["Bellmunt", "Bellmunt del Priorat"], ["Torroja", "Torroja del Priorat"], ["Torroja del Priorato", "Torroja del Priorat"],
    ["Morera de Montsant", "La Morera de Montsant"], ["La Morera", "La Morera de Montsant"],
    ["Vilella Alta", "La Vilella Alta"], ["Vilella Baixa", "La Vilella Baixa"], ["Lloar", "El Lloar"],
    ["Scala Dei", "Escaladei"], ["Escala Dei", "Escaladei"], ["Gratallops (Priorat)", "Gratallops"],
  ].map(([a, b]) => [claveTexto(a!), b!]),
);

/** Todos los municipios de la DOQ (y los vecinos donde algunas bodegas tienen la sede) están en Tarragona. */
export const PROVINCIA_POR_MUNICIPIO: Record<string, string> = Object.fromEntries(
  [
    "Bellmunt del Priorat", "Gratallops", "El Lloar", "La Morera de Montsant", "Escaladei", "Poboleda", "Porrera",
    "Torroja del Priorat", "La Vilella Alta", "La Vilella Baixa", "El Molar", "Falset", "Cornudella de Montsant",
  ].map((m) => [claveTexto(m), "Tarragona"]),
);

export interface PaginaListado {
  entradas: EntradaListado[];
  ultimaPagina: number;
}

export function parsearListado(html: string): PaginaListado {
  const $ = cheerio.load(html);
  const entradas: EntradaListado[] = [];
  const vistos = new Set<string>();
  let ultimaPagina = 1;
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href")!;
    let path: string;
    try {
      const u = new URL(href, BASE);
      if (u.hostname !== new URL(BASE).hostname) return;
      path = u.pathname;
    } catch {
      return;
    }
    const pagina = /^\/cellers\/page\/(\d+)\/?$/.exec(path);
    if (pagina) {
      ultimaPagina = Math.max(ultimaPagina, Number(pagina[1]));
      return;
    }
    const slug = slugDe(path);
    if (!slug || vistos.has(slug)) return;
    vistos.add(slug);
    entradas.push({ url: `${BASE}/cellers/${slug}/`, datos: { id_externo: `slug:${slug}` } });
  });
  return { entradas, ultimaPagina };
}

const IDIOMAS: Record<string, string> = {
  cat: "ca", catala: "ca", cast: "es", esp: "es", castella: "es", eng: "en", angles: "en", fr: "fr", fra: "fr",
  frances: "fr", al: "de", ale: "de", alemany: "de", deu: "de", it: "it", ita: "it", italia: "it", rus: "ru",
};

/** «CAT | CAST | ENG» → ["ca", "es", "en"]. */
export function idiomasDe(texto: string | null): string[] {
  const out: string[] = [];
  for (const parte of (texto ?? "").split(/[|,/;]|\s+i\s+/)) {
    const c = IDIOMAS[claveTexto(parte)];
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * ¿Abre al público? true si hay sección «Visites» con texto; false si dice que no;
 * null si no hay sección o es solo para profesionales.
 */
export function visitasAbiertas(texto: string | null): boolean | null {
  if (!texto) return null;
  const c = claveTexto(texto);
  if (/\bno (es |s )?(fan|fem|realitzen|ofereix|admet)|sense visites|no visitable|tancat al public/.test(c)) return false;
  if (/professionals/.test(c) && !/public|particular|tothom|grups/.test(c)) return null;
  return true;
}

export function parsearFicha(html: string, entrada: EntradaListado): FichaConsejo {
  const $ = cheerio.load(html);
  const nombre = t($("h1.entry-title").first().text());
  if (!nombre) throw new Error(`Ficha sin nombre: ${entrada.url}`);

  const info = new Map<string, string>();
  const visites: string[] = [];
  let seccion: string | null = null;
  $("h2, .doq-row-info").each((_, el) => {
    if ($(el).is("h2")) {
      seccion = t($(el).text());
      return;
    }
    const etiqueta = t($(el).children("strong").first().text())?.replace(/:$/, "") ?? null;
    if (etiqueta) {
      const valor = t($(el).clone().children("strong").remove().end().text());
      const enlace = $(el).find("a[href]").first().attr("href") ?? null;
      const clave = claveTexto(etiqueta);
      if (!info.has(clave)) info.set(clave, (clave === "web" || clave === "email") && enlace ? enlace : (valor ?? ""));
    } else if (seccion === "Visites") {
      const texto = t($(el).text());
      if (texto) visites.push(texto);
    }
  });

  const script = $("script").map((_, s) => $(s).html() ?? "").get().find((s) => /var lat\s*=/.test(s)) ?? "";
  const lat = Number(/var lat\s*=\s*(-?[\d.]+)/.exec(script)?.[1]);
  const lng = Number(/var lon\s*=\s*(-?[\d.]+)/.exec(script)?.[1]);
  const visitasTexto = visites.join(" ") || null;
  const idiomas = idiomasDe(info.get("idiomes") ?? null);
  const v = (k: string) => t(info.get(k)) ?? null;

  return {
    url: entrada.url,
    id_externo: entrada.datos.id_externo ?? `slug:${slugDe(entrada.url)}`,
    nombre,
    direccion: v("adreca"),
    codigo_postal: v("codi postal"),
    municipio: v("poblacio"),
    provincia_texto: null,
    ubicacion: Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null,
    web: v("web"),
    telefono: v("telefon"),
    email: v("email")?.replace(/^mailto:/i, "") ?? null,
    marcas: [],
    enoturismo: visitasAbiertas(visitasTexto),
    extra: {
      ...(visitasTexto ? { seccion_visitas: true } : {}),
      ...(idiomas.length ? { idiomas_visita: idiomas } : {}),
    },
  };
}

export const consejoPriorat: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "priorat", nombre: "Priorat" },
  urlsRobots: [URL_LISTADO, urlPagina(2), `${BASE}/cellers/alvaro-palacios-sl/`],
  aliasMunicipio: ALIAS_MUNICIPIO,
  provinciaPorMunicipio: PROVINCIA_POR_MUNICIPIO,
  async listar(ctx: Contexto) {
    const primera = parsearListado((await ctx.http.get(urlPagina(1))).texto);
    if (primera.ultimaPagina > MAX_PAGINAS) throw new Error(`Paginador anómalo: ${primera.ultimaPagina} páginas`);
    ctx.log.info(`Listado: ${primera.ultimaPagina} páginas`);
    const entradas = [...primera.entradas];
    const vistos = new Set(entradas.map((e) => e.url));
    for (let n = 2; n <= primera.ultimaPagina; n++) {
      if (ctx.limite != null && entradas.length >= ctx.limite) break;
      const p = parsearListado((await ctx.http.get(urlPagina(n))).texto);
      if (p.entradas.length === 0) {
        ctx.log.warn(`Página ${n} sin bodegas; se deja de paginar`);
        break;
      }
      for (const e of p.entradas) {
        if (vistos.has(e.url)) continue;
        vistos.add(e.url);
        entradas.push(e);
      }
    }
    return entradas;
  },
  parsearFicha,
};
