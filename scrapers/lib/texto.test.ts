import { describe, expect, it } from "vitest";
import {
  capitalizarSiMayusculas,
  claveNombreBodega,
  claveTexto,
  nombreBodegaParaMostrar,
  quitarFormaSocietaria,
  slugify,
} from "./texto.ts";

describe("slugify", () => {
  it("genera slugs válidos para el check de la BD", () => {
    expect(slugify("Aalto Bodegas y Viñedos")).toBe("aalto-bodegas-y-vinedos");
    expect(slugify("Xarel·lo")).toBe("xarel-lo");
    expect(slugify("  Bodegas & Viñedos  ")).toBe("bodegas-y-vinedos");
    expect(slugify("Pago de Carraovejas, S.L.")).toBe("pago-de-carraovejas-s-l");
  });
});

describe("quitarFormaSocietaria", () => {
  it.each([
    ["41 Norte, S.L.", "41 Norte"],
    ["AALTO BODEGAS Y VIÑEDOS.", "AALTO BODEGAS Y VIÑEDOS"],
    ["Altos del Terral SLU", "Altos del Terral"],
    ["Alberto y Benito, S.A.", "Alberto y Benito"],
    ["Bodegas Ejemplo S.A.T.", "Bodegas Ejemplo"],
    ["Bodega Cooperativa Virgen de la Asunción, Soc. Coop.", "Bodega Cooperativa Virgen de la Asunción"],
    ["Viña Mayor S. Coop. Ltda.", "Viña Mayor"],
    ["Hermanos Pérez, C.B.", "Hermanos Pérez"],
    ["Bodegas X, S.L. S.A.", "Bodegas X"],
  ])("%s → %s", (entrada, salida) => {
    expect(quitarFormaSocietaria(entrada)).toBe(salida);
  });

  it("no se come palabras que parecen siglas", () => {
    expect(quitarFormaSocietaria("Ojo de SAL")).toBe("Ojo de SAL");
    expect(quitarFormaSocietaria("Bodegas Mesa")).toBe("Bodegas Mesa");
    expect(quitarFormaSocietaria("Viña Sastre")).toBe("Viña Sastre");
    expect(quitarFormaSocietaria("Ojo de Sal, S.A.L.")).toBe("Ojo de Sal");
  });
});

describe("capitalizarSiMayusculas", () => {
  it("pasa a tipo título los nombres en mayúsculas", () => {
    expect(capitalizarSiMayusculas("AALTO BODEGAS Y VIÑEDOS")).toBe("Aalto Bodegas y Viñedos");
    expect(capitalizarSiMayusculas("BODEGAS DE LA RIBERA")).toBe("Bodegas de la Ribera");
    expect(capitalizarSiMayusculas("PAGO DE LOS CAPELLANES")).toBe("Pago de los Capellanes");
    expect(capitalizarSiMayusculas("VIÑA-MAYOR")).toBe("Viña-Mayor");
    expect(capitalizarSiMayusculas("FINCA III")).toBe("Finca III");
  });

  it("respeta los nombres que ya mezclan mayúsculas y minúsculas", () => {
    expect(capitalizarSiMayusculas("41 Norte")).toBe("41 Norte");
    expect(capitalizarSiMayusculas("Bodegas LAN")).toBe("Bodegas LAN");
  });
});

describe("nombreBodegaParaMostrar", () => {
  it("combina forma societaria y mayúsculas", () => {
    expect(nombreBodegaParaMostrar("AALTO BODEGAS Y VIÑEDOS.")).toBe("Aalto Bodegas y Viñedos");
    expect(nombreBodegaParaMostrar("BODEGAS EJEMPLO DE LA RIBERA, S.L.U.")).toBe(
      "Bodegas Ejemplo de la Ribera",
    );
    expect(nombreBodegaParaMostrar("41 Norte, S.L.")).toBe("41 Norte");
  });
});

describe("claveNombreBodega", () => {
  it("quita forma societaria, tildes y palabras genéricas", () => {
    expect(claveNombreBodega("BODEGAS Y VIÑEDOS CONDE DE SAN CRISTÓBAL, S.L.")).toBe("conde san cristobal");
    expect(claveNombreBodega("Bodegas Conde de San Cristóbal")).toBe("conde san cristobal");
    expect(claveNombreBodega("AALTO BODEGAS Y VIÑEDOS.")).toBe("aalto");
  });

  it("si solo hay palabras genéricas, usa el nombre entero", () => {
    expect(claveNombreBodega("Bodegas y Viñedos")).toBe("bodegas y vinedos");
  });
});

describe("claveTexto", () => {
  it("normaliza marcas", () => {
    expect(claveTexto("AALTO P.S.")).toBe("aalto p s");
    expect(claveTexto("Viña Pedrosa")).toBe("vina pedrosa");
  });
});
