import { describe, expect, it } from "vitest";
import { normalizarCodigoPostal, normalizarEmail, normalizarTelefono, normalizarWeb } from "./contacto.ts";
import { comunidadDeProvincia, puntoEnEspana, puntoEwkt } from "./geo.ts";

describe("normalizarWeb", () => {
  it("acepta URLs y añade esquema si falta", () => {
    expect(normalizarWeb("http://www.aalto.es")).toBe("http://www.aalto.es");
    expect(normalizarWeb("http://www.aalto.es/")).toBe("http://www.aalto.es");
    expect(normalizarWeb("www.Ejemplo.es/vinos")).toBe("http://www.ejemplo.es/vinos");
    expect(normalizarWeb("https://tienda.example.com/?a=1")).toBe("https://tienda.example.com/?a=1");
  });

  it("descarta valores vacíos o no web", () => {
    expect(normalizarWeb("")).toBeNull();
    expect(normalizarWeb("-")).toBeNull();
    expect(normalizarWeb(null)).toBeNull();
    expect(normalizarWeb("mailto:a@b.es")).toBeNull();
    expect(normalizarWeb("localhost")).toBeNull();
  });
});

describe("normalizarEmail", () => {
  it("extrae el primer email válido en minúsculas", () => {
    expect(normalizarEmail("aalto@aalto.es")).toBe("aalto@aalto.es");
    expect(normalizarEmail("mailto:Info@Ejemplo.ES")).toBe("info@ejemplo.es");
    expect(normalizarEmail("ventas@a.es / info@a.es")).toBe("ventas@a.es");
  });

  it("devuelve null si no hay email", () => {
    expect(normalizarEmail("")).toBeNull();
    expect(normalizarEmail("sin email")).toBeNull();
    expect(normalizarEmail("a@b")).toBeNull();
  });
});

describe("normalizarTelefono", () => {
  it("formatea números españoles", () => {
    expect(normalizarTelefono("+34 983 036 949")).toBe("+34 983 036 949");
    expect(normalizarTelefono("947 00 00 00")).toBe("+34 947 000 000");
    expect(normalizarTelefono("0034983036949")).toBe("+34 983 036 949");
    expect(normalizarTelefono("983036949 / 600111222")).toBe("+34 983 036 949");
  });

  it("deja tal cual los extranjeros y descarta los vacíos", () => {
    expect(normalizarTelefono("+33 1 23 45 67 89")).toBe("+33 1 23 45 67 89");
    expect(normalizarTelefono("")).toBeNull();
    expect(normalizarTelefono("—")).toBeNull();
  });
});

describe("normalizarCodigoPostal", () => {
  it("extrae 5 dígitos", () => {
    expect(normalizarCodigoPostal("47360")).toBe("47360");
    expect(normalizarCodigoPostal("CP 09400")).toBe("09400");
    expect(normalizarCodigoPostal("4736")).toBeNull();
  });
});

describe("geo", () => {
  it("deduce la comunidad de la provincia", () => {
    expect(comunidadDeProvincia("Valladolid")).toBe("Castilla y León");
    expect(comunidadDeProvincia("ÁVILA")).toBe("Castilla y León");
    expect(comunidadDeProvincia("Araba/Álava")).toBe("País Vasco");
    expect(comunidadDeProvincia("A Coruña")).toBe("Galicia");
    expect(comunidadDeProvincia("Illes Balears")).toBe("Illes Balears");
    expect(comunidadDeProvincia("Atlántida")).toBeNull();
  });

  it("valida y serializa puntos", () => {
    expect(puntoEnEspana({ lat: 41.62417, lng: -4.25687 })).toBe(true);
    expect(puntoEnEspana({ lat: 28.1, lng: -15.4 })).toBe(true); // Canarias
    expect(puntoEnEspana({ lat: 48.85, lng: 2.35 })).toBe(false); // París
    expect(puntoEwkt({ lat: 41.62417, lng: -4.25687 })).toBe("SRID=4326;POINT(-4.25687 41.62417)");
  });
});
