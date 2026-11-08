import { describe, expect, it } from "vitest";
import { leerRegistroRevision } from "./revision";

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";

describe("leerRegistroRevision", () => {
  it("ficha de bodega (Consejo Regulador) con candidatas", () => {
    const r = leerRegistroRevision({
      campos: { nombre: "Alto Bodegas" },
      emparejamiento: { candidatos: [{ id: B1, nombre: "Aalto", puntuacion: 0.8, motivo: "nombre_similar" }] },
    });
    expect(r).toEqual({
      tipo: "bodega",
      nombre: "Alto Bodegas",
      candidatos: [{ id: B1, nombre: "Aalto", puntuacion: 0.8, motivo: "nombre_similar" }],
      vinos: [],
      motivo: null,
    });
  });

  it("ficha de vino con vinos parecidos y motivo; omite bodegas suprimidas e ids raros", () => {
    const r = leerRegistroRevision({
      nombre: "Legaris Crianzza 2021",
      emparejamiento: {
        motivo: "vino parecido en la bodega",
        candidatos: [{ id: B1, nombre: "Legaris" }, { id: "supresion:x", nombre: "Borrada" }, { id: 3 }],
        vinos: [{ id: B2, nombre: "Legaris Crianza", puntuacion: 0.9 }],
      },
    });
    expect(r.tipo).toBe("vino");
    expect(r.candidatos.map((c) => c.id)).toEqual([B1]);
    expect(r.vinos).toEqual([{ id: B2, nombre: "Legaris Crianza", puntuacion: 0.9, motivo: null }]);
    expect(r.motivo).toBe("vino parecido en la bodega");
  });

  it("tolera datos vacíos", () => {
    expect(leerRegistroRevision(null)).toEqual({ tipo: "vino", nombre: "—", candidatos: [], vinos: [], motivo: null });
  });
});
