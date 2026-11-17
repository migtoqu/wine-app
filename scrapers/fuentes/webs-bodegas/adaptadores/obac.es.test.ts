import { describe, expect, it } from "vitest";
import adaptador from "./obac.es.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador obac.es", () => {
  const prueba = {
    web: "https://www.obac.es/",
    paginas: {
      "https://www.obac.es/es_ES/vino/miserere": fixture("obac-miserere.html"),
    },
  };

  it("Clos de l'Obac: ficha en español con 1 evidencia", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Miserere", "tipo": "tinto"}),
    ]);
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
