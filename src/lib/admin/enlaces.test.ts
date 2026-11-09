import { describe, expect, it } from "vitest";
import { clasificarEstado, comprobarUrl, formatDuracion, vistaEnlaces } from "./enlaces";

function fetchDe(respuestas: (number | Error)[]) {
  const metodos: string[] = [];
  const fn = (async (_url: string, init?: RequestInit) => {
    metodos.push(init?.method ?? "GET");
    const r = respuestas[Math.min(metodos.length - 1, respuestas.length - 1)]!;
    if (r instanceof Error) throw r;
    return new Response("", { status: r });
  }) as unknown as typeof fetch;
  return { fn, metodos };
}

describe("formatDuracion", () => {
  it("formatea segundos, minutos y horas", () => {
    expect(formatDuracion("2026-11-08T10:00:00Z", "2026-11-08T10:00:12Z")).toBe("12 s");
    expect(formatDuracion("2026-11-08T10:00:00Z", "2026-11-08T10:03:07Z")).toBe("3 min 07 s");
    expect(formatDuracion("2026-11-08T10:00:00Z", "2026-11-08T11:05:00Z")).toBe("1 h 05 min");
    expect(formatDuracion("2026-11-08T10:00:00Z", null)).toBeNull();
  });
});

describe("vistaEnlaces", () => {
  it("cae en 'fallando' si no es válida", () => {
    expect(vistaEnlaces("ocultos")).toBe("ocultos");
    expect(vistaEnlaces("x")).toBe("fallando");
  });
});

describe("clasificarEstado", () => {
  it("403 no es fallo", () => {
    expect(clasificarEstado(204)).toBe("ok");
    expect(clasificarEstado(403)).toBe("inconcluso");
    expect(clasificarEstado(404)).toBe("fallo");
  });
});

describe("comprobarUrl", () => {
  it("HEAD correcto: no repite", async () => {
    const { fn, metodos } = fetchDe([200]);
    expect(await comprobarUrl("https://a.test/", { fetchFn: fn })).toMatchObject({ resultado: "ok", metodo: "HEAD" });
    expect(metodos).toEqual(["HEAD"]);
  });

  it("HEAD 405 → GET", async () => {
    const { fn, metodos } = fetchDe([405, 200]);
    expect(await comprobarUrl("https://a.test/", { fetchFn: fn })).toMatchObject({ resultado: "ok", metodo: "GET" });
    expect(metodos).toEqual(["HEAD", "GET"]);
  });

  it("error de red en los dos: fallo con el código", async () => {
    const e = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    const { fn } = fetchDe([e]);
    expect(await comprobarUrl("https://a.test/", { fetchFn: fn })).toMatchObject({
      resultado: "fallo",
      error: "ENOTFOUND",
      metodo: "GET",
    });
  });
});
