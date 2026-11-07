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
