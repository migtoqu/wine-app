import { describe, expect, it } from "vitest";
import adaptador from "./dominiodecair.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador dominiodecair.com", () => {
  const prueba = {
    web: "https://www.dominiodecair.com/",
    paginas: {
      "https://www.dominiodecair.com/vino/cair-cuvee": fixture("dominiodecair-cuvee.html"),
    },
  };

  it("Dominio de Cair: mismo CMS; «85% Tempranillo 15% Merlot» no es el grado", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Cair Cuvée", "tipo": "tinto", "grado": 14, "barrica_meses": 10}),
    ]);
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
