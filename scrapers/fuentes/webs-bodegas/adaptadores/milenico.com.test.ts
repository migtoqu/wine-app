import { describe, expect, it } from "vitest";
import adaptador from "./milenico.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador milenico.com", () => {
  const prueba = {
    web: "https://www.milenico.com/",
    paginas: {
      "https://www.milenico.com/es/bodega-y-vinedos-milenico-nuestros-vinos/valdepila": fixture("milenico-valdepila.html"),
    },
  };

  it("Milénico: tabla de ficha técnica", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Valdepila", "tipo": "tinto", "barrica_meses": 12}),
    ]);
    expect(r.vinos[0]!.denominacion?.denominacion?.slug).toBe("ribera-del-duero");
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
