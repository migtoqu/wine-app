import { describe, expect, it } from "vitest";
import adaptador from "./ribasdelcua.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador ribasdelcua.com", () => {
  const prueba = {
    web: "https://ribasdelcua.com/",
    paginas: {
      "https://ribasdelcua.com/producto/privilegio/": fixture("ribasdelcua-privilegio.html"),
    },
  };

  it("Ribas del Cúa: ficha HTML del producto Woo", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "Privilegio", "tipo": "tinto"}),
    ]);
    expect(r.vinos.find((v) => v.nombre === "Privilegio")!.variedades.map((x) => x.nombre)).toContain("Mencía");
  });

  it("con la Store API de Woo (descripción vacía), solo el adaptador lee la ficha HTML", async () => {
    const ficha = "https://ribasdelcua.com/producto/privilegio/";
    const portada = `<html><head><title>Ribas del Cúa</title><link rel="https://api.w.org/" href="https://ribasdelcua.com/wp-json/"></head><body class="woocommerce"><main><p>Bodega en Cacabelos.</p><a href="https://ribasdelcua.com/aviso-legal/">Aviso legal</a></main></body></html>`;
    const productos = JSON.stringify([{ id: 1, name: "Privilegio", permalink: ficha, short_description: "", description: "", categories: [{ name: "Bierzo", slug: "bierzo" }], prices: { price: "2000", currency_code: "EUR", currency_minor_unit: 2 } }]);
    const paginas = { "https://ribasdelcua.com/": portada, "https://ribasdelcua.com/wp-json/wc/store/v1/products?per_page=100&page=1": productos, [ficha]: fixture("ribasdelcua-privilegio.html") };
    const con = await rastrearCon(adaptador, { web: "https://ribasdelcua.com/", paginas });
    expect(con.vinos).toEqual([expect.objectContaining({ nombre: "Privilegio", tipo: "tinto" })]);
    expect(con.vinos[0]!.ofertas[0]).toMatchObject({ precio: 20 });
    const sin = await rastrearCon(adaptador, { web: "https://ribasdelcua.com/", paginas, conAdaptador: false });
    expect(sin.vinos).toHaveLength(0);
  });
});
