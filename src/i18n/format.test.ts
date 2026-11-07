import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatPrice } from "./format";

// Intl usa espacios no separables (U+00A0, U+202F); los normalizamos para comparar.
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("formatPrice", () => {
  it("formatea euros al estilo español", () => {
    expect(plain(formatPrice("es", 12.5))).toBe("12,50 €");
    expect(plain(formatPrice("es", 12345.6))).toBe("12.345,60 €");
  });

  it("formatea euros al estilo inglés", () => {
    expect(formatPrice("en", 12.5)).toBe("€12.50");
    expect(formatPrice("en", 12345.6)).toBe("€12,345.60");
  });
});

describe("formatNumber", () => {
  it("usa los separadores de cada idioma", () => {
    expect(formatNumber("es", 12345.5)).toBe("12.345,5");
    expect(formatNumber("en", 12345.5)).toBe("12,345.5");
  });

  it("acepta opciones de Intl", () => {
    expect(formatNumber("es", 0.135, { style: "percent", maximumFractionDigits: 1 })).toMatch(
      /^13,5\s%$/,
    );
  });
});

describe("formatDate", () => {
  it("usa formato largo por defecto", () => {
    expect(formatDate("es", "2026-11-07")).toBe("7 de noviembre de 2026");
    expect(formatDate("en", "2026-11-07")).toBe("7 November 2026");
  });

  it("aplica la zona horaria de Madrid, no la del servidor", () => {
    // 23:30 UTC del 31 de diciembre ya es 1 de enero en Madrid (UTC+1).
    const instant = "2026-12-31T23:30:00Z";
    expect(formatDate("es", instant)).toBe("1 de enero de 2027");
    expect(plain(formatDate("en", instant, { timeStyle: "short" }))).toBe("00:30");
  });

  it("acepta Date y timestamps", () => {
    const date = new Date("2026-06-15T10:00:00Z");
    expect(formatDate("es", date, { dateStyle: "short" })).toBe("15/6/26");
    expect(formatDate("es", date.getTime(), { dateStyle: "short" })).toBe("15/6/26");
  });
});
