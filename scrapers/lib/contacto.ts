// Normalización de datos de contacto (web, email, teléfono, código postal).
import { limpiarEspacios } from "./texto.ts";

/** URL http(s) válida o null. Sin esquema se asume http:// (la web redirige si usa https). */
export function normalizarWeb(s: string | null | undefined): string | null {
  if (!s) return null;
  let t = limpiarEspacios(s);
  if (t === "" || t === "-") return null;
  if (!/^https?:\/\//i.test(t)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null; // mailto:, javascript:…
    t = "http://" + t.replace(/^\/+/, "");
  }
  try {
    const url = new URL(t);
    if (!url.hostname.includes(".")) return null;
    const ruta = url.pathname === "/" && !url.search ? "" : url.pathname;
    return `${url.protocol}//${url.host}${ruta}${url.search}`;
  } catch {
    return null;
  }
}

// Mismo criterio que el check bodegas_email_check, algo más estricto (exige dominio con punto).
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Primer email válido del texto (en minúsculas) o null. */
export function normalizarEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const candidatos = s
    .replace(/mailto:/gi, " ")
    .split(/[\s;,/]+/)
    .map((c) => c.trim().replace(/^[<(]+|[>).]+$/g, "").toLowerCase());
  return candidatos.find((c) => EMAIL.test(c)) ?? null;
}

/**
 * Teléfono para mostrar. Los números españoles se formatean «+34 983 036 949»;
 * el resto se deja como venía. Si hay varios, se queda con el primero.
 */
export function normalizarTelefono(s: string | null | undefined): string | null {
  if (!s) return null;
  const primero = limpiarEspacios(s).split(/\s*(?:\/|;|,|\by\b|\bo\b)\s*/)[0] ?? "";
  if (!/\d/.test(primero)) return null;
  let digitos = primero.replace(/\D/g, "");
  if (digitos.startsWith("0034")) digitos = digitos.slice(2);
  if (digitos.length === 11 && digitos.startsWith("34")) digitos = digitos.slice(2);
  if (digitos.length === 9 && /^[6789]/.test(digitos)) {
    return `+34 ${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`;
  }
  return primero;
}

/** Código postal español de 5 dígitos o null. */
export function normalizarCodigoPostal(s: string | null | undefined): string | null {
  const m = s?.match(/\b\d{5}\b/);
  return m ? m[0] : null;
}

// Subdominios habituales que no distinguen una web de otra (mismo criterio que
// public.dominio_web en la migración 20261110090000_consolidacion).
const SUBDOMINIO_HABITUAL = /^(?:www\d*|m|es|en|esp|eng|web)\.(?=[^.]+\.[^.]+)/;

/** Dominio de una web para emparejar: «https://WWW.Aalto.es/x» → «aalto.es». */
export function dominioWeb(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.trim().match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i);
  if (!m) return null;
  const host = m[1]!.toLowerCase().replace(/\.$/, "").replace(SUBDOMINIO_HABITUAL, "");
  return host === "" ? null : host;
}

// Dominios que no identifican a una bodega: redes, constructores de webs,
// agregadores y tiendas (y el propio consejo regulador).
const DOMINIOS_GENERICOS = [
  "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com", "tiktok.com",
  "youtube.com", "youtu.be", "linkedin.com", "pinterest.com", "linktr.ee", "linkin.bio",
  "wixsite.com", "wix.com", "wordpress.com", "blogspot.com", "blogspot.es", "blogger.com",
  "sites.google.com", "google.com", "goo.gl", "business.site", "jimdo.com", "jimdofree.com",
  "webnode.es", "webnode.com", "squarespace.com", "godaddysites.com", "myshopify.com",
  "weebly.com", "strikingly.com", "carrd.co", "tripadvisor.es", "tripadvisor.com",
  "vinoseleccion.com", "bodeboca.com", "decantalo.com", "lavinia.es", "lavinia.com",
  "elcorteingles.es", "vivino.com", "uvinum.es", "amazon.es", "amazon.com", "drinksco.es",
  "vinissimus.com", "riberadelduero.es", "riojawine.com", "gmail.com", "hotmail.com",
];

/** ¿Es un dominio (o subdominio de uno) que no sirve como clave de bodega? */
export function esDominioGenerico(dominio: string): boolean {
  return DOMINIOS_GENERICOS.some((g) => dominio === g || dominio.endsWith(`.${g}`));
}
