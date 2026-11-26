import { describe, expect, it } from "vitest";
import adaptador from "./dominiolubiano.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador dominiolubiano.com", () => {
  const prueba = {
    web: "https://dominiolubiano.com/",
    paginas: {
      "https://dominiolubiano.com/": fixture("dominiolubiano-portada.html"),
      // Páginas de la plantilla publicadas tal cual: nunca dan vinos.
      "https://dominiolubiano.com/wine-list/": `<html><head><title>Wine list - Laon Wine House</title></head><body><main><h1>Laon Wine House</h1><p>Vino tinto. Uva tempranillo 100%. Crianza en barrica 12 meses. Notas de cata: fruta madura, especias. Cosecha 2016.</p></main></body></html>`,
      "https://dominiolubiano.com/nuestros-vinos/": `<html><head><title>Nuestros vinos - Dominio Lubiano</title></head><body><main><h1>Nuestros vinos</h1></main></body></html>`,
    },
  };

  it("un vino por pestaña de la portada, con su añada, barrica y foto; nada de la plantilla", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:dominiolubiano\.com@v1/);
    expect(r.vinos.map((v) => [v.nombre, v.anio, v.tipo, v.barrica_meses])).toEqual([
      ["Lubiano 6 meses", 2022, "tinto", 6],
      ["Dominio Lubiano", 2019, "tinto", 14],
      ["Lubiano Edición Limitada", 2019, "tinto", 26],
      ["Caminos Blancos", 2019, "tinto", 24],
    ]);
    for (const v of r.vinos) expect(v.variedades.map((x) => x.nombre)).toEqual(["Tempranillo"]);
    expect(r.vinos.some((v) => /laon/i.test(v.nombre))).toBe(false);
    expect(r.vinos[0]!.imagen?.url).toBe("https://dominiolubiano.com/wp-content/uploads/2023/08/IMG_5773-scaled.jpg");
    // La portada sigue siendo la página de historia de la bodega.
    expect(r.paginas.find((p) => p.url === "https://dominiolubiano.com/")?.clase).toBe("historia");
  });

  it("sin el adaptador, el genérico no separa los cuatro vinos", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos.filter((v) => /caminos blancos|edici[oó]n limitada/i.test(v.nombre))).toHaveLength(0);
  });
});
