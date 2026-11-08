import { describe, expect, it } from "vitest";
import { pickResumen, sourcesFor } from "./provenance";
import type { Procedencias, Resumen } from "./types";

const CR = { nombre: "C.R. Ribera del Duero", url_base: "https://www.riberadelduero.es" };
const VS = { nombre: "Vinoselección", url_base: "https://www.vinoseleccion.com" };

const proc: Procedencias = {
  web: { origen: "consejo_regulador", fuente: CR, url: "https://www.riberadelduero.es/bodegas/x", observado_en: "2026-11-02T00:00:00Z" },
  telefono: { origen: "consejo_regulador", fuente: CR, url: null, observado_en: "2026-11-03T00:00:00Z" },
  email: { origen: "admin", fuente: null, url: null, observado_en: "2026-11-05T00:00:00Z" },
  hectareas: { origen: "tienda", fuente: VS, url: null, observado_en: "2026-11-04T00:00:00Z" },
};

describe("sourcesFor", () => {
  it("una línea por fuente con la fecha más reciente y la URL de la ficha", () => {
    expect(sourcesFor(proc, ["web", "telefono", "email"])).toEqual([
      { kind: "fuente", key: CR.nombre, nombre: CR.nombre, url: "https://www.riberadelduero.es/bodegas/x", updatedAt: "2026-11-03T00:00:00Z" },
      { kind: "admin", key: "admin", updatedAt: "2026-11-05T00:00:00Z" },
    ]);
  });

  it("sin URL de ficha usa la de la fuente; ignora campos sin valor o sin procedencia", () => {
    expect(sourcesFor(proc, ["hectareas", "historia"])).toEqual([
      { kind: "fuente", key: VS.nombre, nombre: VS.nombre, url: VS.url_base, updatedAt: "2026-11-04T00:00:00Z" },
    ]);
    expect(sourcesFor(proc, ["web"], () => false)).toEqual([]);
  });
});

describe("pickResumen", () => {
  const r = (campo: string, idioma: "es" | "en"): Resumen => ({ campo, idioma, texto: `${campo}-${idioma}`, fuentes: [] });
  it("idioma pedido, después español; respeta el orden de campos", () => {
    const lista = [r("descripcion", "es"), r("descripcion", "en"), r("historia", "es")];
    expect(pickResumen(lista, ["historia", "descripcion"], "en")?.texto).toBe("historia-es");
    expect(pickResumen(lista, ["descripcion"], "en")?.texto).toBe("descripcion-en");
    expect(pickResumen([], ["descripcion"], "es")).toBeNull();
  });
});
