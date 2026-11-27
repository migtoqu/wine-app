import { describe, expect, it } from "vitest";
import { interpretarConsulta, nombreSinBodega } from "./cava-busqueda";

describe("interpretarConsulta", () => {
  it("separa meses y deja las palabras para buscar", () => {
    const r = interpretarConsulta("Dehesa de los Canónigos 15 meses cosecha roble", 2026);
    expect(r).toEqual({
      palabras: ["dehesa", "canonigos", "roble"],
      texto: "Dehesa de los Canónigos cosecha roble",
      anio: null,
      meses: 15,
      formato_ml: null,
      cantidad: null,
    });
  });

  it("reconoce añada, formato y cantidad en cualquier orden", () => {
    const r = interpretarConsulta("x6 Pesquera crianza cosecha 2019 mágnum", 2026);
    expect(r).toMatchObject({
      palabras: ["pesquera", "crianza"],
      texto: "Pesquera crianza",
      anio: 2019,
      formato_ml: 1500,
      cantidad: 6,
    });
  });

  it("entiende otras formas de cantidad y formato", () => {
    expect(interpretarConsulta("Muga reserva 2018 caja de 12")).toMatchObject({ cantidad: 12, anio: 2018 });
    expect(interpretarConsulta("Protos roble 3 botellas")).toMatchObject({ cantidad: 3, palabras: ["protos", "roble"] });
    expect(interpretarConsulta("Viña Ardanza media botella")).toMatchObject({ formato_ml: 375 });
    expect(interpretarConsulta("Vega Sicilia Único 1,5 l")).toMatchObject({ formato_ml: 1500 });
    expect(interpretarConsulta("Cava brut doble mágnum")).toMatchObject({ formato_ml: 3000, palabras: ["cava", "brut"] });
  });

  it("no toma por añada números que no lo son", () => {
    expect(interpretarConsulta("Protos 27", 2026)).toMatchObject({ anio: null, palabras: ["protos", "27"] });
    expect(interpretarConsulta("Marqués de Riscal 150 aniversario", 2026)).toMatchObject({ anio: null });
    expect(interpretarConsulta("Vino 2099", 2026)).toMatchObject({ anio: null });
  });

  it("sin texto útil devuelve listas vacías", () => {
    expect(interpretarConsulta("   de la  ")).toMatchObject({ palabras: [], anio: null });
  });
});

describe("nombreSinBodega", () => {
  it("quita la bodega del texto escrito", () => {
    expect(nombreSinBodega("Dehesa de los Canonigos roble", "Dehesa de los Canónigos")).toBe("roble");
    expect(nombreSinBodega("Muga selección", "Bodegas Muga")).toBe("selección");
  });

  it("si no queda nada o no aparece, devuelve el texto", () => {
    expect(nombreSinBodega("Bodegas Muga", "Bodegas Muga")).toBe("Bodegas Muga");
    expect(nombreSinBodega("Pesquera", "Bodegas Muga")).toBe("Pesquera");
  });
});
