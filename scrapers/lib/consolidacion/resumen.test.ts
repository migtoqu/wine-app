import { describe, expect, it } from "vitest";
import { consolidarHechos, hashHechos, hechosDe, type FuenteHecho, type Hecho } from "./hechos.ts";
import { PlantillasEsEn } from "./plantillas.ts";
import { calcularResumenes, type EntradaResumen, type GeneradorResumen } from "./resumen.ts";
import { decisionAdmin } from "./supresiones.ts";

const CR: FuenteHecho = { fuente_id: "cr", registro_id: null, url: "https://cr.test/x", origen: "consejo_regulador" };
const WEB: FuenteHecho = { fuente_id: "web", registro_id: null, url: "https://aalto.es", origen: "bodega" };
const TIENDA: FuenteHecho = { fuente_id: "vs", registro_id: null, url: "https://vs.test/x", origen: "tienda" };
const F = "2026-11-01T00:00:00Z";

/** Generador falso: cuenta llamadas y devuelve los hechos en texto. */
class Falso implements GeneradorResumen {
  readonly id = "falso@1";
  llamadas = 0;
  async generar(e: EntradaResumen) {
    this.llamadas++;
    return `${e.idioma}:${e.hechos.map((h) => `${h.clave}=${h.valor}`).join(",")}`;
  }
}

describe("hechos", () => {
  it("hechosDe ignora valores vacíos", () => {
    const h = hechosDe(CR, F, [
      { clave: "bodega.nombre", valor: "Aalto" },
      { clave: "bodega.municipio", valor: null },
      { clave: "bodega.provincia", valor: "" },
      { clave: "bodega.hectareas", valor: undefined },
    ]);
    expect(h.map((x) => x.clave)).toEqual(["bodega.nombre"]);
  });

  it("consolidar: un hecho por clave, de la fuente más prioritaria", () => {
    const h = consolidarHechos([
      ...hechosDe(TIENDA, F, [{ clave: "bodega.hectareas", valor: 90 }]),
      ...hechosDe(WEB, F, [{ clave: "bodega.hectareas", valor: 100 }]),
      ...hechosDe(CR, F, [{ clave: "bodega.nombre", valor: "Aalto" }]),
    ]);
    expect(h.map((x) => [x.clave, x.valor])).toEqual([["bodega.hectareas", 100], ["bodega.nombre", "Aalto"]]);
  });

  it("las uvas no se mezclan entre fuentes", () => {
    const h = consolidarHechos([
      ...hechosDe(TIENDA, F, [{ clave: "anada.variedad", valor: 100, sujeto: "Merlot" }]),
      ...hechosDe(WEB, F, [{ clave: "anada.variedad", valor: 90, sujeto: "Tempranillo" }, { clave: "anada.variedad", valor: 10, sujeto: "Merlot" }]),
    ]);
    expect(h.map((x) => [x.sujeto, x.valor])).toEqual([["Merlot", 10], ["Tempranillo", 90]]);
  });

  it("el hash no depende del orden, la fecha ni la fuente; sí del valor", () => {
    const a = hechosDe(CR, F, [{ clave: "bodega.nombre", valor: "Aalto" }, { clave: "bodega.municipio", valor: "Roa" }]);
    const b = hechosDe(TIENDA, "2026-12-01T00:00:00Z", [{ clave: "bodega.municipio", valor: "Roa" }, { clave: "bodega.nombre", valor: "Aalto" }]);
    const c = hechosDe(CR, F, [{ clave: "bodega.nombre", valor: "Aalto" }, { clave: "bodega.municipio", valor: "Haro" }]);
    expect(hashHechos(a, "x")).toBe(hashHechos(b, "x"));
    expect(hashHechos(a, "x")).not.toBe(hashHechos(c, "x"));
    expect(hashHechos(a, "x")).not.toBe(hashHechos(a, "y"));
  });
});

