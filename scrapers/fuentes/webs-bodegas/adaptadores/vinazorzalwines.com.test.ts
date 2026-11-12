import { describe, expect, it } from "vitest";
import adaptador from "./vinazorzalwines.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador vinazorzalwines.com", () => {
  const prueba = {
    web: "https://vinazorzalwines.com/",
    paginas: {
      "https://vinazorzalwines.com/products/el-inquilino-crianza": fixture("zorzal-el-inquilino-crianza.html"),
    },
  };

  it("Viña Zorzal: Shopify por HTML, precio del JSON-LD", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "El Inquilino Crianza", "tipo": "tinto", "crianza": "crianza"}),
    ]);
    expect(r.vinos[0]!.ofertas[0]).toMatchObject({ precio: 9.95, unidades: 1 });
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
