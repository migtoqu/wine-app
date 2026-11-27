import { describe, expect, it } from "vitest";
import adaptador from "./bodegacigales.es.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador bodegacigales.es", () => {
  const prueba = {
    web: "https://bodegacigales.es/",
    paginas: {
      "https://bodegacigales.es/gran_torondos_cigales/": fixture("bodegacigales-gran-torondos.html"),
      "https://bodegacigales.es/torondos_cigales/": fixture("bodegacigales-torondos.html"),
    },
  };

  it("un vino por columna de las páginas de gama", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:bodegacigales\.es@v1/);
    expect(r.vinos.map((v) => [v.nombre, v.tipo, v.crianza, v.barrica_meses])).toEqual([
      ["Gran Torondos Tinto", "tinto", null, null],
      ["Gran Torondos Rosado Cigales", "rosado", null, null],
      ["Gran Torondos Verdejo Cigales", "blanco", null, null],
      ["Torondos Clarete", "rosado", null, null],
      ["Torondos Verdejo Cigales", "blanco", null, null],
      ["Torondos Rosé", "rosado", null, null],
      ["Torondos Tinto", "tinto", null, null],
      ["Torondos Verdejo Rueda", "blanco", null, null],
      ["Torondos Crianza", "tinto", "crianza", 14],
    ]);
    expect(r.vinos[0]!.variedades.map((x) => [x.nombre, x.porcentaje])).toEqual([["Tempranillo", 90], ["Garnacha Tinta", 10]]);
    expect(r.vinos.some((v) => /gama/i.test(v.nombre))).toBe(false);
    // El verdejo de Rueda lleva su D.O. aunque la ficha no traiga la sigla; el resto, Cigales.
    const dos = Object.fromEntries(r.vinos.map((v) => [v.nombre, v.denominacion?.denominacion?.slug ?? null]));
    expect(dos["Torondos Verdejo Rueda"]).toBe("rueda");
    expect(dos["Torondos Verdejo Cigales"]).toBe("cigales");
    expect(dos["Gran Torondos Rosado Cigales"]).toBe("cigales");
  });

  it("sin el adaptador, el genérico no saca los vinos", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos).toHaveLength(0);
  });
});
