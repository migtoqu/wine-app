import { describe, expect, it } from "vitest";
import campillo from "./bodegascampillo.com.ts";
import faustino from "./bodegasfaustino.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

const listado = (fichas: string[]) => `<html><body><main><h1>Nuestros vinos</h1>${fichas.map((u) => `<a href="${u}">${u}</a>`).join("")}</main></body></html>`;

describe("Familia Martínez Zabala (Faustino, Campillo)", () => {
  it("Faustino: nombre de `.nws h2`, grado de #winedata, sin añadas de los premios; /es/wines/ no se pide", async () => {
    const web = "https://www.bodegasfaustino.com/";
    const ficha = "https://www.bodegasfaustino.com/es/vino/faustino-crianza";
    const paginas = {
      "https://www.bodegasfaustino.com/es/nuestros-vinos": listado([ficha, "https://www.bodegasfaustino.com/es/wines/faustino-crianza"]),
      [ficha]: fixture("bodegasfaustino-crianza.html"),
    };
    const r = await rastrearCon(faustino, { web, paginas });
    expect(r.extractor).toMatch(/^adaptador:bodegasfaustino\.com@v1/);
    expect(r.vinos).toHaveLength(1);
    expect(r.vinos[0]).toMatchObject({ nombre: "Faustino Crianza", tipo: "tinto", grado: 14, anio: null });
    expect(r.vinos[0]!.variedades.map((v) => v.nombre)).toContain("Tempranillo");
    expect(r.vinos[0]!.denominacion?.denominacion?.slug).toBe("rioja");
    expect(r.vinos[0]!.imagen?.url).toBe("https://www.bodegasfaustino.com/img/web/big.portrait.faustino-crianza-2022.png");
    expect(r.pedidas).not.toContain("https://www.bodegasfaustino.com/es/wines/faustino-crianza");
    // Sin adaptador, el h1 «Bodegas Faustino» deja la ficha sin vino.
    const sin = await rastrearCon(faustino, { web, paginas, conAdaptador: false });
    expect(sin.vinos).toHaveLength(0);
  });

  it("Campillo: misma plantilla; los enlaces rotos bajo /es/vino/ no son fichas", async () => {
    const web = "https://www.bodegascampillo.com/";
    const ficha = "https://www.bodegascampillo.com/es/vino/campillo-gran-reserva";
    const r = await rastrearCon(campillo, {
      web,
      paginas: {
        "https://www.bodegascampillo.com/es/vinos": listado([ficha, "https://www.bodegascampillo.com/es/vino/aviso-legal", "https://www.bodegascampillo.com/es/vino/vinedos"]),
        [ficha]: fixture("bodegascampillo-gran-reserva.html"),
      },
    });
    expect(r.vinos.map((v) => v.nombre)).toEqual(["Campillo Gran Reserva"]);
    expect(r.vinos[0]).toMatchObject({ tipo: "tinto", crianza: "gran_reserva", grado: 14 });
    expect(r.pedidas).not.toContain("https://www.bodegascampillo.com/es/vino/aviso-legal");
  });
});
