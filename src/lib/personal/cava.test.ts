import { describe, expect, it } from "vitest";
import { cavaTotals, drinkWindow, validateCava } from "./cava";

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

describe("validateCava", () => {
  it("acepta un lote mínimo con valores por defecto", () => {
    const r = validateCava(form({ nombre: "  Pesquera  ", cantidad: "2" }));
    expect(r).toEqual({
      ok: true,
      data: expect.objectContaining({
        nombre: "Pesquera",
        cantidad: 2,
        formato_ml: 750,
        vino_id: null,
        anio: null,
        precio_compra: null,
      }),
    });
  });

  it("normaliza precio con coma, fecha e ids", () => {
    const r = validateCava(
      form({
        nombre: "X",
        cantidad: "1",
        precio_compra: "12,5",
        fecha_compra: "2026-11-01",
        vino_id: "60000000-0000-4000-8000-0000000000C1",
        anada_id: "no-uuid",
      }),
    );
    expect(r.ok && r.data).toMatchObject({
      precio_compra: 12.5,
      fecha_compra: "2026-11-01",
      vino_id: "60000000-0000-4000-8000-0000000000c1",
      anada_id: null,
    });
  });

  it("señala cada campo inválido", () => {
    const r = validateCava(
      form({
        nombre: "",
        cantidad: "-1",
        anio: "1700",
        precio_compra: "abc",
        fecha_compra: "2026-02-30",
        beber_desde: "2030",
        beber_hasta: "2025",
      }),
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        nombre: "required",
        cantidad: "number",
        anio: "range",
        precio_compra: "number",
        fecha_compra: "date",
        beber_hasta: "window",
      },
    });
  });

  it("exige la cantidad", () => {
    const r = validateCava(form({ nombre: "X" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.cantidad).toBe("required");
  });
});

describe("drinkWindow", () => {
  it("clasifica según el año", () => {
    expect(drinkWindow(null, null, 2026)).toBe("unknown");
    expect(drinkWindow(2028, 2035, 2026)).toBe("wait");
    expect(drinkWindow(2024, 2030, 2026)).toBe("ready");
    expect(drinkWindow(null, 2026, 2026)).toBe("last");
    expect(drinkWindow(2015, 2020, 2026)).toBe("past");
  });
});

describe("cavaTotals", () => {
  it("suma botellas y valor de lo que queda", () => {
    expect(
      cavaTotals([
        { cantidad: 3, precio_compra: 10 },
        { cantidad: 0, precio_compra: 50 },
        { cantidad: 2, precio_compra: null },
      ]),
    ).toEqual({ botellas: 5, valor: 30 });
  });
});
