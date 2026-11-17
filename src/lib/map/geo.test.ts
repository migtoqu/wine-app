import { describe, expect, it } from "vitest";
import type { BodegaMapa } from "@/lib/catalog/types";
import { aGeoJson, cercanas, distanciaKm } from "./geo";

const b = (slug: string, lat: number, lng: number, precision: BodegaMapa["precision"] = "exacta"): BodegaMapa => ({
  id: slug, slug, nombre: slug, municipio: "Peñafiel", provincia: "Valladolid", lat, lng, precision, origen: "oficial",
});

describe("mapa: geo", () => {
  it("distancia Peñafiel–Aranda ≈ 37 km", () => {
    expect(distanciaKm({ lat: 41.598, lng: -4.118 }, { lat: 41.67, lng: -3.69 })).toBeCloseTo(36.5, 0);
  });

  it("cercanas: ordenadas, con radio y tope", () => {
    const lista = [b("lejos", 43, -8), b("aranda", 41.67, -3.69), b("penafiel", 41.6, -4.12)];
    const r = cercanas(lista, { lat: 41.598, lng: -4.118 }, 5, 100);
    expect(r.map((x) => x.slug)).toEqual(["penafiel", "aranda"]);
    expect(cercanas(lista, { lat: 41.598, lng: -4.118 }, 1)).toHaveLength(1);
  });

  it("GeoJSON en orden lng/lat y marca los centroides de municipio", () => {
    const g = aGeoJson([b("a", 41.6, -4.12, "municipio"), b("c", 41.6, -4.12, "calle")]);
    expect(g.features[0]!.geometry.coordinates).toEqual([-4.12, 41.6]);
    expect(g.features.map((f) => f.properties.aproximada)).toEqual([true, false]);
    expect(g.features[0]!.properties.lugar).toBe("Peñafiel, Valladolid");
  });
});
