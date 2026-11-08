import { describe, expect, it, vi } from "vitest";
import { ClienteHttp, ErrorHttp, ParadaFuente, USER_AGENT } from "./http.ts";
import { Log } from "./log.ts";
import { LimitadorPorHost } from "./rate-limit.ts";
import { permitido, RobotsDenegado, robotsDesdeRespuesta, tokenUserAgent } from "./robots.ts";

// Reglas reales relevantes (2026-11-07).
const ROBOTS_VINOSELECCION = `User-agent: *
Disallow: /catalog/
Disallow: /catalogsearch/
Disallow: /checkout/
Disallow: /search/
Disallow: /*?*
Allow: /*?p=*
Sitemap: https://www.vinoseleccion.com/media/sitemap/com/sitemap.xml
`;
const ROBOTS_RIBERA = `User-agent: *
Disallow: /core/
Disallow: /admin/
Disallow: /search/
Disallow: /user/
`;

describe("robots.txt", () => {
  const vs = robotsDesdeRespuesta("https://www.vinoseleccion.com/robots.txt", 200, ROBOTS_VINOSELECCION);
  const rd = robotsDesdeRespuesta("https://www.riberadelduero.es/robots.txt", 200, ROBOTS_RIBERA);

  it("Vinoselección: solo URLs limpias y ?p=N", () => {
    expect(permitido(vs, "https://www.vinoseleccion.com/vinos/espana/ribera-duero", USER_AGENT)).toBe(true);
    expect(permitido(vs, "https://www.vinoseleccion.com/vinos/espana/ribera-duero?p=2", USER_AGENT)).toBe(true);
    expect(permitido(vs, "https://www.vinoseleccion.com/vinos/espana/ribera-duero?cat=3", USER_AGENT)).toBe(false);
    expect(permitido(vs, "https://www.vinoseleccion.com/catalogsearch/result", USER_AGENT)).toBe(false);
    expect(permitido(vs, "https://www.vinoseleccion.com/conde-san-cristobal-2023", USER_AGENT)).toBe(true);
  });

  it("Ribera: listado (con query) y fichas permitidos", () => {
    expect(permitido(rd, "https://www.riberadelduero.es/bodegas/resultados?termino=&page=3", USER_AGENT)).toBe(true);
    expect(permitido(rd, "https://www.riberadelduero.es/bodegas/aalto-bodegas-y-vinedos", USER_AGENT)).toBe(true);
    expect(permitido(rd, "https://www.riberadelduero.es/search/node", USER_AGENT)).toBe(false);
  });

  it("una regla específica para nuestro bot se respeta", () => {
    const r = robotsDesdeRespuesta("https://x.es/robots.txt", 200, "User-agent: wine-app-bot\nDisallow: /\n");
    expect(tokenUserAgent(USER_AGENT)).toBe("wine-app-bot");
    expect(permitido(r, "https://x.es/a", USER_AGENT)).toBe(false);
  });

  it("4xx = sin restricciones; 5xx = no se puede rastrear", () => {
    expect(permitido(robotsDesdeRespuesta("https://x.es/robots.txt", 404, ""), "https://x.es/a", USER_AGENT)).toBe(true);
    expect(() => robotsDesdeRespuesta("https://x.es/robots.txt", 503, "")).toThrow();
  });
});

describe("LimitadorPorHost", () => {
  it("serializa por host y espera entre peticiones con jitter", async () => {
    let t = 0;
    const esperas: number[] = [];
    const limitador = new LimitadorPorHost({
      minMs: 3000,
      maxMs: 5000,
      ahora: () => t,
      aleatorio: () => 0.5,
      dormir: async (ms) => {
        esperas.push(ms);
        t += ms;
      },
    });
    const orden: string[] = [];
    const tarea = (id: string) => async () => {
      orden.push(`inicio ${id}`);
      t += 100;
      orden.push(`fin ${id}`);
    };
    await Promise.all([limitador.ejecutar("a.es", tarea("1")), limitador.ejecutar("a.es", tarea("2"))]);
    expect(orden).toEqual(["inicio 1", "fin 1", "inicio 2", "fin 2"]);
    expect(esperas).toEqual([4000]);
  });

  it("el jitter queda dentro del rango", () => {
    const l = new LimitadorPorHost({ minMs: 3000, maxMs: 5000 });
    for (let i = 0; i < 50; i++) {
      const p = l.siguientePausa();
      expect(p).toBeGreaterThanOrEqual(3000);
      expect(p).toBeLessThanOrEqual(5000);
    }
  });
});

function respuesta(status: number, cuerpo = "", url = "") {
  const r = new Response(cuerpo, { status });
  if (url) Object.defineProperty(r, "url", { value: url });
  return r;
}

