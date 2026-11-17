import { describe, expect, it } from "vitest";
import adaptador from "./bodegasgarciadeolano.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador bodegasgarciadeolano.com", () => {
  const prueba = {
    web: "http://www.bodegasgarciadeolano.com/",
    paginas: {
      "http://www.bodegasgarciadeolano.com/es/vino/comprar-mauleon-reserva": fixture("garciadeolano-mauleon-reserva.html"),
    },
  };

  it("García de Olano: h1 «Tienda Online …»; nombre de h2.viewWeb y precio de la caja de 3", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Mauleón Reserva", "tipo": "tinto", "crianza": "reserva"}),
    ]);
    expect(r.vinos[0]!.ofertas[0]).toMatchObject({ precio: 36, unidades: 3 });
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });
});
