// Listado de resultados del Concours Mondial de Bruxelles (results.concoursmondial.com):
// una tarjeta por vino premiado con nombre y añada, productor, «País - Región», D.O.,
// medalla y, a veces, un trofeo. Solo se lee el listado; las fichas (notas de cata) no.
import * as cheerio from "cheerio";
import { limpiarEspacios } from "../../lib/texto.ts";
import type { Medalla } from "../../lib/premios.ts";

export const BASE = "https://results.concoursmondial.com";

export interface TarjetaCmb {
  /** id numérico de la ficha («248736-salvueros-2025» → «248736»). */
  id: string;
  url: string;
  /** Nombre tal cual, con la añada («Salvueros 2025»). */
  titulo: string;
  productor: string | null;
  pais: string | null;
  region: string | null;
  denominacion: string | null;
  distincion: string;
  medalla: Medalla | null;
  mencion: string | null;
  /** Categoría del pie («Vino - Tranquilo», «Vino - Espumoso»). */
  categoria: string | null;
}

export interface ListadoCmb {
  tarjetas: TarjetaCmb[];
  /** URL de la página siguiente (rel="next"), o null en la última. */
  siguiente: string | null;
}

/** URL del listado de una edición, solo vinos de España. */
export function urlListado(edicion: number, pagina = 1): string {
  const u = new URL(`/es/resultados/${edicion}`, BASE);
  u.searchParams.set("search[country]", "Spain");
  if (pagina > 1) u.searchParams.set("page", String(pagina));
  return u.href;
}

/** «Gran Medalla de Oro» / «Grand Gold Medal» → gran_oro… (las ediciones antiguas salen en inglés). */
export function medallaCmb(texto: string): Medalla | null {
  const t = texto.toLowerCase();
  if (/gran(d)?\b.*\b(oro|gold)/.test(t)) return "gran_oro";
  if (/\b(oro|gold)\b/.test(t)) return "oro";
  if (/\b(plata|silver)\b/.test(t)) return "plata";
  if (/\b(bronce|bronze)\b/.test(t)) return "bronce";
  return null;
}

export function parsearListado(html: string): ListadoCmb {
  const $ = cheerio.load(html);
  const tarjetas: TarjetaCmb[] = [];
  $(".card-product").each((_, el) => {
    const card = $(el);
    const href = card.find("a.stretched-link").attr("href");
    const titulo = limpiarEspacios(card.find(".card-title").text());
    const m = href?.match(/\/(\d+)-[^/]*$/);
    if (!href || !m || !titulo) return;
    // Hijos del cuerpo en orden: productor, «País - Región», D.O. (si la hay), y la distinción:
    // medalla (texto en negrita) o el logo «CMB Merit» (reconocimiento sin medalla). Después, el trofeo.
    const spans = card.find(".card-body > span").toArray().map((s) => $(s));
    const iDist = spans.findIndex((s) => s.hasClass("fw-bold") || s.find("img[alt]").length > 0);
    const dist = iDist >= 0 ? spans[iDist]! : null;
    const distincion = dist ? limpiarEspacios(dist.text()) || limpiarEspacios(dist.find("img").attr("alt") ?? "") : "";
    const lineas = (iDist >= 0 ? spans.slice(0, iDist) : spans).map((s) => limpiarEspacios(s.text()));
    const [productor = null, lugar = null, denominacion = null] = lineas;
    const [pais = null, ...resto] = (lugar ?? "").split(" - ");
    const mencion = iDist >= 0 ? spans.slice(iDist + 1).map((s) => limpiarEspacios(s.text())).find(Boolean) ?? null : null;
    tarjetas.push({
      id: m[1]!,
      url: new URL(href, BASE).href,
      titulo,
      productor: productor || null,
      pais: pais || null,
      region: resto.join(" - ") || null,
      denominacion: denominacion || null,
      distincion,
      medalla: medallaCmb(distincion),
      mencion,
      categoria: limpiarEspacios(card.find(".card-footer").text()) || null,
    });
  });
  const next = $('a[rel="next"]').attr("href");
  return { tarjetas, siguiente: next ? new URL(next, BASE).href : null };
}
