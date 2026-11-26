// Utilidades de las vistas de ejecuciones y enlaces del admin. Las reglas de
// clasificación son las mismas que las del comprobador semanal
// (scrapers/comprobador-enlaces/comprobar.ts); se repiten aquí porque los
// scrapers no comparten módulos con la app.

export const VISTAS_ENLACES = ["fallando", "ocultos", "ignorados"] as const;
export type VistaEnlaces = (typeof VISTAS_ENLACES)[number];

export function vistaEnlaces(v: string): VistaEnlaces {
  return (VISTAS_ENLACES as readonly string[]).includes(v) ? (v as VistaEnlaces) : "fallando";
}

export const ESTADOS_EJECUCION = ["en_curso", "ok", "parcial", "error"] as const;
export type EstadoEjecucion = (typeof ESTADOS_EJECUCION)[number];

export function esEstadoEjecucion(v: string): v is EstadoEjecucion {
  return (ESTADOS_EJECUCION as readonly string[]).includes(v);
}

/** "1 h 05 min", "3 min 07 s", "12 s"; null si no ha terminado. */
export function formatDuracion(inicio: string, fin: string | null): string | null {
  if (!fin) return null;
  const s = Math.max(0, Math.round((Date.parse(fin) - Date.parse(inicio)) / 1000));
  if (!Number.isFinite(s)) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h} h ${dos(m)} min`;
  if (m > 0) return `${m} min ${dos(seg)} s`;
  return `${seg} s`;
}

export type ResultadoEnlace = "ok" | "fallo" | "inconcluso";

export function clasificarEstado(status: number): ResultadoEnlace {
  if (status >= 200 && status < 400) return "ok";
  if (status === 401 || status === 403 || status === 429) return "inconcluso";
  return "fallo";
}

export interface Comprobacion {
  resultado: ResultadoEnlace;
  http: number | null;
  error: string | null;
  urlFinal: string | null;
  metodo: "HEAD" | "GET";
}

const USER_AGENT =
  "wine-app-bot/0.1 (+https://github.com/migtoqu/wine-app; contacto: https://github.com/migtoqu/wine-app/issues)";

/**
 * Comprobación inmediata de una URL (botón "Reintentar"): HEAD y, si no
 * responde bien, GET sin leer el cuerpo. Es una sola petición pedida por el
 * admin, así que no consulta robots.txt (el comprobador semanal sí).
 */
export async function comprobarUrl(
  url: string,
  { fetchFn = fetch, timeoutMs = 10_000 }: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<Comprobacion> {
  let anterior: Comprobacion | null = null;
  for (const metodo of ["HEAD", "GET"] as const) {
    try {
      const res = await fetchFn(url, {
        method: metodo,
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      await res.body?.cancel().catch(() => {});
      const r: Comprobacion = {
        resultado: clasificarEstado(res.status),
        http: res.status,
        error: res.status >= 400 ? `HTTP ${res.status}` : null,
        urlFinal: res.url && res.url !== url ? res.url : null,
        metodo,
      };
      if (metodo === "HEAD" && res.status >= 400 && res.status !== 429) {
        anterior = r;
        continue;
      }
      return r;
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      const mensaje =
        err.name === "TimeoutError" || err.name === "AbortError"
          ? "Tiempo de espera agotado"
          : (err.cause?.code ?? err.message ?? String(e)).slice(0, 300);
      anterior = { resultado: "fallo", http: null, error: mensaje, urlFinal: null, metodo };
    }
  }
  return anterior!;
}
