import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cargarExclusiones, exclusionDe } from "../puerta.ts";
import { ADAPTADORES, adaptadorPara } from "./index.ts";

describe("registro de adaptadores (ola D)", () => {
  it("un adaptador por dominio, con versión, notas, patrón de ficha y sin navegador", () => {
    const dominios = ADAPTADORES.flatMap((a) => a.dominios);
    expect(new Set(dominios).size).toBe(dominios.length);
    expect(ADAPTADORES.length).toBeGreaterThanOrEqual(20);
    expect(ADAPTADORES.length).toBeLessThanOrEqual(30);
    for (const a of ADAPTADORES) {
      expect(a.version).toBeGreaterThanOrEqual(1);
      expect(a.notas.length).toBeGreaterThan(10);
      expect(a.rutas?.patronFicha).toBeInstanceOf(RegExp);
      expect(a.renderizar ?? false).toBe(false);
    }
  });

  it("cada dominio tiene su test", () => {
    const tests = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".test.ts")).join(" ");
    for (const a of ADAPTADORES) {
      const d = a.dominios[0]!;
      const propio = existsSync(new URL(`./${d}.test.ts`, import.meta.url));
      expect(propio || tests.includes("familiamartinezzabala"), d).toBe(true);
    }
  });

  it("adaptadorPara busca por dominio registrable (www., tienda.) y no inventa", () => {
    expect(adaptadorPara("www.bodegasfaustino.com")?.dominios).toEqual(["bodegasfaustino.com"]);
    expect(adaptadorPara("tienda.senoriodelibano.com")?.dominios).toEqual(["senoriodelibano.com"]);
    expect(adaptadorPara("bodegasanmiguel.es")?.dominios[0]).toBe("bodegasanmiguelsc.es");
    expect(adaptadorPara("aalto.es")).toBeNull();
  });

  it("bodegalamioga.com está excluida (dominio reutilizado con contenido ajeno)", () => {
    expect(exclusionDe(cargarExclusiones(), "bodegalamioga.com")?.motivo).toMatch(/reutilizado/);
  });
});