function cliente(manejador: (url: string) => Response | Promise<Response>) {
  const fetchFalso = vi.fn<typeof fetch>(async (url) => {
    const u = String(url);
    const r = await manejador(u);
    if (!r.url) Object.defineProperty(r, "url", { value: u });
    return r;
  });
  const http = new ClienteHttp({
    log: new Log(),
    fetch: fetchFalso,
    limitador: new LimitadorPorHost({ minMs: 0, maxMs: 0 }),
    dormir: async () => {},
    backoffMs: [1, 1, 1],
  });
  return { http, fetchFalso };
}

describe("ClienteHttp", () => {
  it("envía el User-Agent y descarga robots.txt una sola vez", async () => {
    const { http, fetchFalso } = cliente((u) => (u.endsWith("/robots.txt") ? respuesta(200, "") : respuesta(200, "ok")));
    await http.get("https://a.es/1");
    await http.get("https://a.es/2");
    const urls = fetchFalso.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(["https://a.es/robots.txt", "https://a.es/1", "https://a.es/2"]);
    const init = fetchFalso.mock.calls[1]![1]!;
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
  });

  it("no pide URLs que robots.txt prohíbe", async () => {
    const { http, fetchFalso } = cliente((u) =>
      u.endsWith("/robots.txt") ? respuesta(200, "User-agent: *\nDisallow: /privado\n") : respuesta(200),
    );
    await expect(http.get("https://a.es/privado/x")).rejects.toBeInstanceOf(RobotsDenegado);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("reintenta 5xx y timeouts hasta agotar el backoff", async () => {
    let n = 0;
    const { http } = cliente((u) => {
      if (u.endsWith("/robots.txt")) return respuesta(404);
      n++;
      if (n === 1) throw new DOMException("timeout", "TimeoutError");
      if (n === 2) return respuesta(503);
      return respuesta(200, "por fin");
    });
    await expect(http.get("https://a.es/x")).resolves.toMatchObject({ texto: "por fin" });
    expect(n).toBe(3);
  });

  it("falla tras agotar los reintentos", async () => {
    const { http, fetchFalso } = cliente((u) => (u.endsWith("/robots.txt") ? respuesta(404) : respuesta(502)));
    await expect(http.get("https://a.es/x")).rejects.toThrow(/502/);
    expect(fetchFalso).toHaveBeenCalledTimes(1 + 4);
  });

  it.each([403, 429])("se detiene sin reintentar ante %i", async (status) => {
    const { http, fetchFalso } = cliente((u) => (u.endsWith("/robots.txt") ? respuesta(404) : respuesta(status)));
    await expect(http.get("https://a.es/x")).rejects.toBeInstanceOf(ParadaFuente);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("404 es un error de esa URL, sin reintentos", async () => {
    const { http, fetchFalso } = cliente((u) => (u.endsWith("/robots.txt") ? respuesta(404) : respuesta(404)));
    await expect(http.get("https://a.es/x")).rejects.toBeInstanceOf(ErrorHttp);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("rechaza redirecciones a otro dominio", async () => {
    const { http } = cliente((u) =>
      u.endsWith("/robots.txt") ? respuesta(404) : respuesta(200, "", "https://otro.es/x"),
    );
    await expect(http.get("https://a.es/x")).rejects.toThrow(/otro dominio/);
  });

  it("con permitirOtroHost acepta la redirección, comprueba el robots.txt del host final y expone las cabeceras", async () => {
    const { http, fetchFalso } = cliente((u) => {
      if (u === "https://a.com/robots.txt") return respuesta(404);
      if (u === "https://a.es/robots.txt") return respuesta(200, "User-agent: *\nDisallow: /privado\n");
      const r = new Response("portada", { status: 200, headers: { "X-Robots-Tag": "noai" } });
      Object.defineProperty(r, "url", { value: "https://a.es/" });
      return r;
    });
    const res = await http.get("https://a.com/", { permitirOtroHost: true });
    expect(res.url).toBe("https://a.es/");
    expect(res.cabeceras?.get("x-robots-tag")).toBe("noai");
    expect(fetchFalso.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://a.com/robots.txt", "https://a.com/", "https://a.es/robots.txt",
    ]);
    // El resto de peticiones siguen sin aceptar otro dominio.
    await expect(http.get("https://a.com/x")).rejects.toThrow(/otro dominio/);
  });

  it("con permitirOtroHost respeta el robots.txt del host final", async () => {
    const { http } = cliente((u) => {
      if (u === "https://a.com/robots.txt") return respuesta(404);
      if (u === "https://a.es/robots.txt") return respuesta(200, "User-agent: *\nDisallow: /\n");
      return respuesta(200, "", "https://a.es/");
    });
    await expect(http.get("https://a.com/", { permitirOtroHost: true })).rejects.toBeInstanceOf(RobotsDenegado);
  });

  it("aborta si robots.txt da 5xx", async () => {
    const { http } = cliente((u) => (u.endsWith("/robots.txt") ? respuesta(500) : respuesta(200)));
    await expect(http.get("https://a.es/x")).rejects.toThrow(/robots/);
  });
});
