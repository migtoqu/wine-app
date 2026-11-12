import { describe, expect, it } from "vitest";
import adaptador from "./sinforianobodegas.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador sinforianobodegas.com", () => {
  const prueba = {
    web: "https://sinforianobodegas.com/",
    paginas: {
      "https://sinforianobodegas.com/sinfo-roble/": fixture("sinforiano-sinfo-roble.html"),
    },
  };

  it("Sinforiano: h1 de la bodega; nombre del <title>, etiquetas y valores en <div>", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Sinfo Roble", "tipo": "tinto", "crianza": "roble", "anio": 2022, "grado": 14}),
    ]);
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
