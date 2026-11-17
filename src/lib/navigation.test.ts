import { describe, expect, it } from "vitest";
import { parentPath } from "./navigation";

describe("parentPath", () => {
  it("no hay padre en el inicio del idioma", () => {
    expect(parentPath("/es")).toBeNull();
    expect(parentPath("/en/")).toBeNull();
    expect(parentPath("/sin-idioma")).toBeNull();
  });

  it("las fichas vuelven al catálogo", () => {
    expect(parentPath("/es/vino/pesquera")).toBe("/es/buscar");
    expect(parentPath("/en/bodega/protos")).toBe("/en/buscar?ver=bodegas");
  });

  it("el resto sube un nivel", () => {
    expect(parentPath("/es/yo/cava")).toBe("/es/yo");
    expect(parentPath("/es/yo")).toBe("/es");
    expect(parentPath("/es/admin/vinos/123")).toBe("/es/admin/vinos");
  });
});
