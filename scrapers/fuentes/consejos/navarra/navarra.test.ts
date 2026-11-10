import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  duracionDe,
  mesesBarrica,
  normalizarBodega,
  normalizarExperiencia,
  normalizarVino,
  ofreceVisitas,
  partirDireccion,
  partirVariedades,
} from "./normalizar.ts";
import {
  coordenadasIframe,
  parsearBodega,
  parsearExperiencia,
  parsearIndiceSitemaps,
  parsearSitemap,
  parsearVino,
  parsearZonas,
  slugDe,
} from "./parsear.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const URL_OCHOA = "https://navarrawine.com/bodegas/bodegas-ochoa/";
const URL_VINO = "https://navarrawine.com/vinos/crianza-pagos-de-araiz/";
const URL_EXP = "https://navarrawine.com/experiencias/pagos-de-araiz-experiencia/";

describe("sitemaps y listado", () => {
  it("índice: solo los sitemaps de bodegas, vinos y experiencias", () => {
    expect(parsearIndiceSitemaps(fixture("sitemap_index.xml"))).toEqual({
      bodega: ["https://navarrawine.com/bodegas-sitemap.xml"],
      vino: ["https://navarrawine.com/vinos-sitemap1.xml", "https://navarrawine.com/vinos-sitemap2.xml"],
      experiencia: ["https://navarrawine.com/experiencias-sitemap.xml"],
    });
  });

  it("sitemap: slugs únicos, sin la portada del tipo ni otros idiomas", () => {
    expect(parsearSitemap(fixture("bodegas-sitemap.xml"), "bodega")).toEqual(["bodegas-pagos-de-araiz", "bodegas-ochoa"]);
  });

  it("slugDe", () => {
    expect(slugDe("https://www.navarrawine.com/vinos/zarpas/", "vino")).toBe("zarpas");
    expect(slugDe("https://navarrawine.com/vinos-principal", "vino")).toBeNull();
    expect(slugDe("https://otra.com/vinos/zarpas/", "vino")).toBeNull();
  });

  it("zonas del listado", () => {
    expect([...parsearZonas(fixture("listado-zonas.html"))]).toEqual([
      ["bodega-eslava", "Baja Montaña"],
      ["otazu", "Valdizarbe"],
    ]);
  });
});

describe("bodega", () => {
  it("ficha: contacto, web, coordenadas, enoturismo y enlaces a vinos y experiencias", () => {
    const f = parsearBodega(fixture("bodega-ochoa.html"), URL_OCHOA);
    expect(f).toEqual({
      url: URL_OCHOA,
      slug_fuente: "bodegas-ochoa",
      nombre: "Bodegas Ochoa",
      direccion_texto: "C/Miranda de Arga 35",
      telefono: "+34 948 740 006",
      email: "info@bodegasochoa.com",
      web: "https://bodegasochoa.com/",
      ubicacion: { lat: 42.4850253989465, lng: -1.657372884036549 },
      enoturismo: ["Degustación de vinos", "Visitas a Bodegas con degustación"],
      instalaciones: ["Tienda", "Wine Bar"],
      vinos_enlazados: ["labrit-tinto", "ochoa-reserva"],
      experiencias_enlazadas: ["vivimos-el-vino"],
    });
    expect(JSON.stringify(f)).not.toContain("descripción");
  });

  it("normalizada: provincia única de la D.O., municipio de la experiencia si la ficha no lo trae", () => {
    const f = parsearBodega(fixture("bodega-ochoa.html"), URL_OCHOA);
    const n = normalizarBodega(f, "Ribera Alta", "Olite");
    expect(n.idExterno).toBe("bodega:bodegas-ochoa");
    expect(n.campos).toMatchObject({
      nombre: "Bodegas Ochoa", direccion: "C/Miranda de Arga 35", municipio: "Olite", provincia: "Navarra",
      comunidad: "Comunidad Foral de Navarra", web: "https://bodegasochoa.com", anio_fundacion: null,
      ubicacion: "SRID=4326;POINT(-1.657372884036549 42.4850253989465)",
    });
    expect(n.datos).toMatchObject({ slug_fuente: "bodegas-ochoa", extra: { zona: "Ribera Alta" } });
    expect(n.hechos).toContainEqual({ clave: "bodega.denominacion", valor: "Navarra" });
    expect(n.hechos).toContainEqual({ clave: "bodega.enoturismo", valor: true });
    expect(normalizarBodega(f, null).campos.municipio).toBeNull();
  });

  it("partirDireccion y visitas", () => {
    expect(partirDireccion("Camino de Araiz S/N Olite")).toEqual({ calle: "Camino de Araiz S/N", municipio: "Olite" });
    expect(partirDireccion("Ctra. Estella, km 3, Puente la Reina")).toEqual({ calle: "Ctra. Estella, km 3", municipio: "Puente la Reina" });
    expect(partirDireccion("C/Miranda de Arga 35")).toEqual({ calle: "C/Miranda de Arga 35", municipio: null });
    expect(partirDireccion(null)).toEqual({ calle: null, municipio: null });
    expect(ofreceVisitas(["Wine Bar", "Visitas o actividades de viñedo"])).toBe(true);
    expect(ofreceVisitas(["Conciertos"])).toBe(false);
  });
});

