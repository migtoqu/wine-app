import { describe, expect, it } from "vitest";
import { filterAndSortFavorites, parseFavoritesParams } from "./favorites";

const items = [
  { created_at: "2026-01-02T00:00:00Z", vino: { nombre: "Zeta" }, bodega: null },
  { created_at: "2026-01-03T00:00:00Z", vino: null, bodega: { nombre: "Álvarez" } },
  { created_at: "2026-01-01T00:00:00Z", vino: { nombre: "Alfa" }, bodega: null },
];

describe("parseFavoritesParams", () => {
  it("usa valores por defecto con parámetros ausentes o inválidos", () => {
    expect(parseFavoritesParams({})).toEqual({ tipo: "todos", orden: "reciente" });
    expect(parseFavoritesParams({ tipo: "x", orden: ["nombre", "y"] })).toEqual({
      tipo: "todos",
      orden: "nombre",
    });
    expect(parseFavoritesParams({ tipo: "bodega" }).tipo).toBe("bodega");
  });
});

describe("filterAndSortFavorites", () => {
  it("filtra por tipo", () => {
    expect(filterAndSortFavorites([...items], { tipo: "vino", orden: "reciente" }, "es")).toHaveLength(2);
    expect(filterAndSortFavorites([...items], { tipo: "bodega", orden: "reciente" }, "es")).toHaveLength(1);
  });

  it("ordena por fecha descendente", () => {
    const r = filterAndSortFavorites([...items], { tipo: "todos", orden: "reciente" }, "es");
    expect(r.map((f) => f.created_at)).toEqual([
      "2026-01-03T00:00:00Z",
      "2026-01-02T00:00:00Z",
      "2026-01-01T00:00:00Z",
    ]);
  });

  it("ordena por nombre sin distinguir acentos ni mayúsculas", () => {
    const r = filterAndSortFavorites([...items], { tipo: "todos", orden: "nombre" }, "es");
    expect(r.map((f) => f.vino?.nombre ?? f.bodega?.nombre)).toEqual(["Alfa", "Álvarez", "Zeta"]);
  });
});
