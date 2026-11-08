import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anioFundacion, crianzaDe, duracionMinutos, idiomasDe, normalizarBodega, normalizarExperiencia, normalizarVino,
  partirDireccion, precioDesde, provinciaDe, separarAnada, tipoServicio, tipoVino,
} from "./normalizar.ts";
import { parsearBodega, parsearExperiencia, parsearPrecio, parsearSitemap, parsearVino, slugDe, urlFicha } from "./parsear.ts";
import { resolverBodegas } from "./resolver.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const U = "https://riojawine.com/es";

describe("sitemap", () => {
  it("separa bodegas, vinos y experiencias sin duplicados y descarta índices", () => {
    const xml = `<urlset>
      <url><loc>https://riojawine.com/bodegas-rioja/</loc></url>
      <url><loc>https://riojawine.com/bodegas-rioja/bodegas-muga/</loc></url>
      <url><loc>https://riojawine.com/es/bodegas-rioja/bodegas-muga/</loc></url>
      <url><loc>https://riojawine.com/vinos-rioja/ysios-los-prados/</loc></url>
      <url><loc>https://riojawine.com/experiencia/a-pie-de-vina</loc></url>
      <url><loc>https://riojawine.com/visita-rioja/municipios/haro/</loc></url></urlset>`;
    expect(parsearSitemap(xml)).toEqual({
      bodegas: ["bodegas-muga"], vinos: ["ysios-los-prados"], experiencias: ["a-pie-de-vina"],
    });
  });
  it("URLs con /es/ para evitar la redirección", () => {
    expect(urlFicha("vino", "x-y")).toBe("https://riojawine.com/es/vinos-rioja/x-y/");
    expect(slugDe("https://riojawine.com/es/experiencia/a-pie-de-vina/", "experiencia")).toBe("a-pie-de-vina");
    expect(slugDe("https://riojawine.com/es/vinos-rioja/", "vino")).toBeNull();
  });
});

