import { describe, expect, it } from "vitest";
import adaptador from "./bodegamartinezyebra.es.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador bodegamartinezyebra.es", () => {
  const prueba = {
    web: "https://www.bodegamartinezyebra.es/",
    paginas: {
      "https://www.bodegamartinezyebra.es/index.php?seccion=vinos&id=7": fixture("martinezyebra-canes-blanco.html"),
    },
  };

  it("Martínez Yebra: mismo <title> en todas las fichas; nombre y añada del h1", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Canes Blanco", "anio": 2018, "tipo": "blanco"}),
    ]);
    expect(r.vinos[0]!.denominacion?.denominacion?.slug).toBe("bierzo");
  });

  it("dos fichas con el mismo <title>: el genérico las funde en un vino; el adaptador da las dos", async () => {
    const dos = { ...prueba, paginas: { ...prueba.paginas, "https://www.bodegamartinezyebra.es/index.php?seccion=vinos&id=1": fixture("martinezyebra-canes-tinto.html") } };
    const con = await rastrearCon(adaptador, dos);
    expect(con.vinos.map((v) => [v.nombre, v.anio])).toEqual([["Canes Blanco", 2018], ["Canes Tinto Mencía", 2017]]);
    const sin = await rastrearCon(adaptador, { ...dos, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(2);
  });
});
