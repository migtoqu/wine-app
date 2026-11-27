import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { edicionesDe, premioDeTarjeta } from "./index.ts";
import { medallaCmb, parsearListado, urlListado } from "./parsear.ts";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

describe("Concours Mondial de Bruxelles: listado", () => {
  it("lee nombre, productor, lugar, D.O., medalla y trofeo de cada tarjeta", () => {
    const { tarjetas, siguiente } = parsearListado(fixture("listado-2026-p1.html"));
    expect(tarjetas).toHaveLength(6);
    expect(tarjetas[0]).toMatchObject({
      id: "248736",
      url: "https://results.concoursmondial.com/es/resultados/2026/248736-salvueros-2025",
      titulo: "Salvueros 2025",
      productor: "Bodegas Hijos de Marcos Gómez SL",
      pais: "España",
      region: "Castilla-y-León",
      denominacion: "Cigales",
      distincion: "Gran Medalla de Oro",
      medalla: "gran_oro",
      mencion: "Vinos Rosados Revelación España",
      categoria: "Vino - Tranquilo",
    });
    // Sin D.O. (Navarra, espumoso): la línea de la D.O. falta, no se corre el resto.
    expect(tarjetas[1]).toMatchObject({ region: "Navarra", denominacion: null, mencion: "Revelación Vino Espumoso de España" });
    // Sin trofeo.
    expect(tarjetas[3]).toMatchObject({ titulo: "Bertola Cream 12 Años", medalla: "gran_oro", mencion: null });
    // Región con guion propio y sin D.O.
    expect(tarjetas[4]).toMatchObject({ region: "Vino de la Tierra / Viñedos de España", denominacion: null, medalla: "oro" });
    // «CMB Merit»: reconocimiento sin medalla, con logo en vez de texto.
    expect(tarjetas[5]).toMatchObject({
      titulo: "Orube Crianza 2020", productor: "Ferrer Wines Group", denominacion: "Rioja",
      distincion: "CMB Merit", medalla: null, mencion: null,
    });
    expect(siguiente).toBe("https://results.concoursmondial.com/es/resultados/2026?search%5Bcountry%5D=Spain&page=2");
  });

  it("ediciones antiguas: medallas en inglés y última página sin siguiente", () => {
    const { tarjetas, siguiente } = parsearListado(fixture("listado-2019-ultima.html"));
    expect(tarjetas.map((t) => [t.distincion, t.medalla])).toEqual([
      ["Grand Gold Medal", "gran_oro"],
      ["Grand Gold Medal", "gran_oro"],
    ]);
    expect(tarjetas[1]!.denominacion).toBe("Rioja DOCa");
    expect(siguiente).toBeNull();
  });

  it("medallas", () => {
    expect(medallaCmb("Medalla de Plata")).toBe("plata");
    expect(medallaCmb("Silver Medal")).toBe("plata");
    expect(medallaCmb("Medalla de Oro")).toBe("oro");
    expect(medallaCmb("Revelación")).toBeNull();
  });

  it("URL del listado de España y ediciones", () => {
    expect(urlListado(2026, 3)).toBe("https://results.concoursmondial.com/es/resultados/2026?search%5Bcountry%5D=Spain&page=3");
    expect(edicionesDe("2019-2021,2025")).toEqual([2019, 2020, 2021, 2025]);
    expect(edicionesDe(undefined, new Date("2026-11-27"))).toEqual([2025, 2026]);
    expect(edicionesDe("todas", new Date("2026-11-27"))).toHaveLength(8);
    expect(() => edicionesDe("2026-")).toThrow();
  });

  it("tarjeta → premio: añada fuera del nombre, tipo y clave por edición", () => {
    const [salvueros, monjardin, , bertola] = parsearListado(fixture("listado-2026-p1.html")).tarjetas;
    expect(premioDeTarjeta(salvueros!, 2026)).toMatchObject({
      idExterno: "2026-248736", nombre: "Salvueros", anio: 2025, edicion: 2026, medalla: "gran_oro", tipo: null,
    });
    expect(premioDeTarjeta(monjardin!, 2026)).toMatchObject({ anio: 2018, tipo: "espumoso" });
    expect(premioDeTarjeta(bertola!, 2026)).toMatchObject({ nombre: "Bertola Cream 12 Años", anio: null, tipo: "generoso" });
  });
});
