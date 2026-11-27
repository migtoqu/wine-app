import { describe, expect, it } from "vitest";
import adaptador, { nombreMazuela } from "./bodegasmazuela.com.ts";
import { fixture, rastrearCon } from "./prueba.ts";

describe("adaptador bodegasmazuela.com", () => {
  const prueba = {
    web: "https://www.bodegasmazuela.com/",
    paginas: {
      "https://www.bodegasmazuela.com/vinos/liante/": fixture("bodegasmazuela-liante.html"),
      "https://www.bodegasmazuela.com/vinos/la-hoya-de-mazuela-2/": fixture("bodegasmazuela-la-hoya.html"),
      "https://www.bodegasmazuela.com/vinos/todo-va-a-salir-bien/": fixture("bodegasmazuela-todo-va-a-salir-bien.html"),
    },
  };

  it("fichas de /vinos/ con el nombre del <title>", async () => {
    const r = await rastrearCon(adaptador, prueba);
    expect(r.extractor).toMatch(/^adaptador:bodegasmazuela\.com@v1/);
    expect(r.vinos.map((v) => [v.nombre, v.anio, v.tipo, v.crianza, v.barrica_meses])).toEqual([
      ["Liante Semicrianza", 2023, "tinto", null, 9],
      ["La Hoya de Mazuela Reserva Especial", 2014, "tinto", "reserva", 40],
      ["Todo Va a Salir Bien Rosado Especial", 2024, "rosado", null, null],
    ]);
    expect(r.vinos[0]!.variedades.map((x) => x.nombre)).toEqual(["Tempranillo"]);
    expect(r.vinos[0]!.imagen?.url).toBe("https://www.bodegasmazuela.com/wp-content/uploads/2017/03/liante-nuestrosvinos_.jpg");
  });

  it("sin el adaptador, el genérico no saca los vinos", async () => {
    const sin = await rastrearCon(adaptador, { ...prueba, conAdaptador: false });
    expect(sin.vinos).toHaveLength(0);
  });

  it("limpia el <title>", () => {
    expect(nombreMazuela("3.- LIANTE SEMICRIANZA 2023 (Caja de 6 Botellas de 0,75 l) - Bodegas Mazuela")).toEqual({ nombre: "Liante Semicrianza", anio: 2023 });
    expect(nombreMazuela("2.- CORAZÓN INDOMABLE 2025(Caja de 6 bot de 0,75 l) - Bodegas Mazuela")).toEqual({ nombre: "Corazón Indomable", anio: 2025 });
    expect(nombreMazuela("6.- LA HOYA DE MAZUELA RESERVA ESPECIAL - Bodegas Mazuela")).toEqual({ nombre: "La Hoya de Mazuela Reserva Especial", anio: null });
    expect(nombreMazuela("5.- TODO VA A SALIR BIEN ROSADO ESPECIAL 24 (Caja de 6 Bot de 0,75l) - Bodegas Mazuela")).toEqual({ nombre: "Todo Va a Salir Bien Rosado Especial", anio: 2024 });
  });
});
