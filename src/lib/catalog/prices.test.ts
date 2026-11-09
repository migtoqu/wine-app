import { describe, expect, it } from "vitest";
import {
  formatosDisponibles,
  ofertasDelFormato,
  pickFormato,
  resumenPrecios,
  serieMinimo,
  urlOferta,
} from "./prices";
import type { Oferta } from "./types";

let n = 0;
function oferta(o: Partial<Omit<Oferta, "tienda">> & { tienda?: Partial<Oferta["tienda"]> } = {}): Oferta {
  n++;
  return {
    id: `o${n}`,
    url: `https://t.example/${n}`,
    precio: 20,
    formato_ml: 750,
    disponible: true,
    visto_por_ultima_vez: "2026-11-01T00:00:00Z",
    anio: 2020,
    con_anada: true,
    historial: [],
    ...o,
    tienda: {
      slug: "t",
      nombre: "Tienda",
      web: "https://t.example",
      logo_url: null,
      info_envio: null,
      afiliacion_plantilla: null,
      ...o.tienda,
    },
  };
}

describe("formatos", () => {
  it("75 cl primero y el resto de menor a mayor", () => {
    const f = formatosDisponibles([{ formato_ml: 1500 }, { formato_ml: 375 }, { formato_ml: 750 }, { formato_ml: 1500 }]);
    expect(f).toEqual([750, 375, 1500]);
  });
  it("pickFormato acepta solo formatos con ofertas", () => {
    expect(pickFormato("1500", [750, 1500])).toBe(1500);
    expect(pickFormato("3000", [750, 1500])).toBe(750);
    expect(pickFormato(undefined, [375])).toBe(375);
    expect(pickFormato(["abc"], [])).toBeNull();
  });
});

describe("ofertasDelFormato", () => {
  it("filtra el formato y ordena disponibles primero, por precio y tienda", () => {
    const a = oferta({ precio: 25, tienda: { nombre: "B" } });
    const b = oferta({ precio: 18, disponible: false });
    const c = oferta({ precio: 25, tienda: { nombre: "A" } });
    const d = oferta({ precio: 10, formato_ml: 1500 });
    expect(ofertasDelFormato([a, b, c, d], 750).map((o) => o.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe("resumenPrecios", () => {
  it("mínimo actual entre las disponibles y mínimo histórico del historial", () => {
    const a = oferta({
      precio: 22,
      historial: [
        { precio: 19, desde: "2026-09-01T00:00:00Z", hasta: "2026-10-01T00:00:00Z" },
        { precio: 22, desde: "2026-10-01T00:00:00Z", hasta: null },
      ],
    });
    const b = oferta({ precio: 15, disponible: false, historial: [{ precio: 15, desde: "2026-10-05T00:00:00Z", hasta: null }] });
    const r = resumenPrecios([a, b]);
    expect(r.minimoActual?.id).toBe(a.id);
    expect(r.minimoHistorico).toEqual({ precio: 15, desde: "2026-10-05T00:00:00Z" });
  });
  it("sin ofertas disponibles ni historial", () => {
    expect(resumenPrecios([oferta({ disponible: false })])).toEqual({ minimoActual: null, minimoHistorico: null });
  });
});

describe("serieMinimo", () => {
  it("un punto por cambio del mínimo entre tiendas", () => {
    const a = oferta({
      historial: [
        { precio: 20, desde: "2026-10-01T10:00:00Z", hasta: "2026-10-05T10:00:00Z" },
        { precio: 18, desde: "2026-10-05T10:00:00Z", hasta: null },
      ],
    });
    const b = oferta({
      historial: [
        { precio: 19, desde: "2026-10-03T08:00:00Z", hasta: "2026-10-04T08:00:00Z" },
        { precio: 21, desde: "2026-10-04T08:00:00Z", hasta: null },
      ],
    });
    expect(serieMinimo([a, b], new Date("2026-10-10T00:00:00Z"))).toEqual([
      { fecha: "2026-10-01", precio: 20 },
      { fecha: "2026-10-03", precio: 19 },
      { fecha: "2026-10-04", precio: 20 },
      { fecha: "2026-10-05", precio: 18 },
    ]);
  });
  it("sin historial no hay serie", () => {
    expect(serieMinimo([oferta()])).toEqual([]);
  });
});

describe("urlOferta", () => {
  it("usa la plantilla de afiliación si la hay", () => {
    expect(urlOferta(oferta({ url: "https://t.example/a?b=1" }))).toBe("https://t.example/a?b=1");
    expect(
      urlOferta(oferta({ url: "https://t.example/a?b=1", tienda: { afiliacion_plantilla: "https://af.example/r?u={url}" } })),
    ).toBe("https://af.example/r?u=https%3A%2F%2Ft.example%2Fa%3Fb%3D1");
  });
});
