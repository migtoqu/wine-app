import { describe, expect, it } from "vitest";
import adaptador from "./ajv.wine.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador ajv.wine", () => {
  const prueba = {
    web: "https://ajv.wine/",
    paginas: {
      "https://ajv.wine/es/vins/tentiber/": fixture("ajv-tentiber.html"),
    },
  };

  it("AJV: fichas en español de /es/vins/, no la tienda en catalán", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Tentiber", "tipo": "tinto", "grado": 14.5}),
    ]);
  });

  it("descubre las fichas en español por el listado /es/vinos/ (la portada enlaza a la tienda en catalán)", async () => {
    const ficha = "https://ajv.wine/es/vins/tentiber/";
    const portada = `<html><head><title>AJV</title></head><body><main><p>Viticultors a Porrera.</p><a href="https://ajv.wine/aviso-legal/">Avís legal</a><a href="https://ajv.wine/botiga/">Botiga</a></main></body></html>`;
    const paginas = { "https://ajv.wine/": portada, "https://ajv.wine/es/vinos/": `<html><body><main><a href="${ficha}">Tentiber</a></main></body></html>`, [ficha]: fixture("ajv-tentiber.html") };
    const con = await rastrearCon(adaptador, { web: "https://ajv.wine/", paginas });
    expect(con.vinos.map((v) => v.nombre)).toEqual(["Tentiber"]);
    const sin = await rastrearCon(adaptador, { web: "https://ajv.wine/", paginas, conAdaptador: false });
    expect(sin.vinos).toHaveLength(0);
  });
});
