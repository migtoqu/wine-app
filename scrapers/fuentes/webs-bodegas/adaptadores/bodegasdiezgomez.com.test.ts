import { describe, expect, it } from "vitest";
import adaptador from "./bodegasdiezgomez.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador bodegasdiezgomez.com", () => {
  const prueba = {
    web: "https://www.bodegasdiezgomez.com/",
    paginas: {
      "https://www.bodegasdiezgomez.com/productos/jota/la_jota_de_to_crianza_12_meses_barrica": fixture("diezgomez-jota-crianza.html"),
    },
  };

  it("Díez Gómez: nombre de .productos_ficha_nombre, precio y D.O. Toro", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:/);
    expect(r.vinos).toEqual([
      expect.objectContaining({"nombre": "la JOTA de To Crianza 12 meses Barrica", "tipo": "tinto", "crianza": "crianza", "barrica_meses": 12}),
    ]);
    expect(r.vinos[0]!.ofertas[0]).toMatchObject({ precio: 16, unidades: 1 });
    expect(r.vinos[0]!.denominacion?.denominacion?.slug).toBe("toro");
  });

  it("sin el adaptador, el genérico saca menos vinos de la misma ficha", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.length).toBeLessThan(1);
  });

  it("normaliza los enlaces relativos encadenados a la ficha real y deja fuera menús, vermut y destilados", () => {
    const c = adaptador.rutas!.canonica!;
    expect(c("https://www.bodegasdiezgomez.com/productos/jota/productos/americo/americo_crianza_2021")).toBe("https://www.bodegasdiezgomez.com/productos/americo/americo_crianza_2021");
    expect(c("https://www.bodegasdiezgomez.com/productos/vermutto/vermutto_rojo")).toBeNull();
    const ficha = (u: string) => adaptador.rutas!.patronFicha!.test(u) && !adaptador.rutas!.excluir!.test(u);
    expect(ficha(c("https://www.bodegasdiezgomez.com/productos/americo/lab")!)).toBe(false);
    expect(ficha("https://www.bodegasdiezgomez.com/productos/jota/la_jota_de_to_crianza_12_meses_barrica")).toBe(true);
  });

  it("descubre la ficha desde el listado de la gama aunque el enlace venga encadenado", async () => {
    const real = "https://www.bodegasdiezgomez.com/productos/jota/la_jota_de_to_crianza_12_meses_barrica";
    const encadenada = "https://www.bodegasdiezgomez.com/productos/jota/productos/jota/la_jota_de_to_crianza_12_meses_barrica";
    const portada = `<html><head><title>Bodegas Díez Gómez</title></head><body><main><p>Bodega en Toro.</p><a href="https://www.bodegasdiezgomez.com/aviso-legal/">Aviso legal</a></main></body></html>`;
    const r = await rastrearCon(adaptador, {
      web: "https://www.bodegasdiezgomez.com/",
      paginas: {
        "https://www.bodegasdiezgomez.com/": portada,
        "https://www.bodegasdiezgomez.com/productos/jota": `<html><body><main><a href="${encadenada}">Crianza</a></main></body></html>`,
        [real]: fixture("diezgomez-jota-crianza.html"),
      },
    });
    expect(r.vinos.map((v) => v.url)).toEqual([real]);
    expect(r.pedidas).not.toContain(encadenada);
  });
});
