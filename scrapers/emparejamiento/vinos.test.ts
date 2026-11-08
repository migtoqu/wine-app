import { describe, expect, it } from "vitest";
import { EmparejadorVinos, type VinoCatalogo } from "./vinos.ts";

const VINOS: VinoCatalogo[] = [
  { id: "v1", bodegaId: "b1", nombre: "Legaris Crianza", tipo: "tinto", crianza: "crianza" },
  { id: "v2", bodegaId: "b1", nombre: "Legaris Reserva", tipo: "tinto", crianza: "reserva" },
  { id: "v3", bodegaId: "b2", nombre: "Pruno", tipo: "tinto", crianza: null },
];
const s = (nombre: string, extra: Partial<{ bodegaId: string; tipo: string; crianza: string | null; ean: string }> = {}) => ({
  bodegaId: "b1", nombre, tipo: "tinto", crianza: "crianza", ean: null, ...extra,
});

describe("EmparejadorVinos", () => {
  const e = new EmparejadorVinos(VINOS, [{ ean: "8410000000011", vinoId: "v2" }]);

  it("EAN de la misma bodega → vinculado aunque el nombre difiera", () => {
    expect(e.emparejar(s("Nombre de tienda", { ean: "8410000000011" }))).toMatchObject({ estado: "vinculado", vinoId: "v2", motivo: "ean" });
  });

  it("EAN de otra bodega → revisión", () => {
    expect(e.emparejar(s("X", { bodegaId: "b2", ean: "8410000000011" }))).toMatchObject({ estado: "revision", motivo: "ean_otra_bodega" });
  });

  it("nombre normalizado igual dentro de la bodega → vinculado", () => {
    expect(e.emparejar(s("LEGARIS CRIANZA"))).toMatchObject({ estado: "vinculado", vinoId: "v1" });
  });

  it("el mismo nombre en otra bodega no vale", () => {
    expect(e.emparejar(s("Pruno", { crianza: null })).estado).toBe("nuevo");
  });

  it("muy parecido con mismo tipo y crianza → revisión; con otra crianza → nuevo", () => {
    expect(e.emparejar(s("Legaris Crianzza"))).toMatchObject({ estado: "revision", motivo: "parecido" });
    expect(e.emparejar(s("Legaris Crianzza", { crianza: "roble" })).estado).toBe("nuevo");
  });

  it("sinParecidos (el admin pidió crear) → nuevo", () => {
    expect(e.emparejar(s("Legaris Crianzza"), { sinParecidos: true }).estado).toBe("nuevo");
  });

  it("vinos fusionados y borrados por el admin", () => {
    const sup = new EmparejadorVinos(VINOS, [], [
      { supresionId: "f", motivo: "fusion", destinoId: "v1", bodegaId: "b1", nombre: "Legaris Crianza Edición", eans: [] },
      { supresionId: "d", motivo: "borrado", destinoId: null, bodegaId: "b1", nombre: "Legaris Rosado", eans: ["8410000000028"] },
    ]);
    expect(sup.emparejar(s("Legaris Crianza Edición"))).toMatchObject({ estado: "vinculado", vinoId: "v1", motivo: "alias" });
    expect(sup.emparejar(s("legaris rosado"))).toMatchObject({ estado: "suprimido", supresionId: "d" });
    expect(sup.emparejar(s("Otro nombre", { ean: "8410000000028" }))).toMatchObject({ estado: "suprimido" });
  });

  it("recuerda los vinos creados en la misma ejecución", () => {
    const n = new EmparejadorVinos([]);
    n.anadir({ id: "nuevo", bodegaId: "b1", nombre: "Recién Creado", tipo: "tinto", crianza: null });
    expect(n.emparejar(s("recien creado", { crianza: null })).vinoId).toBe("nuevo");
  });
});
