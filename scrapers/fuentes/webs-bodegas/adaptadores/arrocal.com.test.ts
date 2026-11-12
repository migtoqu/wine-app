import { describe, expect, it } from "vitest";
import adaptador from "./arrocal.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador arrocal.com", () => {
  const prueba = {
    web: "https://arrocal.com/",
    paginas: {
      "https://arrocal.com/es/wine/arrocal-seleccion/": fixture("arrocal-seleccion.html"),
    },
  };

  it("Arrocal: h1 de marca; nombre del <title>", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Arrocal Selección Especial", "tipo": "tinto", "barrica_meses": 18}),
    ]);
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
