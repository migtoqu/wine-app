// Comprobación de un enlace: HEAD y, si no sirve, GET (cancelando el cuerpo).
// Ritmo educado por host (LimitadorPorHost), robots.txt por origen y sin
// insistir: un 429 deja el host para la próxima ejecución.
import type { Log } from "../lib/log.ts";
import { LimitadorPorHost } from "../lib/rate-limit.ts";
import { USER_AGENT } from "../lib/http.ts";
import { permitido, robotsDesdeRespuesta, type Robots } from "../lib/robots.ts";

export type TipoResultado = "ok" | "fallo" | "inconcluso";

export interface Resultado {
  resultado: TipoResultado;
  http: number | null;
  error: string | null;
  urlFinal: string | null;
  metodo: "HEAD" | "GET";
}

/**
 * Qué significa un código HTTP para un enlace. 401/403/429 no prueban que el
 * enlace esté roto (suelen ser bloqueos a bots): inconcluso, no cuenta.
 */
export function clasificarEstado(status: number): TipoResultado {
  if (status >= 200 && status < 400) return "ok";
  if (status === 401 || status === 403 || status === 429) return "inconcluso";
  return "fallo";
}

/** Códigos de un HEAD que justifican repetir con GET (servidores que no aceptan HEAD). */
function repetirConGet(status: number): boolean {
  return status >= 400;
}

export interface OpcionesComprobador {
  log: Log;
  fetch?: typeof fetch;
  limitador?: LimitadorPorHost;
  userAgent?: string;
  timeoutMs?: number;
}

/** Host pausado en esta ejecución (nos pidió parar con 429). */
export class HostPausado extends Error {
  constructor(host: string) {
    super(`${host} respondió 429: se deja para la próxima ejecución`);
    this.name = "HostPausado";
  }
}

export class Comprobador {
  private log: Log;
  private fetchFn: typeof fetch;
  private limitador: LimitadorPorHost;
  private userAgent: string;
  private timeoutMs: number;
  private robots = new Map<string, Promise<Robots | "sin-robots" | Error>>();
  private pausados = new Set<string>();
  peticiones = 0;

  constructor(o: OpcionesComprobador) {
    this.log = o.log;
    this.fetchFn = o.fetch ?? fetch;
    this.limitador = o.limitador ?? new LimitadorPorHost({ minMs: 2000, maxMs: 4000 });
    this.userAgent = o.userAgent ?? USER_AGENT;
    this.timeoutMs = o.timeoutMs ?? 20_000;
  }

  estaPausado(url: string): boolean {
    return this.pausados.has(new URL(url).host);
  }

