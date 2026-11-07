// robots.txt evaluado con robots-parser (comodines `*`/`$` y "la regla más
// larga gana", necesario para `Disallow: /*?*` + `Allow: /*?p=*`).
import robotsParser from "robots-parser";

export type Robots = ReturnType<typeof robotsParser>;

/** El robots.txt excluye una URL que necesitamos: la fuente se aborta. */
export class RobotsDenegado extends Error {
  url: string;
  constructor(url: string) {
    super(`robots.txt no permite ${url}`);
    this.name = "RobotsDenegado";
    this.url = url;
  }
}

/**
 * Interpreta la respuesta a /robots.txt según RFC 9309: 2xx → reglas;
 * 4xx → sin restricciones; 5xx o error de red → no se puede rastrear (lo
 * decide quien llama, que debe abortar).
 */
export function robotsDesdeRespuesta(urlRobots: string, status: number, texto: string): Robots {
  if (status >= 200 && status < 300) return robotsParser(urlRobots, texto);
  if (status >= 400 && status < 500) return robotsParser(urlRobots, "");
  throw new Error(`robots.txt respondió ${status}: no se puede rastrear ${urlRobots}`);
}

/** Token del UA que se compara con las líneas `User-agent:`. */
export function tokenUserAgent(userAgent: string): string {
  return userAgent.split("/")[0]!.trim();
}

export function permitido(robots: Robots, url: string, userAgent: string): boolean {
  // undefined = la URL es de otro host: no la cubre este robots.txt.
  return robots.isAllowed(url, tokenUserAgent(userAgent)) === true;
}
