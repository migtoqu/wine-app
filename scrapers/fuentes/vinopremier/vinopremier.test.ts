import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anioFicha,
  formatoDesde,
  graduacion,
  mesesBarrica,
  nombreSinPrefijo,
  normalizarVino,
  temperaturaServicio,
  uvasDesdeTexto,
} from "./normalizar.ts";
import { hechosVinopremier } from "./guardar.ts";
import { CATEGORIAS, parsearFicha, parsearListado, rutaProducto, urlListado } from "./parsear.ts";

const [RIBERA, RIOJA] = CATEGORIAS;
const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const ficha = (f: string, slug: string) => parsearFicha(fixture(f), `https://vinopremier.com/${slug}.html`);

describe("listado", () => {
  it("solo genera URLs limpias y ?p=N", () => {
    expect(urlListado(RIBERA, 1)).toBe("https://vinopremier.com/vinos/denominaciones/d-o-ribera-del-duero");
    expect(urlListado(RIOJA, 3)).toBe("https://vinopremier.com/vinos/denominaciones/d-o-rioja?p=3");
  });

  it("toma solo la rejilla principal (ignora carruseles), el total y el paginador", () => {
    const l = parsearListado(fixture("listado-ribera.html"), RIBERA);
    expect(l.tarjetas.map((t) => rutaProducto(t.url))).toEqual([
      "vino-tinto-arzuaga-reserva",
      "vino-tinto-bosque-de-matasnos-crianza",
      "vino-tinto-carmelo-rodero-crianza",
      "vino-tinto-vetusta-carrascalon-alto",
    ]);
    expect(l.tarjetas[0]!.nombre).toBe("Vino Tinto Arzuaga Reserva");
    expect(l.total).toBe(369);
    expect(l.maxPagina).toBe(5);
  });

  it("categoría pequeña: total sin paginador", () => {
    const l = parsearListado(fixture("listado-rioja.html"), RIOJA);
    expect(l.tarjetas).toHaveLength(3);
    expect(l.total).toBe(18);
    expect(l.maxPagina).toBeNull();
  });
});

