import { describe, expect, it } from "vitest";
import { NOMBRE_BASURA, proponerLimpieza, type VinoLimpieza } from "./limpiar-nombres-vinos.ts";

let n = 0;
const vino = (nombre: string, bodega: string, extra: Partial<VinoLimpieza> = {}): VinoLimpieza => ({
  id: `v${++n}`, nombre, slug: nombre.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  bodegaId: bodega, bodega, bodegaSlug: bodega, anadas: 1, ...extra,
});

// Los 27 vinos con nombre de plantilla de la carga de fase B (2026-11-10).
const BASURA: [string, string][] = [
  ...["Ficha Elas Albariño", "Ficha Pluma Blanca Verdejo", "Ficha Pluma Rosé", "Ficha Rivendel Crianza", "Ficha Rivendel Roble",
    "Ficha Rivendel Tercer Año", "Ficha Rivendel Verdejo Ecológico", "Ficha Vástago", "Ficha Vis a Vis"].map((x) => [x, "el-inicio"] as [string, string]),
  ["Fichas de producto", "la-cepa-alta"],
  ["Ficha técnica VITELITE24", "roda"],
  ...["Pozo de Nieve – Etiquetado nutricional", "TresMatas Crianza – Etiquetado nutricional", "TresMatas Reserva 22- Etiquetado nutricional",
    "TresMatas Vendimia Seleccionada - Etiquetado nutricional", "Vegantigua Roble – Etiquetado nutricional"].map((x) => [x, "vega-de-yuso"] as [string, string]),
  ...["Info nutricional DIEZ ALMENDROS", "Info nutricional Ilena", "Info nutricional JILGUERÍN", "Info nutricional Mario", "Info nutricional NALA"]
    .map((x) => [x, "vegaclara"] as [string, string]),
  ...["Cepa Gavilán", "Finca La Navilla", "Pérez Pascuas Gran Selección", "Viña Pedrosa Crianza", "Viña Pedrosa Gran Reserva", "Viña Pedrosa Reserva"]
    .map((x) => [`${x} + Ficha Técnica`, "vina-pedrosa"] as [string, string]),
];

describe("limpiar-nombres-vinos", () => {
  it("detecta los 27 y ningún nombre normal", () => {
    expect(BASURA).toHaveLength(27);
    expect(BASURA.every(([x]) => NOMBRE_BASURA.test(x))).toBe(true);
    expect(["Viña Pedrosa Crianza", "Aalto PS", "Rivendel Roble"].some((x) => NOMBRE_BASURA.test(x))).toBe(false);
    // Las 9 fichas inglesas de Bodegas el Inicio («Sheet X») también cuentan.
    expect(NOMBRE_BASURA.test("Sheet Elas Albariño")).toBe(true);
  });

  it("renombra, fusiona con el homónimo de la misma bodega y borra lo que solo es plantilla", () => {
    const basura = BASURA.map(([x, b]) => vino(x, b));
    // Viña Pedrosa ya tiene «Viña Pedrosa Crianza» limpio (de la tienda): esa ficha se fusiona.
    const limpio = vino("Viña Pedrosa Crianza", "vina-pedrosa");
    // Otra bodega con el mismo nombre no cuenta para fusionar.
    const otraBodega = vino("Pozo de Nieve", "otra");
    const acciones = proponerLimpieza(basura, [...basura, limpio, otraBodega], new Set([...basura, limpio, otraBodega].map((v) => v.slug)));
    const de = (nombre: string) => acciones.find((a) => a.vino.nombre === nombre)!;

    expect(de("Fichas de producto")).toMatchObject({ tipo: "borrar" });
    expect(de("Viña Pedrosa Crianza + Ficha Técnica")).toMatchObject({ tipo: "fusionar", destino: { id: limpio.id } });
    expect(de("Ficha Rivendel Roble")).toMatchObject({ tipo: "renombrar", nombre: "Rivendel Roble", slug: "rivendel-roble" });
    expect(de("TresMatas Reserva 22- Etiquetado nutricional")).toMatchObject({ tipo: "renombrar", nombre: "TresMatas Reserva" });
    expect(de("Info nutricional DIEZ ALMENDROS")).toMatchObject({ tipo: "renombrar", nombre: "Diez Almendros" });
    // El slug «pozo-de-nieve» ya lo usa el vino de otra bodega: se usa el de la bodega.
    expect(de("Pozo de Nieve – Etiquetado nutricional")).toMatchObject({ tipo: "renombrar", nombre: "Pozo de Nieve", slug: "vega-de-yuso-pozo-de-nieve" });
    expect(acciones.filter((a) => a.tipo === "renombrar")).toHaveLength(25);
  });

  it("«Sheet X» duplicado de «Ficha X»: si la ficha ya se renombró a X, la inglesa se fusiona con ella", () => {
    const es = vino("Ficha Pluma Rosé", "el-inicio");
    const en = vino("Sheet Pluma Rosé", "el-inicio");
    const acc = proponerLimpieza([es, en], [es, en], new Set([es.slug, en.slug]));
    expect(acc.map((a) => a.tipo)).toEqual(["renombrar", "fusionar"]);
    expect(acc[1]).toMatchObject({ destino: { id: es.id } });
  });

  it("respeta un nombre que el admin ya editó", () => {
    const v = vino("Ficha Vástago", "el-inicio", { nombreDeAdmin: true });
    expect(proponerLimpieza([v], [v], new Set())).toEqual([{ tipo: "omitir", vino: v, motivo: "el admin editó el nombre" }]);
  });

  it("dos fichas basura que limpian al mismo nombre en la bodega: la segunda se fusiona con la primera", () => {
    const a = vino("Ficha Vástago", "el-inicio");
    const b = vino("Vástago – Etiquetado nutricional", "el-inicio");
    const acc = proponerLimpieza([a, b], [a, b], new Set([a.slug, b.slug]));
    expect(acc.map((x) => x.tipo)).toEqual(["renombrar", "fusionar"]);
  });
});
