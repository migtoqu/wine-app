import { describe, expect, it } from "vitest";
import {
  ENTIDADES_FAVORITO,
  ENTIDADES_NOTA,
  NOTA_MAX,
  parseEntity,
  validateNote,
} from "./validation";

const ID = "60000000-0000-4000-8000-0000000000E1";

describe("parseEntity", () => {
  it("acepta un tipo permitido con un uuid y lo pasa a minúsculas", () => {
    expect(parseEntity("vino", ID, ENTIDADES_FAVORITO)).toEqual({ tipo: "vino", id: ID.toLowerCase() });
    expect(parseEntity("anada", ID, ENTIDADES_NOTA)?.tipo).toBe("anada");
  });

  it("rechaza tipos no permitidos, ids que no son uuid y valores que no son texto", () => {
    expect(parseEntity("anada", ID, ENTIDADES_FAVORITO)).toBeNull();
    expect(parseEntity("vino", "no-uuid", ENTIDADES_FAVORITO)).toBeNull();
    expect(parseEntity("vino", `${ID}x`, ENTIDADES_FAVORITO)).toBeNull();
    expect(parseEntity(null, ID, ENTIDADES_FAVORITO)).toBeNull();
    expect(parseEntity("vino", 3, ENTIDADES_FAVORITO)).toBeNull();
  });
});

describe("validateNote", () => {
  it("recorta y normaliza saltos de línea", () => {
    expect(validateNote("  hola\r\nmundo \r ")).toEqual({ ok: true, texto: "hola\nmundo" });
  });

  it("rechaza texto vacío, en blanco o ausente", () => {
    expect(validateNote("")).toEqual({ ok: false, error: "required" });
    expect(validateNote(" \n\t")).toEqual({ ok: false, error: "required" });
    expect(validateNote(null)).toEqual({ ok: false, error: "required" });
  });

  it("acepta hasta el máximo y rechaza más", () => {
    expect(validateNote("x".repeat(NOTA_MAX)).ok).toBe(true);
    expect(validateNote("x".repeat(NOTA_MAX + 1))).toEqual({ ok: false, error: "tooLong" });
  });
});
