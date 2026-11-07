import { describe, expect, it } from "vitest";
import { normalizeText } from "./text";

describe("normalizeText", () => {
  it("quita tildes y pasa a minúsculas", () => {
    expect(normalizeText("Ribera del Duero")).toBe("ribera del duero");
    expect(normalizeText("Albariño Crianza")).toBe("albarino crianza");
    expect(normalizeText("Pingüino")).toBe("pinguino");
  });

  it("colapsa espacios y recorta los extremos", () => {
    expect(normalizeText("  Vega   Sicilia \n")).toBe("vega sicilia");
  });

  it("devuelve cadena vacía para entradas vacías", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText("   ")).toBe("");
  });
});
