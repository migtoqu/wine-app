// Cliente HTTP "educado": UA identificable, una conexión y 3–5 s por dominio,
// robots.txt antes de cada URL, reintentos solo para 5xx/timeouts y parada
// inmediata ante 403/429 (no se insiste ni se cambia de UA).
import type { Log } from "./log.ts";
import { dormir, LimitadorPorHost } from "./rate-limit.ts";
import { permitido, RobotsDenegado, robotsDesdeRespuesta, type Robots } from "./robots.ts";

export const USER_AGENT =
  "wine-app-bot/0.1 (+https://github.com/migtoqu/wine-app; contacto: https://github.com/migtoqu/wine-app/issues)";

/** La fuente nos pide parar (403/429) o hay un desafío anti-bot: se aborta la fuente. */
export class ParadaFuente extends Error {
  status: number;
  constructor(url: string, status: number) {
    super(`HTTP ${status} en ${url}: se detiene la fuente`);
    this.name = "ParadaFuente";
    this.status = status;
  }
}

/** Error HTTP no reintentable (404, 410…): afecta solo a esa URL. */
export class ErrorHttp extends Error {
  status: number;
  constructor(url: string, status: number) {
    super(`HTTP ${status} en ${url}`);
    this.name = "ErrorHttp";
    this.status = status;
  }
}

export interface Respuesta {
  url: string;
  status: number;
  texto: string;
  /** Cabeceras de la respuesta (X-Robots-Tag, X-WP-TotalPages, Content-Type…). */
  cabeceras?: Headers;
}

export interface OpcionesGet {
  /**
   * Acepta que la URL redirija a otro dominio (solo para la portada de una web cuyo dominio
   * cambió). Quien llama debe pasar la puerta completa por el host final antes de pedir nada más.
   */
  permitirOtroHost?: boolean;
  /**
   * API pública con política de uso propia (Nominatim, Overpass): no se evalúa robots.txt, que
   * en esos servicios va dirigido a rastreadores web. Quien llama cumple la política de la API
   * (ritmo, User-Agent, caché) y la documenta en `fuentes.notas_robots`. 403/429 siguen deteniendo.
   */
  api?: boolean;
}

export interface OpcionesCliente {
  log: Log;
  userAgent?: string;
  limitador?: LimitadorPorHost;
  fetch?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Esperas antes de cada reintento; su longitud es el número de reintentos. */
  backoffMs?: number[];
}

class Reintentable extends Error {}

export class ClienteHttp {
  readonly userAgent: string;
  private log: Log;
  private limitador: LimitadorPorHost;
  private fetchFn: typeof fetch;
  private dormirFn: (ms: number) => Promise<void>;
  private timeoutMs: number;
  private backoffMs: number[];
  private robots = new Map<string, Promise<Robots>>();
  private textosRobots = new Map<string, string>();
  peticiones = 0;

  constructor(o: OpcionesCliente) {
    this.log = o.log;
    this.userAgent = o.userAgent ?? USER_AGENT;
    this.limitador = o.limitador ?? new LimitadorPorHost({ minMs: 3000, maxMs: 5000 });
    this.fetchFn = o.fetch ?? fetch;
    this.dormirFn = o.dormir ?? dormir;
    this.timeoutMs = o.timeoutMs ?? 30_000;
    this.backoffMs = o.backoffMs ?? [10_000, 30_000, 90_000];
  }

  /** robots.txt del origen, descargado una sola vez por ejecución. */
  robotsDe(origen: string): Promise<Robots> {
    let r = this.robots.get(origen);
    if (!r) {
      const url = new URL("/robots.txt", origen).href;
      r = this.pedir(url).then((res) => {
        this.log.info(`robots.txt de ${origen}: HTTP ${res.status}`);
        if (res.status >= 200 && res.status < 300) this.textosRobots.set(origen, res.texto);
        return robotsDesdeRespuesta(url, res.status, res.texto);
      });
      this.robots.set(origen, r);
    }
    return r;
  }

  /** Texto del robots.txt ya descargado (para leer `Content-Signal`, `Sitemap:`…); null si no hay. */
  async textoRobots(origen: string): Promise<string | null> {
    await this.robotsDe(origen);
    return this.textosRobots.get(origen) ?? null;
  }

  /** Lanza RobotsDenegado si el robots.txt actual no permite la URL. */
  async comprobarRobots(url: string): Promise<void> {
    const robots = await this.robotsDe(new URL(url).origin);
    if (!permitido(robots, url, this.userAgent)) throw new RobotsDenegado(url);
  }

  /** GET de una página HTML respetando robots.txt. */
  async get(url: string, opciones: OpcionesGet = {}): Promise<Respuesta> {
    if (!opciones.api) await this.comprobarRobots(url);
    const res = await this.pedir(url);
    if (res.status >= 400) throw new ErrorHttp(url, res.status);
    const final = new URL(res.url);
    if (final.host !== new URL(url).host && !opciones.permitirOtroHost) {
      throw new Error(`${url} redirige a otro dominio (${final.host})`);
    }
    if (res.url !== url && !opciones.api) await this.comprobarRobots(res.url);
    return res;
  }

  /** Petición con limitador y reintentos; devuelve también respuestas 4xx (salvo 403/429). */
  private async pedir(url: string): Promise<Respuesta> {
    const host = new URL(url).host;
    for (let intento = 0; ; intento++) {
      try {
        return await this.limitador.ejecutar(host, () => this.unaPeticion(url));
      } catch (e) {
        if (!(e instanceof Reintentable) || intento >= this.backoffMs.length) {
          throw e instanceof Reintentable ? new Error(e.message) : e;
        }
        const espera = this.backoffMs[intento]!;
        this.log.warn(`${e.message}; reintento ${intento + 1}/${this.backoffMs.length} en ${espera / 1000} s`);
        await this.dormirFn(espera);
      }
    }
  }

  private async unaPeticion(url: string): Promise<Respuesta> {
    this.peticiones++;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "Accept-Language": "es-ES,es;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // Timeout o error de red: reintentable.
      throw new Reintentable(`GET ${url} falló: ${(e as Error).message}`);
    }
    this.log.debug(`GET ${url} → ${res.status}`);
    if (res.status === 403 || res.status === 429) {
      await res.body?.cancel();
      throw new ParadaFuente(url, res.status);
    }
    if (res.status >= 500) {
      await res.body?.cancel();
      throw new Reintentable(`GET ${url} → HTTP ${res.status}`);
    }
    try {
      return { url: res.url || url, status: res.status, texto: decodificarCuerpo(await res.arrayBuffer()), cabeceras: res.headers };
    } catch (e) {
      throw new Reintentable(`GET ${url}: cuerpo incompleto: ${(e as Error).message}`);
    }
  }
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const WIN1252 = new TextDecoder("windows-1252");

/**
 * Cuerpo → texto. UTF-8 si es válido (lo mismo que `res.text()`); si no, Windows-1252, que cubre
 * Latin-1: hay servidores que anuncian UTF-8 y sirven Latin-1 (el CSV de la D.O. Penedès), y
 * `res.text()` cambiaría cada tilde por «�» sin avisar.
 */
export function decodificarCuerpo(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try {
    return UTF8.decode(bytes);
  } catch {
    return WIN1252.decode(bytes);
  }
}
