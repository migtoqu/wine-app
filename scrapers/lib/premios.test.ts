import { describe, expect, it } from "vitest";
import { claveDenominacion, EmparejadorPremios, separarAnada, tipoDeNombre, type PremioLeido, type VinoPremiable } from "./premios.ts";

const bodegas = [
  { id: "b-salvueros", nombre: "Bodegas Hijos de Marcos Gómez", municipio: "Cigales" },
  { id: "b-pinna", nombre: "Pinna Fidelis", municipio: "Roa" },
  { id: "b-murviedro", nombre: "Murviedro", municipio: "Requena" },
];
const vinos: VinoPremiable[] = [
  { id: "v-salvueros", bodegaId: "b-salvueros", nombre: "Salvueros Rosado", tipo: "rosado", crianza: null, denominacion: "Cigales" },
  { id: "v-pinna-rosado", bodegaId: "b-pinna", nombre: "Pinna Fidelis Rosado", tipo: "rosado", crianza: null, denominacion: "Ribera del Duero" },
  { id: "v-pinna-roble", bodegaId: "b-pinna", nombre: "Pinna Fidelis Roble", tipo: "tinto", crianza: "roble", denominacion: "Ribera del Duero" },
  { id: "v-serrano", bodegaId: "b-murviedro", nombre: "Finca El Serrano", tipo: "tinto", crianza: null, denominacion: "Alicante" },
];

const premio = (o: Partial<PremioLeido>): PremioLeido => ({
  idExterno: "x", url: null, nombre: "", anio: null, edicion: 2026, medalla: "oro", puntos: null, distincion: null,
  mencion: null, productor: null, denominacion: null, tipo: null, crudo: {}, ...o,
});

describe("premios: normalización", () => {
  it("separa la añada final", () => {
    expect(separarAnada("Marques de Reinosa Crianza 2023")).toEqual({ nombre: "Marques de Reinosa Crianza", anio: 2023 });
    expect(separarAnada("Barril Nº7 (18 meses) 2019")).toEqual({ nombre: "Barril Nº7 (18 meses)", anio: 2019 });
    expect(separarAnada("Bertola Cream 12 Años")).toEqual({ nombre: "Bertola Cream 12 Años", anio: null });
  });

  it("tipo por el nombre o la categoría", () => {
    expect(tipoDeNombre("Corcovo Rose")).toBe("rosado");
    expect(tipoDeNombre("Innocence 15 Meses Barrica Blanco")).toBe("blanco");
    expect(tipoDeNombre("Rovellats Gran Reserva", "Vino - Espumoso")).toBe("espumoso");
    expect(tipoDeNombre("Antima")).toBeNull();
  });

  it("claves de D.O. comparables", () => {
    expect(claveDenominacion("Rioja DOCa")).toBe("rioja");
    expect(claveDenominacion("Cava Gran Reserva")).toBe("cava");
    expect(claveDenominacion("Vino de la Tierra de Castilla")).toBe("castilla");
  });
});

describe("premios: emparejamiento", () => {
  const emp = new EmparejadorPremios(bodegas, vinos);

  it("bodega por razón social y vino por nombre canónico", () => {
    const r = emp.emparejar(premio({ nombre: "Pinna Fidelis Rosado", productor: "Bodegas Pinna Fidelis" }));
    expect(r).toMatchObject({ estado: "emparejado", vinoId: "v-pinna-rosado", bodegaId: "b-pinna" });
  });

  it("un nombre de vino único y de la misma D.O. basta aunque el productor no se reconozca", () => {
    const r = emp.emparejar(premio({ nombre: "Finca El Serrano", productor: "Bodegas Murviedro SA", denominacion: "Alicante" }));
    expect(r).toMatchObject({ estado: "emparejado", vinoId: "v-serrano" });
    const otra = emp.emparejar(premio({ nombre: "Finca El Serrano", productor: "Otra SL", denominacion: "Jumilla" }));
    expect(otra.estado).toBe("pendiente");
  });

  it("vino fuera del catálogo de una bodega conocida: pendiente, no revisión", () => {
    const r = emp.emparejar(premio({ nombre: "Pinna Fidelis Vendimia Seleccionada", productor: "Bodegas Pinna Fidelis" }));
    expect(r.estado).toBe("pendiente");
    expect(r.motivo).toMatch(/catálogo/);
  });

  it("productor desconocido y vino desconocido: pendiente", () => {
    expect(emp.emparejar(premio({ nombre: "Antima", productor: "Empordàlia SCCL", denominacion: "Empordà" })).estado).toBe("pendiente");
  });
});
