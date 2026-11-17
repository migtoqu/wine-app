import { describe, expect, it } from "vitest";
import adaptador from "./bodegas-lozano.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador bodegas-lozano.com", () => {
  const ficha = "https://bodegas-lozano.com/producto/marques-de-toledo-verdejo/";
  const portada = `<html><head><title>Bodegas Lozano</title><link rel="https://api.w.org/" href="https://bodegas-lozano.com/wp-json/"></head><body class="woocommerce"><main><p>Bodega familiar.</p><a href="https://bodegas-lozano.com/aviso-legal/">Aviso legal</a></main></body></html>`;
  // Store API: nombre y precio, descripción vacía y categoría que no dice «vino» (lo que se ve en producción).
  const productos = JSON.stringify([
    { id: 7, name: "Marqués de Toledo Verdejo", permalink: ficha, short_description: "", description: "", categories: [{ name: "La Mancha", slug: "la-mancha" }], prices: { price: "600", regular_price: "600", currency_code: "EUR", currency_minor_unit: 2 }, is_in_stock: true },
  ]);
  const paginas = {
    "https://bodegas-lozano.com/": portada,
    "https://bodegas-lozano.com/wp-json/wc/store/v1/products?per_page=100&page=1": productos,
    [ficha]: fixture("lozano-marques-de-toledo-verdejo.html"),
  };

  it("fichaHtmlWoo: el HTML del producto completa el de la Store API (tipo, grado, uva) y se queda su precio", async () => {
    const r = await rastrearCon(adaptador, { web: "https://bodegas-lozano.com/", paginas });
    expect(r.extractor).toMatch(/^adaptador:bodegas-lozano\.com@v1\+woocommerce/);
    expect(r.vinos).toEqual([expect.objectContaining({ nombre: "Marqués de Toledo Verdejo", tipo: "blanco", grado: 12 })]);
    expect(r.vinos[0]!.variedades.map((v) => v.nombre)).toEqual(["Verdejo"]);
    expect(r.vinos[0]!.ofertas[0]).toMatchObject({ precio: 6, moneda: "EUR", disponible: true });
    expect(r.pedidas).toContain(ficha);
  });

  it("sin el adaptador, el producto de la Store API no llega a vino", async () => {
    const r = await rastrearCon(adaptador, { web: "https://bodegas-lozano.com/", paginas, conAdaptador: false });
    expect(r.vinos).toHaveLength(0);
  });
});
