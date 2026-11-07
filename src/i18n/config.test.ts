import { describe, expect, it } from "vitest";
import {
  hasLocale,
  localeFromPathname,
  localePath,
  negotiateLocale,
  switchLocalePath,
} from "./config";

describe("negotiateLocale", () => {
  it("usa español si no hay cabecera", () => {
    expect(negotiateLocale(null)).toBe("es");
    expect(negotiateLocale(undefined)).toBe("es");
    expect(negotiateLocale("")).toBe("es");
  });

  it("reconoce variantes regionales por su idioma base", () => {
    expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
    expect(negotiateLocale("es-MX")).toBe("es");
    expect(negotiateLocale("EN-gb")).toBe("en");
  });

  it("respeta el orden de calidad (q)", () => {
    expect(negotiateLocale("es;q=0.5,en;q=0.8")).toBe("en");
    expect(negotiateLocale("en;q=0.4,es;q=0.9")).toBe("es");
  });

  it("a igual calidad gana el primero de la lista", () => {
    expect(negotiateLocale("en,es")).toBe("en");
    expect(negotiateLocale("es,en")).toBe("es");
  });

  it("salta idiomas no soportados y busca el siguiente", () => {
    expect(negotiateLocale("fr-FR,fr;q=0.9,en;q=0.5")).toBe("en");
  });

  it("vuelve a español si ninguno está soportado", () => {
    expect(negotiateLocale("fr,de;q=0.8")).toBe("es");
    expect(negotiateLocale("*")).toBe("es");
  });

  it("ignora idiomas con q=0 o q inválida", () => {
    expect(negotiateLocale("en;q=0,fr")).toBe("es");
    expect(negotiateLocale("en;q=abc,es;q=0.1")).toBe("es");
  });
});

describe("hasLocale", () => {
  it("solo acepta los idiomas configurados", () => {
    expect(hasLocale("es")).toBe(true);
    expect(hasLocale("en")).toBe(true);
    expect(hasLocale("fr")).toBe(false);
    expect(hasLocale("EN")).toBe(false);
    expect(hasLocale(undefined)).toBe(false);
  });
});

describe("localePath", () => {
  it("añade el prefijo de idioma", () => {
    expect(localePath("en", "/legal/cookies")).toBe("/en/legal/cookies");
    expect(localePath("es", "login")).toBe("/es/login");
  });

  it("la raíz no lleva barra final", () => {
    expect(localePath("es")).toBe("/es");
    expect(localePath("en", "/")).toBe("/en");
  });
});

describe("localeFromPathname", () => {
  it("lee el idioma solo del primer segmento completo", () => {
    expect(localeFromPathname("/en/legal")).toBe("en");
    expect(localeFromPathname("/es")).toBe("es");
    expect(localeFromPathname("/english")).toBeNull();
    expect(localeFromPathname("/fr/es")).toBeNull();
    expect(localeFromPathname("/")).toBeNull();
  });
});

describe("switchLocalePath", () => {
  it("cambia el prefijo y conserva el resto de la ruta", () => {
    expect(switchLocalePath("/es/legal/privacidad", "en")).toBe("/en/legal/privacidad");
    expect(switchLocalePath("/en/login", "es")).toBe("/es/login");
  });

  it("funciona en la raíz del idioma", () => {
    expect(switchLocalePath("/es", "en")).toBe("/en");
    expect(switchLocalePath("/en/", "es")).toBe("/es");
  });

  it("añade el prefijo si la ruta no tenía idioma", () => {
    expect(switchLocalePath("/legal/cookies", "en")).toBe("/en/legal/cookies");
    expect(switchLocalePath("/", "es")).toBe("/es");
  });
});
