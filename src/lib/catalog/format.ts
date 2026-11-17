import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { parseAnada } from "./filters";
import type { Anada, CatalogImage } from "./types";

// Formatos y utilidades de presentación de las fichas. Módulo puro.

// "16–18 °C", "16 °C" o null si no hay datos.
export function formatTempRange(
  lang: Locale,
  min: number | null,
  max: number | null,
): string | null {
  const fmt = (n: number) => formatNumber(lang, n, { maximumFractionDigits: 1 });
  if (min !== null && max !== null && min !== max) return `${fmt(min)}–${fmt(max)} °C`;
  const single = min ?? max;
  return single === null ? null : `${fmt(single)} °C`;
}

// "14,5 % vol."
export function formatAlcohol(lang: Locale, grado: number | null): string | null {
  if (grado === null) return null;
  return `${formatNumber(lang, grado, { maximumFractionDigits: 2 })} % vol.`;
}

// "85 %"
export function formatPercent(lang: Locale, value: number | null): string | null {
  if (value === null) return null;
  return `${formatNumber(lang, value, { maximumFractionDigits: 1 })} %`;
}

// Dirección en una línea: "Ctra. N-122, km 323, 47359 Olivares de Duero, Valladolid".
export function formatAddress(parts: {
  direccion: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  provincia: string | null;
}): string | null {
  const locality = [parts.codigo_postal, parts.municipio].filter(Boolean).join(" ");
  const province =
    parts.provincia && parts.provincia !== parts.municipio ? parts.provincia : null;
  const line = [parts.direccion, locality, province].filter(Boolean).join(", ");
  return line || null;
}

// Dominio legible de una URL: "https://www.bodega.com/es/" → "bodega.com".
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

const SOCIAL_ORDER = ["instagram", "facebook", "x", "twitter", "tiktok", "youtube", "linkedin"];
const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  twitter: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

export type SocialLink = { network: string; label: string; url: string };

// Redes de bodegas.redes ({"instagram": "https://…"}): solo URLs http(s),
// en un orden estable y sin repetir X/Twitter.
export function socialLinks(redes: unknown): SocialLink[] {
  if (!redes || typeof redes !== "object" || Array.isArray(redes)) return [];
  const entries = Object.entries(redes as Record<string, unknown>)
    .map(([key, url]) => [key.toLowerCase(), url] as const)
    .filter((entry): entry is readonly [string, string] => isHttpUrl(entry[1]));
  const rank = (k: string) => {
    const i = SOCIAL_ORDER.indexOf(k);
    return i === -1 ? SOCIAL_ORDER.length : i;
  };
  const seen = new Set<string>();
  return entries
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([network, url]) => ({
      network,
      label: SOCIAL_LABELS[network] ?? network.charAt(0).toUpperCase() + network.slice(1),
      url,
    }))
    .filter((link) => (seen.has(link.label) ? false : (seen.add(link.label), true)));
}

// Fecha más reciente de una lista de ISO strings (para "actualizado el …").
export function latestDate(dates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const d of dates) {
    if (!d) continue;
    const t = Date.parse(d);
    if (!Number.isNaN(t) && t > bestTime) {
      best = d;
      bestTime = t;
    }
  }
  return best;
}

// Clave de añada para la URL: 2020 → "2020"; sin añada → "sin".
export function anadaKey(anio: number | null): string {
  return anio === null ? "sin" : String(anio);
}

// Ordena añadas de más reciente a más antigua, con "sin añada" al final.
export function sortAnadas<T extends { anio: number | null }>(anadas: T[]): T[] {
  return [...anadas].sort((a, b) => {
    if (a.anio === b.anio) return 0;
    if (a.anio === null) return 1;
    if (b.anio === null) return -1;
    return b.anio - a.anio;
  });
}

// Añada a mostrar según ?anada=: la pedida si existe; si no, la más reciente
// (la lista ya viene ordenada con sortAnadas).
export function pickAnada(
  anadas: Anada[],
  raw: string | string[] | undefined,
): Anada | null {
  const wanted = parseAnada(raw);
  if (wanted !== null) {
    const anio = wanted === "sin" ? null : wanted;
    const match = anadas.find((a) => a.anio === anio);
    if (match) return match;
  }
  return anadas[0] ?? null;
}

// Recorta un texto a `max` caracteres sin partir palabras (para metadatos).
export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// Imagen de la ficha de vino para una añada: la de esa añada (los scrapers
// cuelgan ahí la botella); si no tiene, la del vino; si tampoco, la de la
// añada más reciente que tenga alguna.
export function imageForAnada(
  vino: { imagenes: CatalogImage[]; anadas: Anada[] },
  anada: Anada | null,
): CatalogImage | null {
  return (
    anada?.imagenes[0] ??
    vino.imagenes[0] ??
    vino.anadas.find((a) => a.imagenes.length > 0)?.imagenes[0] ??
    null
  );
}

// Duración de un servicio: 90 → «1 h 30 min», 45 → «45 min».
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Idiomas ISO 639-1 → nombres en el idioma de la interfaz («en» → «inglés»).
export function formatLanguages(lang: string, codes: string[]): string | null {
  if (codes.length === 0) return null;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([lang], { type: "language" });
  } catch {
    names = null;
  }
  return codes.map((c) => names?.of(c) ?? c).join(", ");
}

export type CataResumen = {
  vista: string | null;
  nariz: string | null;
  boca: string | null;
  maridaje: string | null;
  // Frases que no siguen el patrón «Etiqueta: …» (se muestran tal cual).
  resto: string | null;
};

const CATA_ETIQUETAS: Record<string, keyof Omit<CataResumen, "resto">> = {
  vista: "vista", appearance: "vista",
  nariz: "nariz", nose: "nariz",
  boca: "boca", palate: "boca",
  maridaje: "maridaje", "food pairing": "maridaje",
};

// El resumen propio de cata llega como «Vista: rojo picota. Nariz: frutos negros y tostados.
// Maridaje: carnes rojas.» (plantillas del scraper, es/en): se separa por partes para la ficha.
export function parseCataResumen(texto: string): CataResumen {
  const out: CataResumen = { vista: null, nariz: null, boca: null, maridaje: null, resto: null };
  const resto: string[] = [];
  const re = /(Vista|Nariz|Boca|Maridaje|Appearance|Nose|Palate|Food pairing):\s*([^]*?)(?=\s+(?:Vista|Nariz|Boca|Maridaje|Appearance|Nose|Palate|Food pairing):|$)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index! > ultimo) resto.push(texto.slice(ultimo, m.index).trim());
    const clave = CATA_ETIQUETAS[m[1]!.toLowerCase()]!;
    const valor = m[2]!.trim().replace(/\.$/, "");
    if (valor) out[clave] = valor.charAt(0).toUpperCase() + valor.slice(1);
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) resto.push(texto.slice(ultimo).trim());
  out.resto = resto.filter(Boolean).join(" ") || null;
  return out;
}
