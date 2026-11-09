import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import es from "@/i18n/dictionaries/es";
import type { Oferta } from "@/lib/catalog/types";
import { WhereToBuy } from "./where-to-buy";

const tienda = (nombre: string): Oferta["tienda"] => ({
  slug: nombre.toLowerCase(),
  nombre,
  web: `https://${nombre.toLowerCase()}.example`,
  logo_url: null,
  info_envio: null,
  afiliacion_plantilla: null,
});

const ofertas: Oferta[] = [
  {
    id: "a",
    url: "https://a.example/vino",
    precio: 21.9,
    formato_ml: 750,
    disponible: true,
    visto_por_ultima_vez: "2026-11-08T10:00:00Z",
    anio: 2020,
    con_anada: true,
    tienda: tienda("Alfa"),
    historial: [
      { precio: 19.5, desde: "2026-10-01T10:00:00Z", hasta: "2026-10-20T10:00:00Z" },
      { precio: 21.9, desde: "2026-10-20T10:00:00Z", hasta: null },
    ],
  },
  {
    id: "b",
    url: "https://b.example/vino",
    precio: 18,
    formato_ml: 750,
    disponible: false,
    visto_por_ultima_vez: "2026-11-08T10:00:00Z",
    anio: null,
    con_anada: false,
    tienda: tienda("Beta"),
    historial: [{ precio: 18, desde: "2026-11-01T10:00:00Z", hasta: null }],
  },
  {
    id: "c",
    url: "https://c.example/magnum",
    precio: 49,
    formato_ml: 1500,
    disponible: true,
    visto_por_ultima_vez: "2026-11-08T10:00:00Z",
    anio: 2019,
    con_anada: true,
    tienda: tienda("Alfa"),
    historial: [{ precio: 49, desde: "2026-11-01T10:00:00Z", hasta: null }],
  },
];

const render = (formato: number | null, lista = ofertas) =>
  renderToStaticMarkup(
    createElement(WhereToBuy, {
      lang: "es",
      dict: es,
      ofertas: lista,
      formato,
      hrefFormato: (ml: number) => `/es/vino/x?formato=${ml}`,
    }),
  );

describe("WhereToBuy", () => {
  it("75 cl: mejor precio disponible, mínimo histórico, selector de formato, ofertas y gráfica", () => {
    const html = render(750);
    expect(html).toContain("Dónde comprar");
    expect(html).toMatch(/Mejor precio ahora.*21,90\s€.*en Alfa/s);
    expect(html).toMatch(/Mínimo histórico.*18,00\s€/s);
    expect(html).toContain('href="/es/vino/x?formato=1500"');
    expect(html).toContain("1,5 l");
    expect(html).toContain('aria-current="true"');
    // Disponible primero; la agotada después, sin añada indicada.
    expect(html.indexOf("Alfa")).toBeLessThan(html.indexOf("Beta"));
    expect(html).toContain("Agotado");
    expect(html).toContain("No indicada");
    expect(html).not.toContain("magnum");
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('role="img"');
    expect(html).toContain("Ver los datos de la gráfica");
  });

  it("otro formato y sin ofertas", () => {
    expect(render(1500)).toContain("https://c.example/magnum");
    expect(render(null, [])).toContain("Todavía no tenemos precios de este vino.");
  });
});
