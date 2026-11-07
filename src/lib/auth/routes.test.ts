import { describe, expect, it } from "vitest";
import {
  isAdminPath,
  isGuestOnlyPath,
  isPublicPath,
  localeFromNext,
  loginPathWithNext,
  safeNext,
  stripLocale,
} from "./routes";

describe("stripLocale", () => {
  it("quita el prefijo de idioma", () => {
    expect(stripLocale("/es")).toBe("/");
    expect(stripLocale("/en/yo/ajustes")).toBe("/yo/ajustes");
    expect(stripLocale("/fr/x")).toBe("/fr/x");
  });
});

describe("isPublicPath", () => {
  it.each([
    "/es",
    "/en/",
    "/es/login",
    "/en/registro",
    "/es/recuperar",
    "/es/restablecer",
    "/es/legal",
    "/en/legal/cookies",
    "/es/legal/privacidad/",
  ])("%s es pública", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/es/yo",
    "/en/yo/ajustes",
    "/es/admin",
    "/es/admin/invitaciones",
    "/es/buscar",
    "/es/vino/algo",
    "/es/legalidades",
    "/es/login-falso",
    "/es/no-existe",
  ])("%s es privada", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe("isGuestOnlyPath / isAdminPath", () => {
  it("login, registro y recuperar son solo para invitados; restablecer no", () => {
    expect(isGuestOnlyPath("/es/login")).toBe(true);
    expect(isGuestOnlyPath("/en/registro/")).toBe(true);
    expect(isGuestOnlyPath("/es/recuperar")).toBe(true);
    expect(isGuestOnlyPath("/es/restablecer")).toBe(false);
    expect(isGuestOnlyPath("/es")).toBe(false);
  });

  it("detecta /admin y sus subrutas", () => {
    expect(isAdminPath("/es/admin")).toBe(true);
    expect(isAdminPath("/en/admin/usuarios")).toBe(true);
    expect(isAdminPath("/es/administrador")).toBe(false);
  });
});

describe("safeNext", () => {
  const fb = "/es/yo";

  it("acepta rutas internas con idioma, con query y hash", () => {
    expect(safeNext("/en/yo/ajustes", fb)).toBe("/en/yo/ajustes");
    expect(safeNext("/es/buscar?q=tinto#r", fb)).toBe("/es/buscar?q=tinto#r");
  });

  it.each([
    null,
    undefined,
    "",
    "https://malo.test/es",
    "//malo.test/es",
    "/\\malo.test",
    "/\t/malo.test",
    "javascript:alert(1)",
    "es/yo",
    "/yo",
    "/fr/yo",
    `/es/${"a".repeat(3000)}`,
  ])("rechaza %s", (next) => {
    expect(safeNext(next, fb)).toBe(fb);
  });
});

describe("loginPathWithNext", () => {
  it("añade next codificado", () => {
    expect(loginPathWithNext("es", "/es/yo/ajustes?tab=1")).toBe(
      "/es/login?next=%2Fes%2Fyo%2Fajustes%3Ftab%3D1",
    );
  });

  it("omite next si no aporta o no es seguro", () => {
    expect(loginPathWithNext("en")).toBe("/en/login");
    expect(loginPathWithNext("es", "/es")).toBe("/es/login");
    expect(loginPathWithNext("es", "/es/login")).toBe("/es/login");
    expect(loginPathWithNext("es", "https://malo.test")).toBe("/es/login");
  });
});

describe("localeFromNext", () => {
  it("toma el idioma de next o el de reserva", () => {
    expect(localeFromNext("/en/restablecer")).toBe("en");
    expect(localeFromNext("/es/yo?x=1", "en")).toBe("es");
    expect(localeFromNext(null, "en")).toBe("en");
    expect(localeFromNext("/fr/x")).toBe("es");
  });
});
