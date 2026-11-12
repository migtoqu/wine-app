import { describe, expect, it } from "vitest";
import adaptador from "./senoriodelibano.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador senoriodelibano.com", () => {
  const prueba = {
    web: "https://www.senoriodelibano.com/",
    paginas: {
      "https://tienda.senoriodelibano.com/es/vinos/comprar-digma-graciano-6-botellas": fixture("senoriodelibano-digma-graciano-6.html"),
    },
  };

  it("Señorío de Líbano: misma tienda; caja de 6 botellas y grado de .winechar", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Digma Graciano", "tipo": "tinto", "grado": 14}),
    ]);
    expect(r.vinos[0]!.ofertas[0]).toMatchObject({ precio: 270, unidades: 6 });
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