describe("calcularResumenes (caché por hash)", () => {
  const hechos: Hecho[] = hechosDe(CR, F, [{ clave: "bodega.nombre", valor: "Aalto" }]);

  it("genera es y en con el generador inyectado", async () => {
    const g = new Falso();
    const r = await calcularResumenes(g, "bodega", "descripcion", hechos);
    expect(r.map((x) => x.resumen.texto)).toEqual(["es:bodega.nombre=Aalto", "en:bodega.nombre=Aalto"]);
    expect(r[0]!.resumen.fuentes).toEqual(["cr"]);
    expect(g.llamadas).toBe(2);
  });

  it("no vuelve a generar si los hechos no cambiaron", async () => {
    const g = new Falso();
    const primera = await calcularResumenes(g, "bodega", "descripcion", hechos);
    const previos = new Map(primera.map((x) => [x.resumen.idioma, x.resumen.hash]));
    const segunda = await calcularResumenes(g, "bodega", "descripcion", hechos, previos);
    expect(segunda.every((x) => !x.regenerado)).toBe(true);
    expect(g.llamadas).toBe(2);
  });

  it("cambiar de generador invalida la caché", async () => {
    const g = new Falso();
    const primera = await calcularResumenes(g, "bodega", "descripcion", hechos);
    const previos = new Map(primera.map((x) => [x.resumen.idioma, x.resumen.hash]));
    const otro = await calcularResumenes(new PlantillasEsEn(), "bodega", "descripcion", hechos, previos);
    expect(otro.every((x) => x.regenerado)).toBe(true);
  });
});

