import { describe, expect, it } from "vitest";
import adaptador from "./alegrevalganon.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador alegrevalganon.com", () => {
  const prueba = {
    web: "https://www.alegrevalganon.com/",
    paginas: {
      "https://www.alegrevalganon.com/seres-vinos/garnacha/": fixture("alegrevalganon-garnacha.html"),
    },
  };

  it("Alegre Valgañón: nombre del h2, con la marca delante si es genérico", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Alegre Valgañón Garnacha", "tipo": "tinto"}),
    ]);
  });

  it("sin el adaptador, el vino no lleva la marca (el h1 es la bodega y el h2 un nombre genérico)", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.map((v) => v.nombre)).not.toContain("Alegre Valgañón Garnacha");
  });
});