  private async peticion(url: string, metodo: "HEAD" | "GET"): Promise<Response> {
    const host = new URL(url).host;
    return this.limitador.ejecutar(host, async () => {
      this.peticiones++;
      const res = await this.fetchFn(url, {
        method: metodo,
        headers: { "User-Agent": this.userAgent, Accept: "*/*", "Accept-Language": "es-ES,es;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      // Solo interesan estado y cabeceras.
      await res.body?.cancel().catch(() => {});
      this.log.debug(`${metodo} ${url} → ${res.status}`);
      return res;
    });
  }

  /**
   * robots.txt del origen. Sin respuesta (DNS, conexión, timeout) no hay nada
   * que respetar: el propio enlace dará el fallo. 5xx = no se rastrea (RFC 9309).
   */
  private robotsDe(origen: string): Promise<Robots | "sin-robots" | Error> {
    let r = this.robots.get(origen);
    if (!r) {
      const url = new URL("/robots.txt", origen).href;
      r = this.limitador
        .ejecutar(new URL(origen).host, async () => {
          this.peticiones++;
          const res = await this.fetchFn(url, {
            headers: { "User-Agent": this.userAgent, Accept: "text/plain,*/*;q=0.5" },
            redirect: "follow",
            signal: AbortSignal.timeout(this.timeoutMs),
          });
          const texto = res.status >= 200 && res.status < 300 ? await res.text() : "";
          if (!texto) await res.body?.cancel().catch(() => {});
          return { status: res.status, texto };
        })
        .then(
          ({ status, texto }) => {
            if (status === 429) {
              this.pausados.add(new URL(origen).host);
              return new HostPausado(new URL(origen).host);
            }
            try {
              return robotsDesdeRespuesta(url, status, texto);
            } catch (e) {
              return e as Error;
            }
          },
          () => "sin-robots" as const,
        );
      this.robots.set(origen, r);
    }
    return r;
  }

  /** null = no se ha comprobado (host pausado): no se registra nada. */
  async comprobar(url: string): Promise<Resultado | null> {
    let destino: URL;
    try {
      destino = new URL(url);
    } catch {
      return { resultado: "fallo", http: null, error: "URL no válida", urlFinal: null, metodo: "HEAD" };
    }
    if (this.pausados.has(destino.host)) return null;

    const robots = await this.robotsDe(destino.origin);
    if (robots instanceof HostPausado) return null;
    if (robots instanceof Error) {
      return { resultado: "inconcluso", http: null, error: robots.message, urlFinal: null, metodo: "HEAD" };
    }
    if (robots !== "sin-robots" && !permitido(robots, url, this.userAgent)) {
      return { resultado: "inconcluso", http: null, error: "robots.txt no lo permite", urlFinal: null, metodo: "HEAD" };
    }

    let primero: Resultado | null = null;
    for (const metodo of ["HEAD", "GET"] as const) {
      let r: Resultado;
      try {
        const res = await this.peticion(url, metodo);
        const final = res.url && res.url !== url ? res.url : null;
        r = {
          resultado: clasificarEstado(res.status),
          http: res.status,
          error: res.status >= 400 ? `HTTP ${res.status}` : null,
          urlFinal: final,
          metodo,
        };
        if (res.status === 429) {
          this.pausados.add(destino.host);
          this.log.warn(new HostPausado(destino.host).message);
          return r;
        }
        if (metodo === "HEAD" && repetirConGet(res.status)) {
          primero = r;
          continue;
        }
      } catch (e) {
        r = { resultado: "fallo", http: null, error: describirError(e), urlFinal: null, metodo };
        if (metodo === "HEAD") {
          primero = r;
          continue;
        }
      }
      return r;
    }
    return primero!;
  }
}

/** Mensaje corto de un error de red de fetch (causa de undici incluida). */
export function describirError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  if (e.name === "TimeoutError" || e.name === "AbortError") return "Tiempo de espera agotado";
  const causa = (e as Error & { cause?: { code?: string; message?: string } }).cause;
  if (causa?.code) return `${causa.code}${causa.message ? `: ${causa.message}` : ""}`.slice(0, 300);
  return e.message.slice(0, 300);
}

/**
 * Reparte las URLs por host y las comprueba con `paralelo` hosts a la vez (cada
 * host, de una en una con su pausa). `seguir()` se consulta antes de cada
 * enlace (presupuesto de tiempo).
 */
export async function comprobarTodos<T extends { url: string }>(
  comprobador: Comprobador,
  items: T[],
  alTerminar: (item: T, r: Resultado | null) => Promise<void>,
  { paralelo = 6, seguir = () => true }: { paralelo?: number; seguir?: () => boolean } = {},
): Promise<{ comprobados: number; pendientes: number }> {
  const porHost = new Map<string, T[]>();
  for (const it of items) {
    let host: string;
    try {
      host = new URL(it.url).host;
    } catch {
      host = "";
    }
    const lista = porHost.get(host) ?? [];
    lista.push(it);
    porHost.set(host, lista);
  }
  // Los hosts con más enlaces primero, para que no queden para el final.
  const cola = [...porHost.values()].sort((a, b) => b.length - a.length);
  let comprobados = 0;
  let pendientes = 0;
  const trabajador = async () => {
    for (let lista = cola.shift(); lista; lista = cola.shift()) {
      for (const it of lista) {
        if (!seguir()) {
          pendientes++;
          continue;
        }
        const r = await comprobador.comprobar(it.url);
        if (r) comprobados++;
        else pendientes++;
        await alTerminar(it, r);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, paralelo) }, trabajador));
  return { comprobados, pendientes };
}
