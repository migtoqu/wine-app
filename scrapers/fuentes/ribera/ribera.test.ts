import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { urlEjecucionActions } from "../../lib/ejecucion.ts";
import { igualesJson } from "../../lib/json.ts";
import { camposCambiados, candidatosSlug } from "./guardar.ts";
import { normalizarFicha } from "./normalizar.ts";
import { parsearFicha, parsearListado, ubicacionDesdeIframe, urlListado } from "./parsear.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const URL_AALTO = "https://www.riberadelduero.es/bodegas/aalto-bodegas-y-vinedos";

describe("parsearListado", () => {
  it("extrae fichas sin duplicados y la última página", () => {
    const l = parsearListado(fixture("listado.html"));
    expect(l.fichas).toEqual([
      "https://www.riberadelduero.es/bodegas/41-norte-sl",
      URL_AALTO,
    ]);
    expect(l.ultimaPagina).toBe(25);
  });

  it("sin paginador → null", () => {
    expect(parsearListado("<ul class='bodegas__list'></ul>")).toEqual({ fichas: [], ultimaPagina: null });
  });

  it("URL de listado sin texto de búsqueda", () => {
    expect(urlListado(3)).toBe("https://www.riberadelduero.es/bodegas/resultados?termino=&page=3");
  });
});

describe("parsearFicha", () => {
  it("lee los datos factuales de una ficha real", () => {
    const f = parsearFicha(fixture("ficha-aalto.html"), URL_AALTO);
    expect(f).toEqual({
      url: URL_AALTO,
      slug_fuente: "aalto-bodegas-y-vinedos",
      nodo: "492",
      nombre: "AALTO BODEGAS Y VIÑEDOS.",
      direccion: {
        linea1: "Paraje Vallejo de Carril, S/N",
        codigo_postal: "47360",
        municipio: "Quintanilla de Arriba",
        provincia: "Valladolid",
        pais: "España",
      },
      direccion_sociedad: {
        linea1: "Paraje Vallejo de Carril, S/N",
        codigo_postal: "47360",
        municipio: "Quintanilla de Arriba",
        provincia: "Valladolid",
        pais: "España",
      },
      email: "aalto@aalto.es",
      email_sociedad: "aalto@aalto.es",
      telefono: "+34 983 036 949",
      telefono_href: "+34983036949",
      web: "http://www.aalto.es",
      web_sociedad: "http://www.aalto.es",
      venta_online: null,
      ubicacion: { lat: 41.62417, lng: -4.25687 },
      marcas: ["AALTO", "AALTO PS"],
    });
  });

  it("tolera campos vacíos", () => {
    const f = parsearFicha(fixture("ficha-sin-email.html"), "https://www.riberadelduero.es/bodegas/bodega-ejemplo-sl");
    expect(f.nodo).toBeNull();
    expect(f.email).toBeNull();
    expect(f.email_sociedad).toBe("Info@Ejemplo.example");
    expect(f.web).toBeNull();
    expect(f.venta_online).toBe("https://tienda.example.com");
    expect(f.ubicacion).toBeNull();
    expect(f.marcas).toEqual([]);
  });

  it("sin h1 es un error de ficha", () => {
    expect(() => parsearFicha("<main></main>", URL_AALTO)).toThrow(/sin nombre/);
  });
});

describe("ubicacionDesdeIframe", () => {
  it("lee q=lat,lng e ignora el resto", () => {
    expect(ubicacionDesdeIframe("https://www.google.com/maps/embed/v1/place?key=X&q=41.6%2C-3.7&zoom=8")).toEqual({
      lat: 41.6,
      lng: -3.7,
    });
    expect(ubicacionDesdeIframe("https://www.google.com/maps/embed/v1/place?q=Aranda")).toBeNull();
    expect(ubicacionDesdeIframe("https://www.google.com/maps/embed/v1/place?q=0%2C0")).toBeNull();
    expect(ubicacionDesdeIframe(undefined)).toBeNull();
  });
});

describe("normalizarFicha", () => {
  it("produce los campos de bodegas y las claves para emparejar", () => {
    const n = normalizarFicha(parsearFicha(fixture("ficha-aalto.html"), URL_AALTO));
    expect(n.idExterno).toBe("nodo:492");
    expect(n.campos).toEqual({
      nombre: "Aalto Bodegas y Viñedos",
      direccion: "Paraje Vallejo de Carril, S/N",
      codigo_postal: "47360",
      municipio: "Quintanilla de Arriba",
      provincia: "Valladolid",
      comunidad: "Castilla y León",
      ubicacion: "SRID=4326;POINT(-4.25687 41.62417)",
      web: "http://www.aalto.es",
      telefono: "+34 983 036 949",
      email: "aalto@aalto.es",
    });
    expect(n.datos.clave_nombre).toBe("aalto");
    expect(n.datos.claves_marcas).toEqual(["aalto", "aalto ps"]);
    // Nunca se guarda la descripción ni la clave del mapa.
    expect(JSON.stringify(n)).not.toMatch(/key=|field--name-body/);
  });

  it("usa los datos de la sociedad si faltan los principales y el slug si no hay nodo", () => {
    const n = normalizarFicha(
      parsearFicha(fixture("ficha-sin-email.html"), "https://www.riberadelduero.es/bodegas/bodega-ejemplo-sl"),
    );
    expect(n.idExterno).toBe("slug:bodega-ejemplo-sl");
    expect(n.campos.nombre).toBe("Bodegas Ejemplo de la Ribera");
    expect(n.campos.email).toBe("info@ejemplo.example");
    expect(n.campos.telefono).toBe("+34 947 000 000");
    expect(n.campos.direccion).toBe("Ctra. de Pesquera, Km 3");
    expect(n.campos.municipio).toBe("Aranda de Duero");
    expect(n.campos.codigo_postal).toBe("09400");
    expect(n.campos.provincia).toBe("Burgos");
    expect(n.campos.comunidad).toBe("Castilla y León");
    expect(n.campos.web).toBe("http://www.ejemplo.example");
    expect(n.datos.clave_nombre).toBe("ejemplo ribera");
  });
});

describe("guardado (lógica pura)", () => {
  const n = normalizarFicha(parsearFicha(fixture("ficha-aalto.html"), URL_AALTO));

  it("slug propio con alternativas por municipio y sufijo", () => {
    const c = candidatosSlug(n.campos, n.datos.slug_fuente);
    expect(c.slice(0, 3)).toEqual([
      "aalto-bodegas-y-vinedos",
      "aalto-bodegas-y-vinedos-quintanilla-de-arriba",
      "aalto-bodegas-y-vinedos-2",
    ]);
  });

  it("solo reescribe los campos que cambiaron en la fuente", () => {
    expect(camposCambiados(n.campos, n.campos)).toEqual([]);
    expect(camposCambiados(n.campos, { ...n.campos, telefono: "+34 983 000 000" })).toEqual(["telefono"]);
    expect(camposCambiados(null, n.campos)).toHaveLength(10);
  });

  it("compara jsonb sin depender del orden de claves", () => {
    expect(igualesJson({ a: 1, b: { c: [1, 2], d: null } }, { b: { d: null, c: [1, 2] }, a: 1 })).toBe(true);
    expect(igualesJson({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("urlEjecucionActions", () => {
  it("compone la URL de la ejecución de Actions", () => {
    expect(
      urlEjecucionActions({
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "migtoqu/wine-app",
        GITHUB_RUN_ID: "123",
      }),
    ).toBe("https://github.com/migtoqu/wine-app/actions/runs/123");
    expect(urlEjecucionActions({})).toBeNull();
  });
});