describe("ficha", () => {
  it("lee JSON-LD, EAN y bodega", () => {
    const f = ficha("ficha-aalto.html", "vino-tinto-aalto");
    expect(f).toMatchObject({
      nombre: "Vino Tinto Aalto",
      sku: "VT-AALTO",
      ean: "8437003104763",
      bodega: "Aalto",
      precio: 38.9,
      moneda: "EUR",
      disponibilidad: "InStock",
    });
    expect(f.imagen).toMatch(/^https:\/\/vinopremier\.com\/media\/catalog\/product\//);
  });

  it("sin nombre falla", () => {
    expect(() => parsearFicha("<html><body></body></html>", "https://vinopremier.com/x.html")).toThrow(/sin nombre/i);
  });
});

describe("normalizar", () => {
  it("Aalto: uvas, crianza en meses y tipo (Ribera)", () => {
    const n = normalizarVino(ficha("ficha-aalto.html", "vino-tinto-aalto"), RIBERA);
    expect(n.descarte).toBeNull();
    expect(n.idExterno).toBe("vino-tinto-aalto");
    expect(n.denominacion).toBe("ribera-del-duero");
    expect(n.vino).toEqual({ nombre: "Aalto", tipo: "tinto", crianza: null });
    expect(n.variedades).toEqual([{ nombre: "Tinto Fino", porcentaje: 100 }]);
    expect(n.anada.meses_crianza).toBe(20);
    expect(n.ean).toBe("8437003104763");
    expect(n.senales).toEqual({ bodega: "Aalto", grupo: [], vino: "Aalto" });
  });

  it("Orube Crianza: uvas sin porcentaje, 12 meses y temperatura de servicio (no la de conservación)", () => {
    const n = normalizarVino(ficha("ficha-orube-crianza.html", "vino-tinto-orube-crianza"), RIOJA);
    expect(n.denominacion).toBe("rioja");
    expect(n.vino).toEqual({ nombre: "Orube Crianza", tipo: "tinto", crianza: "crianza" });
    expect(n.variedades.map((v) => v.nombre)).toEqual(["Tempranillo", "Garnacha", "Graciano"]);
    expect(n.anada.meses_crianza).toBe(12);
    expect([n.anada.temp_servicio_min, n.anada.temp_servicio_max]).toEqual([16, 18]);
    expect(n.senales.bodega).toBe("Bodegas Orube");
  });

  it("la añada sale del slug cuando el nombre no la trae", () => {
    const f = ficha("ficha-marques-de-vargas.html", "vino-tinto-marques-de-vargas-centenario-2010-75cl");
    const n = normalizarVino(f, RIOJA);
    expect(n.anada.anio).toBe(2010);
    expect(n.datos.formato_ml).toBe(750);
    expect(n.vino.nombre).toBe("Marques de Vargas Centenario");
  });

  it("un estuche de una sola botella cuenta; el nombre pierde el prefijo", () => {
    const n = normalizarVino(ficha("ficha-estuche-centvm.html", "estuche-vino-tinto-centvm-vitis"), RIOJA);
    expect(n.descarte).toBeNull();
    expect(n.vino.nombre).toBe("Centvm Vitis");
  });

  it("descarta lo que no es vino y los packs", () => {
    expect(normalizarVino(ficha("ficha-sidra.html", "sidra-de-hielo-valveran-20-manzanas"), RIOJA).descarte).toMatch(/no es un vino/);
    const pack = ficha("ficha-aalto.html", "vino-tinto-aalto");
    pack.nombre = "Pack 3 Botellas Vino Tinto Aalto";
    expect(normalizarVino(pack, RIBERA).descarte).toBe("pack o estuche");
  });

  it("EAN inválido se ignora", () => {
    const f = ficha("ficha-aalto.html", "vino-tinto-aalto");
    f.ean = "123";
    expect(normalizarVino(f, RIBERA).ean).toBeNull();
  });

  it("no copia texto de la tienda en los datos guardados", () => {
    const n = normalizarVino(ficha("ficha-orube-crianza.html", "vino-tinto-orube-crianza"), RIOJA);
    expect(JSON.stringify(n)).not.toMatch(/excelente relaci|embajador|armoniosa/i);
  });
});

describe("extracción de hechos del texto", () => {
  it("nombreSinPrefijo", () => {
    expect(nombreSinPrefijo("Vino Tinto Orube Crianza")).toBe("Orube Crianza");
    expect(nombreSinPrefijo("Vino Orube Rosado")).toBe("Orube Rosado");
    expect(nombreSinPrefijo("Estuche Vino Tinto Centvm Vitis")).toBe("Centvm Vitis");
    expect(nombreSinPrefijo("Vino Blanco Valdelana Semidulce 2023")).toBe("Valdelana Semidulce");
  });

  it("uvas: rotuladas o en frase; ignora texto sin variedades", () => {
    expect(uvasDesdeTexto("Zona: D.O. Rioja. Uva: Tempranillo 90%, Graciano 10%. Crianza: 12 meses")).toEqual([
      { nombre: "Tempranillo", porcentaje: 90 },
      { nombre: "Graciano", porcentaje: 10 },
    ]);
    expect(uvasDesdeTexto("Un vino excelente con mucha historia.")).toEqual([]);
  });

  it("meses de barrica", () => {
    expect(mesesBarrica("crianza en barricas de roble durante 12 meses")).toBe(12);
    expect(mesesBarrica("20 meses en barricas de roble")).toBe(20);
    expect(mesesBarrica("vino joven sin crianza")).toBeNull();
  });

  it("temperatura de servicio y graduación", () => {
    expect(temperaturaServicio("A la hora de servirlo, lo ideal es una temperatura entre 16 y 18 ºC en copa")).toEqual({ min: 16, max: 18 });
    expect(temperaturaServicio("conservar a una temperatura constante entre 14 y 17 ºC")).toBeNull();
    expect(graduacion("Graduación alcohólica: 14,5 %")).toBe(14.5);
    expect(graduacion("alta graduación")).toBeNull();
  });

  it("formato y añada", () => {
    expect(formatoDesde("Vino Tinto X Magnum", "https://vinopremier.com/x.html")).toBe(1500);
    expect(formatoDesde("Vino Tinto X", "https://vinopremier.com/vino-tinto-x-9-litros.html")).toBe(9000);
    expect(formatoDesde("Vino Tinto X", "https://vinopremier.com/vino-tinto-x.html")).toBeNull();
    expect(anioFicha("Vino Tinto X 2019", "https://vinopremier.com/x.html")).toBe(2019);
    expect(anioFicha("Vino Tinto X", "https://vinopremier.com/x.html")).toBeNull();
  });
});

describe("hechos", () => {
  it("solo cifras y nombres, con D.O. y procedencia de tienda", () => {
    const n = normalizarVino(ficha("ficha-orube-crianza.html", "vino-tinto-orube-crianza"), RIOJA);
    const h = hechosVinopremier(n, "f1", "2026-11-08T00:00:00Z");
    const claves = h.map((x) => x.clave);
    expect(claves).toEqual(
      expect.arrayContaining(["vino.nombre", "vino.tipo", "vino.crianza", "vino.denominacion", "anada.barrica_meses", "anada.variedad"]),
    );
    expect(h.find((x) => x.clave === "vino.denominacion")!.valor).toBe("Rioja");
    expect(h.every((x) => x.fuente.origen === "tienda")).toBe(true);
  });
});
