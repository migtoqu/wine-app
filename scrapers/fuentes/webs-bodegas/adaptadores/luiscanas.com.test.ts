import { describe, expect, it } from "vitest";
import adaptador from "./luiscanas.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador luiscanas.com", () => {
  const prueba = {
    web: "https://www.luiscanas.com/",
    paginas: {
      "https://www.luiscanas.com/vino/luis-canas-crianza": fixture("luiscanas-crianza.html"),
    },
  };

  it("Luis Cañas: grado sin etiqueta junto al valor; tipo por la uva principal", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Luis Cañas Crianza", "tipo": "tinto", "crianza": "crianza", "grado": 14.5, "barrica_meses": 12}),
    ]);
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
