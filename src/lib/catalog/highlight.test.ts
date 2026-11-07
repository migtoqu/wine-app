import { describe, expect, it } from "vitest";
import { highlightParts } from "./highlight";

describe("highlightParts", () => {
  it("resalta sin distinguir tildes ni mayúsculas", () => {
    expect(highlightParts("Viña Pedrosa", "VINA")).toEqual([
      { text: "Viña", match: true },
      { text: " Pedrosa", match: false },
    ]);
  });

  it("resalta cada palabra de la consulta y todas sus apariciones", () => {
    expect(highlightParts("Pago de Carraovejas", "pago carra")).toEqual([
      { text: "Pago", match: true },
      { text: " de ", match: false },
      { text: "Carra", match: true },
      { text: "ovejas", match: false },
    ]);
    expect(highlightParts("Aalto PS Aalto", "aalto").filter((p) => p.match)).toHaveLength(2);
  });

  it("ignora palabras de una letra y devuelve el texto entero si no hay coincidencia", () => {
    expect(highlightParts("Protos", "a")).toEqual([{ text: "Protos", match: false }]);
    expect(highlightParts("Protos", "xyz")).toEqual([{ text: "Protos", match: false }]);
  });
});