describe("vino", () => {
  it("ficha: nombre, precio, bodega enlazada, tipo, uvas y crianza", () => {
    const f = parsearVino(fixture("vino-crianza-pagos-de-araiz.html"), URL_VINO);
    expect(f).toEqual({
      url: URL_VINO,
      slug_fuente: "crianza-pagos-de-araiz",
      nombre: "Crianza Pagos de Araiz",
      bodega_texto: "Bodegas Pagos de Araiz",
      bodega_slug: "bodegas-pagos-de-araiz",
      precio_texto: "7,90€",
      tipo_texto: "Tinto Crianza",
      variedades_texto: "Tempranillo, Cabernet Sauvignon, Merlot",
      crianza_texto: "11 meses de roble francés y americano.",
      tienda: "https://tienda.masaveubodegas.com/vinos-tintos/305-337-pagos-de-araiz-crianza.html",
      vinos_hermanos: ["roble-pagos-de-araiz"],
    });
  });

  it("normalizado: tipo, crianza, variedades, meses de barrica y D.O.", () => {
    const n = normalizarVino(parsearVino(fixture("vino-crianza-pagos-de-araiz.html"), URL_VINO));
    expect(n.idExterno).toBe("vino:crianza-pagos-de-araiz");
    expect(n.vino).toEqual({ nombre: "Crianza Pagos de Araiz", tipo: "tinto", crianza: "crianza" });
    expect(n.variedades.map((v) => v.nombre)).toEqual(["Tempranillo", "Cabernet Sauvignon", "Merlot"]);
    expect(n.clave_bodega).toBe("pagos araiz");
    expect(n.hechos).toContainEqual({ clave: "anada.barrica_meses", valor: 11, unidad: "meses" });
    expect(n.hechos).toContainEqual({ clave: "vino.denominacion", valor: "Navarra" });
    expect(n.datos.precio).toBe(7.9);
  });

  it("helpers", () => {
    expect(partirVariedades("Garnacha 80%, Tempranillo y Merlot.")).toEqual(["Garnacha", "Tempranillo", "Merlot"]);
    expect(partirVariedades(null)).toEqual([]);
    expect(mesesBarrica("6 meses en barrica")).toBe(6);
    expect(mesesBarrica("Sin crianza")).toBeNull();
    expect(normalizarVino({ ...parsearVino(fixture("vino-crianza-pagos-de-araiz.html"), URL_VINO), tipo_texto: "Dulce Natural", nombre: "Moscatel 2021" }).vino)
      .toMatchObject({ nombre: "Moscatel", tipo: "dulce" });
  });
});

describe("experiencia", () => {
  it("ficha y normalizada: precio, duración en horas sin unidad, idiomas, horario, reserva y bodega", () => {
    const f = parsearExperiencia(fixture("experiencia-pagos-de-araiz.html"), URL_EXP);
    expect(f).toMatchObject({
      titulo: "Pagos de Araiz EXPERIENCIA",
      tipo: "visita",
      bodega_slug: "bodegas-pagos-de-araiz",
      url_reserva: "https://bodegaspagosdearaiz.com/enoexperiencia/?visita-pagos-de-araiz",
      direccion_texto: "Camino de Araiz S/N Olite",
      info: { precio: "30,00€", duracion: "2", idioma: "Castellano, Inglés", temporada: "Todo el año" },
    });
    expect(JSON.stringify(f)).not.toContain("cata de tres vinos");
    const n = normalizarExperiencia(f);
    expect(n.idExterno).toBe("exp:pagos-de-araiz-experiencia");
    expect(n.campos).toEqual({
      precio_desde: 30,
      duracion_minutos: 120,
      idiomas: ["es", "en"],
      horario: "Todo el año · Martes: 11:00hs Sábado: 11hs y 16hs.",
      url_reserva: "https://bodegaspagosdearaiz.com/enoexperiencia/?visita-pagos-de-araiz",
    });
  });

  it("duracionDe", () => {
    expect(duracionDe("1,5")).toBe(90);
    expect(duracionDe("90 min")).toBe(90);
    expect(duracionDe("2 horas")).toBe(120);
    expect(duracionDe("40")).toBeNull();
    expect(duracionDe(undefined)).toBeNull();
  });

  it("coordenadasIframe", () => {
    expect(coordenadasIframe("https://www.google.com/maps/embed/v1/place?key=K&q=42.5%2C+-1.6")).toEqual({ lat: 42.5, lng: -1.6 });
    expect(coordenadasIframe("https://www.google.com/maps/embed/v1/place?q=Olite")).toBeNull();
    expect(coordenadasIframe(undefined)).toBeNull();
  });
});
