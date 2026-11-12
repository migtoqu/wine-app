import { describe, expect, it } from "vitest";
import adaptador from "./pagodecirsus.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador pagodecirsus.com (tienda con vinos de varias bodegas del grupo)", () => {
  const vidure = "https://www.pagodecirsus.com/es/46_vidure.html";
  const irache = "https://www.pagodecirsus.com/es/34_1891-crianza.html";
  const prueba = {
    web: "https://www.pagodecirsus.com/",
    paginas: { [vidure]: fixture("pagodecirsus-vidure.html"), [irache]: fixture("pagodecirsus-1891-crianza.html") },
    bodegas: [{ id: "cirsus", nombre: "Bodega Pago de Cirsus", municipio: null }],
  };

  it("la dueña sale de las migas: Vidure es propio; 1891 Crianza es de Irache (revisión)", async () => {
    const r = await rastrearCon(adaptador, prueba);
    const porNombre = Object.fromEntries(r.vinos.map((v) => [v.nombre, v]));
    expect(porNombre["Vidure"]).toMatchObject({ tipo: "tinto", grado: 14.5, bodega_marca: { estado: "propia", bodega: "Pago de Cirsus" } });
    expect(porNombre["1891 Crianza"]).toMatchObject({ crianza: "crianza", bodega_marca: { estado: "otra", bodega: "Irache" } });
    expect(porNombre["1891 Crianza"]!.denominacion?.denominacion?.slug).toBe("navarra");
  });

  it("experiencias y packs no son fichas", () => {
    expect(adaptador.rutas!.excluir!.test("https://www.pagodecirsus.com/es/48_experiencia-cirsus-pago-de-cirsus.html")).toBe(true);
    expect(adaptador.rutas!.patronFicha!.test(vidure)).toBe(true);
  });

  it("sin el adaptador el h1 «Tienda online» deja las fichas sin vino", async () => {
    const r = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(r.vinos).toHaveLength(0);
  });
});
