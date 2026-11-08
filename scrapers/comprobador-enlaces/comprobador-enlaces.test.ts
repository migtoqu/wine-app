import { describe, expect, it } from "vitest";
import { Log } from "../lib/log.ts";
import { LimitadorPorHost } from "../lib/rate-limit.ts";
import { clasificarEstado, Comprobador, comprobarTodos, describirError } from "./comprobar.ts";

type Respuesta = { status: number; url?: string; texto?: string } | Error;
type Llamada = { url: string; metodo: string };

/** fetch simulado: `rutas` por URL; un array da respuestas sucesivas (HEAD, GET…). */
function simular(rutas: Record<string, Respuesta | Respuesta[]>) {
  const llamadas: Llamada[] = [];
  const contador = new Map<string, number>();
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    llamadas.push({ url, metodo });
    let r = rutas[url];
    if (Array.isArray(r)) {
      const n = contador.get(url) ?? 0;
      contador.set(url, n + 1);
      r = r[Math.min(n, r.length - 1)];
    }
    if (r === undefined) r = url.endsWith("/robots.txt") ? { status: 404 } : { status: 200 };
    if (r instanceof Error) throw r;
    const res = new Response(r.texto ?? "", { status: r.status });
    Object.defineProperty(res, "url", { value: r.url ?? url });
    return res;
  }) as typeof fetch;
  return { fn, llamadas };
}

function nuevo(rutas: Record<string, Respuesta | Respuesta[]>) {
  const { fn, llamadas } = simular(rutas);
  const comprobador = new Comprobador({
    log: new Log(),
    fetch: fn,
    limitador: new LimitadorPorHost({ minMs: 0, maxMs: 0, dormir: async () => {} }),
  });
  return { comprobador, llamadas };
}

const errorRed = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

describe("clasificarEstado", () => {
  it("separa OK, fallos e inconclusos", () => {
    expect(clasificarEstado(200)).toBe("ok");
    expect(clasificarEstado(301)).toBe("ok");
    expect(clasificarEstado(404)).toBe("fallo");
    expect(clasificarEstado(410)).toBe("fallo");
    expect(clasificarEstado(500)).toBe("fallo");
    expect(clasificarEstado(403)).toBe("inconcluso");
    expect(clasificarEstado(401)).toBe("inconcluso");
    expect(clasificarEstado(429)).toBe("inconcluso");
  });
});

describe("Comprobador", () => {
  it("usa HEAD si responde bien y guarda la URL final", async () => {
    const { comprobador, llamadas } = nuevo({
      "https://a.test/x": { status: 200, url: "https://a.test/x/" },
    });
    const r = await comprobador.comprobar("https://a.test/x");
    expect(r).toEqual({ resultado: "ok", http: 200, error: null, urlFinal: "https://a.test/x/", metodo: "HEAD" });
    expect(llamadas.map((l) => `${l.metodo} ${l.url}`)).toEqual([
      "GET https://a.test/robots.txt",
      "HEAD https://a.test/x",
    ]);
  });

  it("repite con GET si el HEAD no vale (405)", async () => {
    const { comprobador } = nuevo({ "https://a.test/x": [{ status: 405 }, { status: 200 }] });
    const r = await comprobador.comprobar("https://a.test/x");
    expect(r?.resultado).toBe("ok");
    expect(r?.metodo).toBe("GET");
  });

  it("un 404 en HEAD y GET es fallo", async () => {
    const { comprobador } = nuevo({ "https://a.test/x": { status: 404 } });
    const r = await comprobador.comprobar("https://a.test/x");
    expect(r).toMatchObject({ resultado: "fallo", http: 404, metodo: "GET", error: "HTTP 404" });
  });

  it("un error de red en HEAD y GET es fallo, aunque robots.txt tampoco responda", async () => {
    const e = errorRed("ENOTFOUND");
    const { comprobador } = nuevo({ "https://muerta.test/robots.txt": e, "https://muerta.test/": e });
    const r = await comprobador.comprobar("https://muerta.test/");
    expect(r).toMatchObject({ resultado: "fallo", http: null, error: "ENOTFOUND", metodo: "GET" });
  });

  it("403 es inconcluso", async () => {
    const { comprobador } = nuevo({ "https://a.test/x": { status: 403 } });
    expect((await comprobador.comprobar("https://a.test/x"))?.resultado).toBe("inconcluso");
  });

  it("respeta robots.txt: no pide la URL y lo deja inconcluso", async () => {
    const { comprobador, llamadas } = nuevo({
      "https://a.test/robots.txt": { status: 200, texto: "User-agent: *\nDisallow: /privado/" },
    });
    const r = await comprobador.comprobar("https://a.test/privado/foto.jpg");
    expect(r).toMatchObject({ resultado: "inconcluso", error: "robots.txt no lo permite" });
    expect(llamadas).toHaveLength(1);
  });

  it("un robots.txt con 5xx deja el host inconcluso (RFC 9309)", async () => {
    const { comprobador } = nuevo({ "https://a.test/robots.txt": { status: 503 } });
    expect((await comprobador.comprobar("https://a.test/x"))?.resultado).toBe("inconcluso");
  });

  it("descarga robots.txt una vez por origen", async () => {
    const { comprobador, llamadas } = nuevo({});
    await comprobador.comprobar("https://a.test/1");
    await comprobador.comprobar("https://a.test/2");
    expect(llamadas.filter((l) => l.url.endsWith("/robots.txt"))).toHaveLength(1);
  });

  it("un 429 pausa el host el resto de la ejecución", async () => {
    const { comprobador, llamadas } = nuevo({ "https://a.test/1": { status: 429 } });
    expect((await comprobador.comprobar("https://a.test/1"))?.resultado).toBe("inconcluso");
    expect(await comprobador.comprobar("https://a.test/2")).toBeNull();
    expect(llamadas.some((l) => l.url === "https://a.test/2")).toBe(false);
  });

  it("una URL mal formada es fallo sin peticiones", async () => {
    const { comprobador, llamadas } = nuevo({});
    expect((await comprobador.comprobar("https://"))?.resultado).toBe("fallo");
    expect(llamadas).toHaveLength(0);
  });
});

describe("comprobarTodos", () => {
  it("comprueba todo y respeta el presupuesto", async () => {
    const { comprobador } = nuevo({});
    const items = ["https://a.test/1", "https://a.test/2", "https://b.test/1"].map((url) => ({ url }));
    const vistos: string[] = [];
    const r = await comprobarTodos(comprobador, items, async (it) => {
      vistos.push(it.url);
    });
    expect(r).toEqual({ comprobados: 3, pendientes: 0 });
    expect(vistos.sort()).toEqual(items.map((i) => i.url).sort());

    let quedan = 1;
    const r2 = await comprobarTodos(comprobador, items, async () => {}, { paralelo: 1, seguir: () => quedan-- > 0 });
    expect(r2).toEqual({ comprobados: 1, pendientes: 2 });
  });
});

describe("describirError", () => {
  it("resume errores de red y timeouts", () => {
    expect(describirError(errorRed("ECONNREFUSED"))).toBe("ECONNREFUSED");
    expect(describirError(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe("Tiempo de espera agotado");
  });
});
