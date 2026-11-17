import { describe, expect, it } from "vitest";
import adaptador from "./senoriodelibano.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador senoriodelibano.com (v2, tienda rehecha)", () => {
  const ficha = "https://tienda.senoriodelibano.com/la-roma";
  const portada = `<html><head><title>Señorío de Líbano</title></head><body><main><p>Bodega en Sajazarra.</p><a href="https://www.senoriodelibano.com/aviso-legal/">Aviso legal</a><a href="https://tienda.senoriodelibano.com/es">Tienda</a></main></body></html>`;
  const listado = `<html><body><main><a href="/la-roma">La Roma</a><a href="/envios">Envíos</a><a href="/carrito">Carrito</a></main></body></html>`;
  const paginas = { "https://www.senoriodelibano.com/": portada, "https://tienda.senoriodelibano.com/es": listado, [ficha]: fixture("senoriodelibano-la-roma.html") };

  it("ficha en la raíz de la tienda: h1, ficha técnica y oferta JSON-LD de caja de 6", async () => {
    const r = await rastrearCon(adaptador, { web: "https://www.senoriodelibano.com/", paginas });
    expect(r.vinos).toEqual([expect.objectContaining({ nombre: "La Roma", tipo: "tinto", grado: 14.5 })]);
    expect(r.vinos[0]!.denominacion?.denominacion?.slug).toBe("rioja");
    expect(r.vinos[0]!.ofertas[0]).toMatchObject({ precio: 144, unidades: 6 });
    expect(r.pedidas).not.toContain("https://tienda.senoriodelibano.com/envios");
  });
});
