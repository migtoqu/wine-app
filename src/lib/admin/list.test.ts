import { describe, expect, it } from "vitest";
import { filterByName, listHref, pageParam, paginate } from "./list";

describe("listados del admin", () => {
  it("filtra sin tildes, también por sinónimos", () => {
    const items = [
      { nombre: "Tempranillo", sinonimos: ["Tinta del País"] },
      { nombre: "Albariño" },
    ];
    expect(filterByName(items, "albarino")).toEqual([{ nombre: "Albariño" }]);
    expect(filterByName(items, "PAIS")).toHaveLength(1);
    expect(filterByName(items, " ")).toHaveLength(2);
  });

  it("pagina y acota la página pedida", () => {
    const r = paginate([1, 2, 3, 4, 5], 9, 2);
    expect(r).toEqual({ items: [5], page: 3, totalPages: 3, total: 5 });
    expect(paginate([], 1, 2).totalPages).toBe(1);
  });

  it("lee ?pagina= y construye enlaces", () => {
    expect(pageParam({ pagina: "3" })).toBe(3);
    expect(pageParam({ pagina: "-1" })).toBe(1);
    expect(listHref("/es/admin/uvas", { q: "tinta", bodega: "" }, 2)).toBe("/es/admin/uvas?q=tinta&pagina=2");
    expect(listHref("/es/admin/uvas", { q: "" }, 1)).toBe("/es/admin/uvas");
  });
});
