// Métricas mínimas sobre los casos reales (fixtures/). Cero falsos positivos
// automáticos es obligatorio; el recall puede mejorar, nunca bajar de aquí.
import { describe, expect, it } from "vitest";
import { EmparejadorBodegas } from "./entidades.ts";
import {
  catalogoBodegas,
  DUPLICADOS_CATALOGO_VINOS,
  evaluarCasosBodegas,
  evaluarCasosVinos,
  evaluarCatalogoBodegas,
  evaluarCatalogoVinos,
} from "./evaluar.ts";
import { codigoPostal, codigoProvincia, municipioDeDireccion, telefonos } from "./lugar.ts";
import { claveVino } from "./vinos.ts";

describe("métricas sobre casos reales", () => {
  it("bodegas de otras fuentes: 0 FP automáticos, recall ≥ 0,9 y ningún duplicado perdido", () => {
    const m = evaluarCasosBodegas();
    expect(m.falsosPositivos, m.detalle.join("\n")).toBe(0);
    expect(m.recall).toBeGreaterThanOrEqual(0.9);
    expect(m.perdidos).toBe(0);
  });

  it("catálogo de bodegas contra sí mismo: ninguna se vincula a otra", () => {
    const m = evaluarCatalogoBodegas();
    expect(m.falsosPositivos, m.detalle.filter((l) => l.startsWith("FP")).join("\n")).toBe(0);
    // ~2,6 s en local y ~5,4 s en el runner de GitHub: el límite de 5 s lo hacía intermitente.
  }, 20_000);

  it("vinos parecidos de la cola: 0 FP automáticos y al menos 4 de 7 duplicados resueltos", () => {
    const m = evaluarCasosVinos();
    expect(m.falsosPositivos, m.detalle.join("\n")).toBe(0);
    expect(m.aciertosAuto).toBeGreaterThanOrEqual(4);
  });

  it("catálogo de vinos contra sí mismo: solo vincula duplicados ya conocidos", () => {
    const m = evaluarCatalogoVinos();
    expect(m.falsosPositivos, m.detalle.join("\n")).toBe(0);
    expect(m.duplicadosCatalogo).toEqual([...DUPLICADOS_CATALOGO_VINOS].sort());
  });
});

describe("casos concretos de la cola de revisión", () => {
  const emp = new EmparejadorBodegas(catalogoBodegas());
  const id = (nombre: string) => catalogoBodegas().find((b) => b.nombre === nombre)!.id;

  it.each([
    ["Bodegas Valdubón", "http://ferrerwines.com/valdubon/", "09460", "Bodegas Valdubón"],
    ["Bodega Tierra Aranda", "http://www.vinotierraranda.es", "09400", "Bodega Tierra Aranda"],
    ["Bodegas Legaris", "http://www.15bodegas.com/visita-legaris", "47316", "Legaris"],
    ["Abadía de San Quirce", "http://www.abadiasanquirce.com", "09370", "Bodegas Abadía San Quirce"],
    ["Bodega Manchón & Mieres", "http://manchonmieres.com", "47315", "Manchon Mieres"],
  ])("%s → vinculada", (nombre, web, cp, esperada) => {
    expect(emp.emparejar({ nombre, web, codigoPostal: cp })).toMatchObject({ estado: "vinculada", bodegaId: id(esperada) });
  });

  it("dominio de un grupo en otra provincia no basta: Bodegas Durón ≠ Solar de Samaniego", () => {
    const r = emp.emparejar({ nombre: "Bodegas Durón", web: "http://www.solardesamaniego.com", codigoPostal: "09300" });
    expect(r.estado).not.toBe("vinculada");
  });

  it("el municipio no es nombre propio: Bodegas Peñafiel ≠ Bodegas Tierras de Peñafiel", () => {
    const b = catalogoBodegas().find((x) => x.nombre === "Bodegas Peñafiel")!;
    expect(emp.emparejar(b, { excluir: new Set([b.id]) }).estado).not.toBe("vinculada");
  });

  it("mismo nombre sin lugar ni contacto: a revisión (Bodegas Escudero de Rioja)", () => {
    expect(emp.emparejar({ nombre: "BODEGAS ESCUDERO" }).estado).toBe("revision");
  });
});

describe("lugar", () => {
  it("códigos postales y provincias", () => {
    expect(codigoPostal("Bodegas X - Ribera del Duero, 09443, Gumiel de Mercado")).toBe("09443");
    expect(codigoPostal("C/ REAL Nº 14")).toBeNull();
    expect(codigoProvincia(null, "01300")).toBe("01");
    expect(codigoProvincia("Álava", null)).toBe("01");
    expect(codigoProvincia("La Rioja", null)).toBe("26");
    expect(codigoProvincia("Valladolid", null)).toBe("47");
    expect(codigoProvincia(null, null)).toBeNull();
  });

  it("municipio de una dirección", () => {
    expect(municipioDeDireccion("Bodegas Arrocal - Ribera del Duero, 09443, Gumiel de Mercado, Burgos, España")).toBe("Gumiel de Mercado");
    expect(municipioDeDireccion("Bodega La Olmilla, 47300 Peñafiel, Valladolid")).toBe("Peñafiel");
    expect(municipioDeDireccion("C/ REAL Nº 14")).toBeNull();
  });

  it("teléfonos", () => {
    expect(telefonos("609 207 755 – 921 532 454")).toEqual(["609207755", "921532454"]);
    expect(telefonos("+34 947 540 247")).toEqual(["947540247"]);
    expect(telefonos(null)).toEqual([]);
  });
});

describe("claveVino", () => {
  it("quita añadas, formato, sufijos de ficha, D.O. y «tinto» en un tinto", () => {
    expect(claveVino("TresMatas Reserva 21- Etiquetado nutricional", "tinto")).toBe(claveVino("Tresmatas Reserva", "tinto"));
    expect(claveVino("KORDE Blanco 22-23", "blanco")).toBe(claveVino("KORDE Blanco 20/21", "blanco"));
    expect(claveVino("Pomar de Burgos Barrica (6 bot", "tinto")).toBe(claveVino("Barrica Pomar de Burgos", "tinto"));
    expect(claveVino("Heredad de Peñalosa Tinto Roble", "tinto")).toBe(claveVino("Heredad de Peñalosa Roble", "tinto"));
    expect(claveVino("Montecillo Singladuras Ribera del Duero 2024")).toBe("montecillo singladuras");
    expect(claveVino("Viña Mayor Crianza Mágnum 1,5 l")).toBe(claveVino("Viña Mayor Crianza"));
  });

  it("conserva lo que distingue un vino de otro", () => {
    expect(claveVino("Corimbo I")).not.toBe(claveVino("Corimbo"));
    expect(claveVino("de Autor – D1 By Dani MABE")).not.toBe(claveVino("de Autor – M1 By Dani MABE"));
    expect(claveVino("Joseph Perrier Cuvée Royale Brut Nature")).not.toBe(claveVino("Joseph Perrier Cuvée Royale Brut"));
    expect(claveVino("Korde", "rosado")).not.toBe(claveVino("KORDE Rosado", "rosado"));
  });

  it("vacía si no queda nada que identifique al vino", () => {
    expect(claveVino("Ribera/Rioja 100% tempranillo", "tinto")).toBe("");
    expect(claveVino("Crianza 2019", "tinto")).toBe("");
  });
});
