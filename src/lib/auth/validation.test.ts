import { describe, expect, it } from "vitest";
import {
  parsePrice,
  validateEmailOnly,
  validateLogin,
  validateNewPassword,
  validateProfile,
  validateSignUp,
  validateWinePrefs,
} from "./validation";

function form(entries: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("validateLogin", () => {
  it("normaliza el email y exige contraseña", () => {
    expect(validateLogin(form({ email: "  Ana@Example.COM ", password: "x" }))).toEqual({
      ok: true,
      data: { email: "ana@example.com", password: "x" },
    });
    expect(validateLogin(form({ email: "", password: "" }))).toEqual({
      ok: false,
      errors: { email: "required", password: "required" },
    });
    expect(validateLogin(form({ email: "sin-arroba", password: "x" }))).toMatchObject({
      errors: { email: "emailInvalid" },
    });
  });
});

describe("validateSignUp", () => {
  const valid = {
    email: "ana@example.com",
    password: "secreto123",
    passwordConfirm: "secreto123",
    nombre: " Ana ",
    mayorDeEdad: "on",
  };

  it("acepta un alta válida", () => {
    expect(validateSignUp(form(valid))).toEqual({
      ok: true,
      data: { email: "ana@example.com", password: "secreto123", nombre: "Ana" },
    });
    expect(validateSignUp(form({ ...valid, nombre: "" }))).toMatchObject({ data: { nombre: null } });
  });

  it("exige la casilla +18", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.mayorDeEdad;
    expect(validateSignUp(form(rest as Record<string, string>))).toEqual({ ok: false, errors: { mayorDeEdad: "ageRequired" } });
  });

  it("comprueba longitud y coincidencia de contraseñas", () => {
    expect(validateSignUp(form({ ...valid, password: "corta", passwordConfirm: "corta" }))).toMatchObject({
      errors: { password: "passwordTooShort" },
    });
    // 37 caracteres de 2 bytes = 74 bytes > 72.
    const long = "ñ".repeat(37);
    expect(validateSignUp(form({ ...valid, password: long, passwordConfirm: long }))).toMatchObject({
      errors: { password: "passwordTooLong" },
    });
    expect(validateSignUp(form({ ...valid, passwordConfirm: "otra-cosa" }))).toMatchObject({
      errors: { passwordConfirm: "passwordMismatch" },
    });
  });

  it("limita el nombre", () => {
    expect(validateSignUp(form({ ...valid, nombre: "a".repeat(81) }))).toMatchObject({
      errors: { nombre: "tooLong" },
    });
  });
});

describe("validateEmailOnly / validateNewPassword", () => {
  it("valida el email de recuperación", () => {
    expect(validateEmailOnly(form({ email: "A@B.es" }))).toEqual({ ok: true, data: { email: "a@b.es" } });
    expect(validateEmailOnly(form({}))).toEqual({ ok: false, errors: { email: "required" } });
  });

  it("valida la nueva contraseña", () => {
    expect(validateNewPassword(form({ password: "nuevaClave1", passwordConfirm: "nuevaClave1" }))).toEqual({
      ok: true,
      data: { password: "nuevaClave1" },
    });
    expect(validateNewPassword(form({ password: "nuevaClave1", passwordConfirm: "x" }))).toEqual({
      ok: false,
      errors: { passwordConfirm: "passwordMismatch" },
    });
  });
});

describe("validateProfile", () => {
  it("lee idioma, tema y preferencias de email", () => {
    expect(
      validateProfile(form({ nombre: "Ana", idioma: "en", tema: "oscuro", email_novedades: "on" })),
    ).toEqual({
      ok: true,
      data: {
        nombre: "Ana",
        idioma: "en",
        tema: "oscuro",
        prefs_email: { novedades: true, actividad: false },
      },
    });
  });

  it("rechaza valores fuera de los enums", () => {
    expect(validateProfile(form({ idioma: "fr", tema: "dark" }))).toEqual({
      ok: false,
      errors: { idioma: "invalidOption", tema: "invalidOption" },
    });
  });
});

describe("parsePrice", () => {
  it.each([
    ["", null],
    ["12", 12],
    ["12,5", 12.5],
    [" 7.25 ", 7.25],
    ["-1", undefined],
    ["1e3", undefined],
    ["12.345", undefined],
    ["200000", undefined],
  ])("%s → %s", (raw, expected) => {
    expect(parsePrice(raw)).toBe(expected);
  });
});

describe("validateWinePrefs", () => {
  it("acepta valores de los enums e ids, sin duplicados", () => {
    expect(
      validateWinePrefs(
        form({
          tipos: ["tinto", "blanco", "tinto"],
          crianzas: ["reserva"],
          variedades: [UUID],
          denominaciones: [],
          precioMin: "10",
          precioMax: "30,5",
        }),
      ),
    ).toEqual({
      ok: true,
      data: {
        tipos: ["tinto", "blanco"],
        crianzas: ["reserva"],
        variedad_uva_ids: [UUID],
        denominacion_ids: [],
        precio_min: 10,
        precio_max: 30.5,
      },
    });
  });

  it("rechaza opciones y precios inválidos", () => {
    expect(
      validateWinePrefs(
        form({ tipos: ["cerveza"], crianzas: ["x"], denominaciones: ["1; drop"], precioMin: "abc" }),
      ),
    ).toEqual({
      ok: false,
      errors: {
        tipos: "invalidOption",
        crianzas: "invalidOption",
        denominaciones: "invalidOption",
        precioMin: "priceInvalid",
      },
    });
    expect(validateWinePrefs(form({ precioMin: "50", precioMax: "20" }))).toEqual({
      ok: false,
      errors: { precioMax: "priceRange" },
    });
  });
});
