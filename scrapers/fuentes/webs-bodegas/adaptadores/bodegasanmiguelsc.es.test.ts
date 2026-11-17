import { describe, expect, it } from "vitest";
import adaptador from "./bodegasanmiguelsc.es.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador bodegasanmiguelsc.es", () => {
  const prueba = {
    web: "https://bodegasanmiguel.es/",
    paginas: {
      "https://bodegasanmiguel.es/index.php/es/tienda-d-2/xcolor/product/29-campolosa-tinto-crianza": fixture("sanmiguel-campolosa-crianza.html"),
    },
  };

  it("San Miguel: HikaShop; precio de la fila «botella»", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Campolosa Tinto Crianza", "tipo": "tinto", "crianza": "crianza"}),
    ]);
    expect(r.vinos[0]!.ofertas[0]).toMatchObject({ precio: 4.8, unidades: 1 });
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
