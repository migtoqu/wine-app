import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ejecutar, type Scraper } from "./ejecucion.ts";

const salida = () => ({ dryRun: true, limite: null, rutaSalida: join(tmpdir(), `ejecucion-test-${Math.random()}.json`) });

describe("código de salida de ejecutar()", () => {
  it("sale con 0 si todo va bien", async () => {
    expect(await ejecutar("prueba", async () => {}, salida())).toBe(0);
  });

  it("un corte esperado (presupuesto/tope) sin errores sale con 0", async () => {
    const scraper: Scraper = async (ctx) => ctx.marcarParcial("Presupuesto agotado", { esperado: true });
    expect(await ejecutar("prueba", scraper, salida())).toBe(0);
  });

  it("un motivo inesperado sale con 2 aunque también haya uno esperado", async () => {
    const scraper: Scraper = async (ctx) => {
      ctx.marcarParcial("Presupuesto agotado", { esperado: true });
      ctx.marcarParcial("Volumen anómalo");
    };
    expect(await ejecutar("prueba", scraper, salida())).toBe(2);
  });

  it("un corte esperado con errores de ficha sale con 2", async () => {
    const scraper: Scraper = async (ctx) => {
      ctx.contadores.errores++;
      ctx.marcarParcial("Tope alcanzado", { esperado: true });
    };
    expect(await ejecutar("prueba", scraper, salida())).toBe(2);
  });
});
