import { describe, expect, it } from "vitest";
import { destacarPremios, premiosDeAnada, sortPremios } from "./awards";
import type { Premio } from "./types";

const cmb = { slug: "cmb", nombre: "CMB", tipo: "concurso" as const, escala_max: null, orden: 20 };
const guia = { slug: "g", nombre: "Guía", tipo: "guia" as const, escala_max: 100, orden: 10 };
const p = (o: Partial<Premio>): Premio => ({
  id: Math.random().toString(), anio: 2020, edicion: 2024, medalla: null, puntos: null, distincion: null,
  mencion: null, url: null, certamen: cmb, ...o,
});

describe("premios en la ficha", () => {
  it("ordena por edición y, dentro, por distinción", () => {
    const a = p({ id: "a", edicion: 2023, medalla: "gran_oro" });
    const b = p({ id: "b", edicion: 2025, medalla: "plata" });
    const c = p({ id: "c", edicion: 2025, medalla: "oro" });
    expect(sortPremios([a, b, c]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("destaca primero la mejor distinción y luego los puntos", () => {
    const a = p({ id: "a", edicion: 2025, medalla: "plata" });
    const b = p({ id: "b", edicion: 2019, medalla: "gran_oro" });
    const c = p({ id: "c", certamen: guia, puntos: 95 });
    expect(destacarPremios([a, b, c], 2).map((x) => x.id)).toEqual(["b", "a"]);
    expect(destacarPremios([c, p({ id: "d", certamen: guia, puntos: 97 })], 1)[0]!.id).toBe("d");
  });

  it("filtra por añada", () => {
    expect(premiosDeAnada([p({ anio: 2020 }), p({ anio: null })], null)).toHaveLength(1);
  });
});
