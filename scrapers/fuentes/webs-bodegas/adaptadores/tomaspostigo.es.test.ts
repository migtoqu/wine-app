import { describe, expect, it } from "vitest";
import adaptador from "./tomaspostigo.es.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador tomaspostigo.es", () => {
  const prueba = {
    web: "https://tomaspostigo.es/",
    paginas: {
      "https://tomaspostigo.es/anada/rebollo-2019/": fixture("tomaspostigo-rebollo-2019.html"),
      "https://tomaspostigo.es/anada/verdejo-23-f-b/": fixture("tomaspostigo-verdejo-23-fb.html"),
    },
  };

  it("Tomás Postigo: ficha en pestañas JetTabs (también la oculta); «Verdejo 23 F.B.» → «Verdejo F.B.» 2023", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Rebollo", "anio": 2019, "tipo": "tinto", "grado": 15, "barrica_meses": 12}),
      expect.objectContaining({"nombre": "Verdejo F.B.", "anio": 2023, "tipo": "blanco", "grado": 14}),
    ]);
    expect(r.vinos.find((v) => v.nombre === "Rebollo")!.variedades.map((x) => x.nombre)).toContain("Tempranillo");
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(2);
  });
});