describe("PlantillasEsEn", () => {
  const g = new PlantillasEsEn();
  const bodega = hechosDe(CR, F, [
    { clave: "bodega.nombre", valor: "Aalto" },
    { clave: "bodega.municipio", valor: "Quintanilla de Arriba" },
    { clave: "bodega.provincia", valor: "Valladolid" },
    { clave: "bodega.denominacion", valor: "Ribera del Duero" },
    { clave: "bodega.fundacion_anio", valor: 1999 },
    { clave: "bodega.hectareas", valor: 42.5 },
  ]);

  it("descripción de bodega en es/en solo con hechos", async () => {
    expect(await g.generar({ entidad: "bodega", campo: "descripcion", idioma: "es", hechos: bodega })).toBe(
      "Aalto es una bodega de la D.O. Ribera del Duero situada en Quintanilla de Arriba (Valladolid). " +
        "Se fundó en 1999. Cuenta con 42,5 ha de viñedo.",
    );
    expect(await g.generar({ entidad: "bodega", campo: "descripcion", idioma: "en", hechos: bodega })).toBe(
      "Aalto is a winery in the Ribera del Duero D.O., based in Quintanilla de Arriba (Valladolid). " +
        "It was founded in 1999. It farms 42.5 ha of vineyards.",
    );
  });

  it("sin hechos suficientes → null (estado vacío en la ficha)", async () => {
    const solo = hechosDe(CR, F, [{ clave: "bodega.nombre", valor: "Aalto" }]);
    expect(await g.generar({ entidad: "bodega", campo: "descripcion", idioma: "es", hechos: solo })).toBeNull();
    expect(await g.generar({ entidad: "vino", campo: "historia", idioma: "es", hechos: bodega })).toBeNull();
  });

  it("historia de bodega con hechos de la web oficial", async () => {
    const h = consolidarHechos([
      ...hechosDe(CR, F, [{ clave: "bodega.nombre", valor: "Emina" }]),
      ...hechosDe(WEB, F, [
        { clave: "bodega.fundacion_anio", valor: 1988 },
        { clave: "bodega.fundadores", valor: "Carlos Moro", sujeto: "carlos moro" },
        { clave: "bodega.familia", valor: "Moro" },
        { clave: "bodega.generacion", valor: 3 },
        { clave: "bodega.primera_anada", valor: 1994 },
        { clave: "bodega.hectareas", valor: 150 },
        { clave: "bodega.vinedo_municipio", valor: "Valbuena de Duero", sujeto: "valbuena de duero" },
        { clave: "bodega.vinedo_municipio", valor: "Olivares de Duero", sujeto: "olivares de duero" },
        { clave: "bodega.altitud", valor: 750 },
      ]),
    ]);
    expect(await g.generar({ entidad: "bodega", campo: "historia", idioma: "es", hechos: h })).toBe(
      "Emina se fundó en 1988 por iniciativa de Carlos Moro. Es propiedad de la familia Moro, que la dirige ya en su " +
        "tercera generación. Su primera añada fue la de 1994. Cultiva 150 ha de viñedo en Olivares de Duero y " +
        "Valbuena de Duero, a unos 750 m de altitud.",
    );
    expect(await g.generar({ entidad: "bodega", campo: "historia", idioma: "en", hechos: h })).toBe(
      "Emina was founded in 1988 by Carlos Moro. It is owned by the Moro family, now in its third generation. " +
        "Its first vintage was 1994. It farms 150 ha of vineyards in Olivares de Duero and Valbuena de Duero, " +
        "at around 750 m above sea level.",
    );
    // Sin ningún hecho histórico no hay historia (la descripción ya cubre ubicación y hectáreas).
    const sinHistoria = hechosDe(WEB, F, [{ clave: "bodega.nombre", valor: "Emina" }, { clave: "bodega.hectareas", valor: 150 }]);
    expect(await g.generar({ entidad: "bodega", campo: "historia", idioma: "es", hechos: sinHistoria })).toBeNull();
  });

  it("elaboración de añada", async () => {
    const h = consolidarHechos(hechosDe(TIENDA, F, [
      { clave: "vino.tipo", valor: "tinto" },
      { clave: "anada.variedad", valor: 90, sujeto: "Tempranillo" },
      { clave: "anada.variedad", valor: 10, sujeto: "Merlot" },
      { clave: "anada.barrica_meses", valor: 12 },
      { clave: "anada.grado", valor: 14.5 },
      { clave: "anada.temperatura_min", valor: 15 },
      { clave: "anada.temperatura_max", valor: 16 },
    ]));
    expect(await g.generar({ entidad: "anada", campo: "elaboracion", idioma: "es", hechos: h })).toBe(
      "Vino tinto elaborado con Tempranillo (90 %) y Merlot (10 %). Crianza de 12 meses en barrica. " +
        "14,5 % vol. Temperatura de servicio: 15–16 ºC.",
    );
    expect(await g.generar({ entidad: "anada", campo: "elaboracion", idioma: "en", hechos: h })).toBe(
      "Red wine made from Tempranillo (90%) and Merlot (10%). Aged for 12 months in barrel. 14.5% ABV. Serve at 15–16 °C.",
    );
    const mono = hechosDe(TIENDA, F, [{ clave: "anada.variedad", valor: 100, sujeto: "Tempranillo" }]);
    expect(await g.generar({ entidad: "anada", campo: "elaboracion", idioma: "es", hechos: mono })).toBe(
      "Elaborado con Tempranillo (100 %).",
    );
  });

  it("cata a partir de descriptores breves", async () => {
    const h = hechosDe(WEB, F, [
      { clave: "anada.cata.nariz", valor: "frutos negros" },
      { clave: "vino.maridaje", valor: "carnes rojas" },
    ]);
    expect(await g.generar({ entidad: "anada", campo: "cata", idioma: "es", hechos: h })).toBe(
      "Nariz: frutos negros. Maridaje: carnes rojas.",
    );
  });
});

describe("decisionAdmin", () => {
  it("prioriza la supresión y lee la decisión de la cola", () => {
    expect(decisionAdmin(null)).toBeNull();
    expect(decisionAdmin({ supresion_id: "s", decision: "asociar", decision_tipo: "bodega", decision_id: "b" })).toEqual({ tipo: "suprimido", supresionId: "s" });
    expect(decisionAdmin({ decision: "descartar" })).toEqual({ tipo: "descartar" });
    expect(decisionAdmin({ decision: "asociar", decision_tipo: "bodega", decision_id: "b" })).toEqual({ tipo: "asociar", entidad: "bodega", id: "b" });
    expect(decisionAdmin({ decision: "crear" })).toEqual({ tipo: "crear", entidad: null, id: null });
  });
});