describe("bodega (ficha real)", () => {
  const ficha = parsearBodega(fixture("bodega-muga.html"), `${U}/bodegas-rioja/bodegas-muga/`);
  it("lee contacto, territorio y coordenadas", () => {
    expect(ficha).toMatchObject({
      slug_fuente: "bodegas-muga", nombre: "BODEGAS MUGA", zona: "Rioja Alta", municipio: "Haro",
      contacto: {
        web: "http://www.bodegasmuga.com", telefono: "941311825", email: "visitas@bodegasmuga.com",
        direccion_texto: "Avda. Vizcaya, Barrio de la Estación, 2, 26200 Haro",
      },
      ubicacion: { lat: 42.5823388, lng: -2.846753900000067 },
      experiencias_enlazadas: ["muga-desde-el-cielo"],
      vinos_enlazados: [],
    });
    expect(ficha.visitas["PVP"]).toEqual(["Desde 25€"]);
  });
  it("normaliza campos y hechos sin copiar texto", () => {
    const n = normalizarBodega(ficha);
    expect(n.idExterno).toBe("bodega:bodegas-muga");
    expect(n.campos).toMatchObject({
      nombre: "Bodegas Muga", direccion: "Avda. Vizcaya, Barrio de la Estación, 2", codigo_postal: "26200",
      municipio: "Haro", provincia: "La Rioja", comunidad: "La Rioja", web: "http://www.bodegasmuga.com",
      email: "visitas@bodegasmuga.com", anio_fundacion: 1932,
    });
    expect(n.campos.ubicacion).toMatch(/^SRID=4326;POINT\(/);
    expect(n.hechos.map((h) => h.clave)).toEqual([
      "bodega.nombre", "bodega.municipio", "bodega.provincia", "bodega.denominacion", "bodega.fundacion_anio", "bodega.enoturismo",
    ]);
    expect(n.clave_nombre).toBe("muga");
  });
  it("fundación solo con patrones inequívocos", () => {
    expect(anioFundacion("Bodega familiar desde 1932 - Haro")).toBe(1932);
    expect(anioFundacion("Fundada en 1890")).toBe(1890);
    expect(anioFundacion("Bodega en 1999 hectáreas")).toBeNull();
    expect(anioFundacion(null)).toBeNull();
  });
  it("dirección", () => {
    expect(partirDireccion("Ctra. Villar de Torre, s/n, 26310 Badarán, La Rioja")).toEqual({ calle: "Ctra. Villar de Torre, s/n", cp: "26310" });
    expect(partirDireccion(null)).toEqual({ calle: null, cp: null });
  });
});

describe("provincia (nunca La Rioja por defecto)", () => {
  it("código postal manda", () => {
    expect(provinciaDe("01300", "Laguardia", null)).toBe("Álava");
    expect(provinciaDe("31230", "Viana", null)).toBe("Navarra");
    expect(provinciaDe("26200", "Haro", null)).toBe("La Rioja");
  });
  it("sin CP: tabla de municipios y zona Alavesa", () => {
    expect(provinciaDe(null, "Elciego", "Rioja Alavesa")).toBe("Álava");
    expect(provinciaDe(null, "Viana", "Rioja Oriental")).toBe("Navarra");
    expect(provinciaDe(null, "Zzz", "Rioja Alavesa")).toBe("Álava");
  });
  it("sin pistas → null", () => {
    expect(provinciaDe(null, "Haro", "Rioja Alta")).toBeNull();
    expect(provinciaDe(null, null, null)).toBeNull();
  });
});

describe("vino (ficha real)", () => {
  const ficha = parsearVino(fixture("vino-ysios-los-prados.html"), `${U}/vinos-rioja/ysios-los-prados/`);
  it("lee nombre, bodega, detalles, uvas y hermanos", () => {
    expect(ficha).toMatchObject({
      nombre: "Ysios Los Prados", bodega_texto: "Bodega Ysios", zona: "Rioja Alavesa", precio: 60,
      tipo_texto: "Tinto", envejecimiento_texto: "Genérico", anada_texto: "2021", uvas: ["Tempranillo"],
      vinos_hermanos: ["ysios-2016", "ysios-blanco", "ysios-grano-a-grano"],
    });
  });
  it("normaliza tipo, crianza, añada y hechos", () => {
    const n = normalizarVino(ficha);
    expect(n.idExterno).toBe("vino:ysios-los-prados");
    expect(n.vino).toEqual({ nombre: "Ysios Los Prados", tipo: "tinto", crianza: null });
    expect(n.anada).toEqual({ anio: 2021 });
    expect(n.clave_bodega).toBe("ysios");
    expect(n.hechos).toContainEqual({ clave: "anada.variedad", valor: null, sujeto: "Tempranillo" });
    expect(JSON.stringify(n)).not.toContain("omitida");
  });
  it("tipo, crianza y añada en el nombre", () => {
    expect(tipoVino("Tinto")).toBe("tinto");
    expect(tipoVino("Espumoso")).toBe("espumoso");
    expect(tipoVino("Raro")).toBeNull();
    expect(crianzaDe("Genérico", "Lecea Gran Reserva")).toBe("gran_reserva");
    expect(crianzaDe("Reserva", "X")).toBe("reserva");
    expect(crianzaDe("Genérico", "Ysios")).toBeNull();
    expect(separarAnada("Irujo Crianza 2018", null)).toEqual({ nombre: "Irujo Crianza", anio: 2018 });
    expect(separarAnada("Ysios", "2021")).toEqual({ nombre: "Ysios", anio: 2021 });
    expect(separarAnada("1900", null)).toEqual({ nombre: "1900", anio: null });
  });
  it("precio con coma y miles", () => {
    expect(parsearPrecio("€60,00")).toBe(60);
    expect(parsearPrecio("€1.200,50 ")).toBe(1200.5);
    expect(parsearPrecio("sin precio")).toBeNull();
  });
});

describe("experiencia (ficha real)", () => {
  const ficha = parsearExperiencia(fixture("experiencia-a-pie-de-vina.html"), `${U}/experiencia/a-pie-de-vina/`);
  it("lee reserva, bodega enlazada y condiciones", () => {
    expect(ficha).toMatchObject({
      titulo: "A Pie de Viña", municipio: "Badarán", bodega_slug: "bodegas-david-moreno",
      url_reserva: "https://davidmoreno.es/enoexperiencia/?visita-a-pie-de-vina",
    });
    expect(ficha.info["Duración"]).toEqual(["2h"]);
  });
  it("normaliza servicio", () => {
    const n = normalizarExperiencia(ficha);
    expect(n.idExterno).toBe("exp:a-pie-de-vina");
    expect(n.tipo).toBe("actividad"); // ni el título ni «incluye» hablan de visita o cata
    expect(n.bodega_slug).toBe("bodegas-david-moreno");
    expect(n.campos).toEqual({
      precio_desde: 8, duracion_minutos: 120, idiomas: ["es", "en"],
      horario: "Todo el año · Sábados, Domingos: 10:30 a 12:30",
      url_reserva: "https://davidmoreno.es/enoexperiencia/?visita-a-pie-de-vina",
    });
  });
  it("tipo, precio, duración e idiomas", () => {
    expect(tipoServicio("Cata de vinos", [])).toBe("cata");
    expect(tipoServicio("Comida en la bodega", [])).toBe("restaurante");
    expect(tipoServicio("Paseo en globo", [])).toBe("actividad");
    expect(tipoServicio("Empresas MICE", [])).toBe("evento");
    expect(precioDesde(["Desde 25€"])).toBe(25);
    expect(precioDesde(["Gratuito"])).toBe(0);
    expect(precioDesde(undefined)).toBeNull();
    expect(duracionMinutos(["1h 30min"])).toBe(90);
    expect(duracionMinutos(["45 min"])).toBe(45);
    expect(duracionMinutos(["Variable"])).toBeNull();
    expect(idiomasDe(["Castellano, Inglés y Francés"])).toEqual(["es", "en", "fr"]);
  });
});

describe("resolver vino → bodega", () => {
  const bodegas = [
    { idExterno: "bodega:bodegas-ysios", clave: "ysios" },
    { idExterno: "bodega:bodegas-muga", clave: "muga" },
    { idExterno: "bodega:marques-de-riscal", clave: "marques riscal" },
  ];
  const v = (slug: string, clave_bodega: string, hermanos: string[] = []) => ({ slug, clave_bodega, hermanos });
  it("enlace explícito > nombre > hermanos", () => {
    const r = resolverBodegas(
      [v("a", "ysios"), v("b", "otra cosa", ["a"]), v("c", "desconocida"), v("d", "xx")],
      bodegas,
      new Map([["d", "bodega:bodegas-muga"]]),
    );
    expect(r.get("a")).toMatchObject({ idExterno: "bodega:bodegas-ysios", motivo: "nombre" });
    expect(r.get("b")).toMatchObject({ idExterno: "bodega:bodegas-ysios", motivo: "hermano" });
    expect(r.get("c")).toMatchObject({ idExterno: null, motivo: "sin_candidata" });
    expect(r.get("d")).toMatchObject({ idExterno: "bodega:bodegas-muga", motivo: "enlace" });
  });
  it("hermanos que discrepan no heredan", () => {
    const r = resolverBodegas([v("a", "ysios", ["b", "c"]), v("b", "muga", ["a"]), v("c", "zz", ["a"])], bodegas);
    expect(r.get("c")!.idExterno).toBeNull();
  });
  it("nombre ambiguo no se resuelve", () => {
    const r = resolverBodegas([v("a", "muga")], [...bodegas, { idExterno: "bodega:muga-2", clave: "muga" }]);
    expect(r.get("a")).toMatchObject({ idExterno: null, motivo: "ambigua" });
  });
});
