import { describe, expect, it } from "vitest";
import {
  anadaKey,
  displayHost,
  formatAddress,
  formatAlcohol,
  formatPercent,
  formatTempRange,
  imageForAnada,
  latestDate,
  pickAnada,
  socialLinks,
  sortAnadas,
  truncate,
} from "./format";
import type { Anada } from "./types";

const plain = (text: string | null) => text?.replace(/[  ]/g, " ") ?? null;

describe("formatos numéricos", () => {
  it("rango de temperatura", () => {
    expect(plain(formatTempRange("es", 16, 18))).toBe("16–18 °C");
    expect(plain(formatTempRange("es", 7.5, 7.5))).toBe("7,5 °C");
    expect(plain(formatTempRange("en", null, 12.5))).toBe("12.5 °C");
    expect(formatTempRange("es", null, null)).toBeNull();
  });

  it("grado alcohólico y porcentajes", () => {
    expect(plain(formatAlcohol("es", 14.5))).toBe("14,5 % vol.");
    expect(plain(formatAlcohol("en", 13))).toBe("13 % vol.");
    expect(formatAlcohol("es", null)).toBeNull();
    expect(plain(formatPercent("es", 85))).toBe("85 %");
    expect(formatPercent("es", null)).toBeNull();
  });
});

describe("formatAddress", () => {
  it("compone la dirección en una línea", () => {
    expect(
      formatAddress({
        direccion: "Ctra. N-122, km 323",
        codigo_postal: "47359",
        municipio: "Olivares de Duero",
        provincia: "Valladolid",
      }),
    ).toBe("Ctra. N-122, km 323, 47359 Olivares de Duero, Valladolid");
  });

  it("no repite la provincia si coincide con el municipio y devuelve null sin datos", () => {
    expect(
      formatAddress({ direccion: null, codigo_postal: null, municipio: "Soria", provincia: "Soria" }),
    ).toBe("Soria");
    expect(
      formatAddress({ direccion: null, codigo_postal: null, municipio: null, provincia: null }),
    ).toBeNull();
  });
});

describe("enlaces", () => {
  it("displayHost", () => {
    expect(displayHost("https://www.vega-sicilia.com/es/")).toBe("vega-sicilia.com");
    expect(displayHost("no es url")).toBe("no es url");
  });

  it("socialLinks filtra URLs no válidas, ordena y no repite X/Twitter", () => {
    expect(
      socialLinks({
        facebook: "https://facebook.com/b",
        Instagram: "https://instagram.com/b",
        twitter: "https://twitter.com/b",
        x: "https://x.com/b",
        web: "javascript:alert(1)",
        otra: 3,
      }),
    ).toEqual([
      { network: "instagram", label: "Instagram", url: "https://instagram.com/b" },
      { network: "facebook", label: "Facebook", url: "https://facebook.com/b" },
      { network: "x", label: "X", url: "https://x.com/b" },
    ]);
    expect(socialLinks(null)).toEqual([]);
    expect(socialLinks(["https://x.com"])).toEqual([]);
  });
});

describe("fechas y textos", () => {
  it("latestDate", () => {
    expect(latestDate(["2026-01-01T00:00:00Z", null, "2026-03-01T00:00:00Z", "x"])).toBe(
      "2026-03-01T00:00:00Z",
    );
    expect(latestDate([])).toBeNull();
  });

  it("truncate no parte palabras", () => {
    expect(truncate("corto")).toBe("corto");
    expect(truncate("uno dos tres cuatro cinco", 12)).toBe("uno dos…");
  });
});

describe("añadas", () => {
  const anada = (anio: number | null): Anada => ({
    id: String(anio),
    anio,
    grado: null,
    meses_crianza: null,
    notas_cata: null,
    maridaje: null,
    temp_servicio_min: null,
    temp_servicio_max: null,
    produccion_botellas: null,
    elaboracion: null,
    cata_vista: null,
    cata_nariz: null,
    cata_boca: null,
    updated_at: "2026-01-01T00:00:00Z",
    variedades: [],
    imagenes: [],
    procedencia: {},
    resumenes: [],
  });
  const anadas = sortAnadas([anada(2018), anada(null), anada(2020), anada(2019)]);

  it("ordena de más reciente a más antigua, sin añada al final", () => {
    expect(anadas.map((a) => a.anio)).toEqual([2020, 2019, 2018, null]);
  });

  it("anadaKey", () => {
    expect(anadaKey(2020)).toBe("2020");
    expect(anadaKey(null)).toBe("sin");
  });

  it("pickAnada elige la pedida o la más reciente", () => {
    expect(pickAnada(anadas, "2019")?.anio).toBe(2019);
    expect(pickAnada(anadas, "sin")?.anio).toBeNull();
    expect(pickAnada(anadas, "1999")?.anio).toBe(2020);
    expect(pickAnada(anadas, undefined)?.anio).toBe(2020);
    expect(pickAnada([], "2020")).toBeNull();
  });
});

describe("imageForAnada", () => {
  const img = (url: string) => ({ url, alt: null, atribucion: null });
  const base = {
    id: "",
    grado: null,
    meses_crianza: null,
    notas_cata: null,
    maridaje: null,
    temp_servicio_min: null,
    temp_servicio_max: null,
    produccion_botellas: null,
    elaboracion: null,
    cata_vista: null,
    cata_nariz: null,
    cata_boca: null,
    updated_at: "",
    variedades: [],
    procedencia: {},
    resumenes: [],
  };
  const a2020: Anada = { ...base, anio: 2020, imagenes: [img("2020")] };
  const a2019: Anada = { ...base, anio: 2019, imagenes: [] };

  it("prefiere la imagen de la añada, luego la del vino y luego la de otra añada", () => {
    expect(imageForAnada({ imagenes: [img("vino")], anadas: [a2020, a2019] }, a2020)?.url).toBe("2020");
    expect(imageForAnada({ imagenes: [img("vino")], anadas: [a2020, a2019] }, a2019)?.url).toBe("vino");
    expect(imageForAnada({ imagenes: [], anadas: [a2020, a2019] }, a2019)?.url).toBe("2020");
    expect(imageForAnada({ imagenes: [], anadas: [a2019] }, a2019)).toBeNull();
  });
});
