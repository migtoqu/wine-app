import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anioDesde,
  crianzaDesde,
  esPack,
  formatoMl,
  gradoDesde,
  mesesDesde,
  nombreVino,
  normalizarVino,
  temperaturaDesde,
  tipoDesde,
  variedadesDesde,
} from "./normalizar.ts";
import { datosDeOnclick, parsearFicha, parsearListado, rutaProducto, urlListado } from "./parsear.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const URL_CONDE = "https://www.vinoseleccion.com/conde-san-cristobal-2023";

describe("listado", () => {
  it("solo genera URLs limpias y ?p=N", () => {
    expect(urlListado(1)).toBe("https://www.vinoseleccion.com/vinos/espana/ribera-duero");
    expect(urlListado(2)).toBe("https://www.vinoseleccion.com/vinos/espana/ribera-duero?p=2");
  });

  it("extrae tarjetas, su JSON de analítica y el máximo del paginador de la categoría", () => {
    const l = parsearListado(fixture("listado.html"));
    expect(l.maxPagina).toBe(30); // ignora el ?p=99 de otra categoría
    expect(l.tarjetas.map((t) => t.url)).toEqual([
      URL_CONDE,
      "https://www.vinoseleccion.com/vinos/marcas/protos/protos-tinto-reserva-2014",
    ]);
    const [conde, protos] = l.tarjetas;
    expect(conde!.nombre).toBe("Conde de San Cristóbal 2023");
    expect(conde!.bodega).toEqual({
      nombre: "Bodegas Conde de San Cristóbal",
      url: "https://www.vinoseleccion.com/vinos/bodegas/conde-san-cristobal",
    });
    expect(conde!.datos).toMatchObject({
      item_id: "AGR-DL0027",
      price: 21.9,
      num_bottles: 1,
      vintage_year_wine: "2023",
      grape_variety_wine: "100% Tempranillo",
      capacity: "75 cl",
      item_brand: "Pelayo de la Mata y Pobes",
    });
    expect(protos!.datos).toBeNull();
    expect(protos!.bodega).toBeNull();
  });

  it("tolera un onclick sin JSON", () => {
    expect(datosDeOnclick("window.foo()")).toBeNull();
    expect(datosDeOnclick(undefined)).toBeNull();
  });

  it("id externo = ruta del producto", () => {
    expect(rutaProducto(URL_CONDE)).toBe("conde-san-cristobal-2023");
    expect(rutaProducto("https://www.vinoseleccion.com/vinos/marcas/protos/protos-tinto-reserva-2014")).toBe(
      "vinos/marcas/protos/protos-tinto-reserva-2014",
    );
  });
});

describe("parsearFicha", () => {
  it("lee JSON-LD, características, temperatura y bodega", () => {
    const f = parsearFicha(fixture("ficha-conde.html"), URL_CONDE);
    expect(f).toEqual({
      url: URL_CONDE,
      nombre: "Conde de San Cristóbal 2023",
      sku: "AGR-DL0027",
      precio: 21.9,
      moneda: "EUR",
      disponibilidad: "InStock",
      imagen: "https://www.vinoseleccion.com/media/catalog/product/c/o/conde-san-cristobal_3.jpg",
      region: "D.O. Ribera del Duero",
      caracteristicas: {
        "Tipo de vino": "Vino Tinto",
        "Región": "D.O. Ribera del Duero",
        "Variedad de uva": "100% Tempranillo",
        "Permanencia en barrica": "12 a 14 meses",
        "Capacidad (cl)": "75",
      },
      temperatura: "15-16 ºC",
      bodega: {
        nombre: "Bodegas Conde de San Cristóbal",
        url: "https://www.vinoseleccion.com/vinos/bodegas/conde-san-cristobal",
      },
      bodeguero: "Pelayo de la Mata y Pobes",
    });
  });
});

describe("normalizarVino", () => {
  const tarjeta = parsearListado(fixture("listado.html")).tarjetas[0]!;

  it("produce vino, añada, variedades, imagen y datos de oferta", () => {
    const n = normalizarVino(parsearFicha(fixture("ficha-conde.html"), URL_CONDE), tarjeta, "conde-san-cristobal-2023");
    expect(n.descarte).toBeNull();
    expect(n.vino).toEqual({ nombre: "Conde de San Cristóbal", tipo: "tinto", crianza: null });
    expect(n.anada).toEqual({
      anio: 2023,
      temp_servicio_min: 15,
      temp_servicio_max: 16,
      meses_crianza: null, // «12 a 14 meses» es un rango
      grado: null,
    });
    expect(n.variedades).toEqual([{ nombre: "Tempranillo", porcentaje: 100 }]);
    expect(n.imagen).toMatch(/^https:\/\/www\.vinoseleccion\.com\/media\/catalog\/product\/c\/o\//);
    expect(n.senales).toEqual({
      bodega: "Bodegas Conde de San Cristóbal",
      grupo: ["Pelayo de la Mata y Pobes"],
      vino: "Conde de San Cristóbal",
    });
    expect(n.datos).toMatchObject({
      sku: "AGR-DL0027",
      precio: 21.9,
      formato_ml: 750,
      disponibilidad: "InStock",
      tarjeta: { precio: 21.9, num_botellas: 1, precio_por_botella: 21.9, en_stock: false },
    });
    // Nada de textos reservados.
    expect(JSON.stringify(n)).not.toMatch(/Nariz|Boca|Maridaje|atesora/);
  });

  it("descarta packs y estuches", () => {
    const n = normalizarVino(
      parsearFicha(fixture("ficha-pack.html"), "https://www.vinoseleccion.com/celeste-crianza-2-bot-2-copas"),
      null,
      "celeste-crianza-2-bot-2-copas",
    );
    expect(n.descarte).toBe("pack o estuche");
  });

  it("ignora temperaturas incoherentes para un tinto (caso real de Legaris Crianza)", () => {
    const html = fixture("ficha-conde.html").replace("15-16 ºC", "Degustar a un temperatura entre 6 y 8º C");
    const n = normalizarVino(parsearFicha(html, URL_CONDE), null, "x");
    expect(n.anada.temp_servicio_min).toBeNull();
    expect(n.datos.temperatura_texto).toMatch(/entre 6 y 8/);
  });

  it("descarta vinos de otra D.O.", () => {
    const html = fixture("ficha-conde.html").replaceAll("D.O. Ribera del Duero", "D.O.Ca. Rioja");
    expect(normalizarVino(parsearFicha(html, URL_CONDE), null, "x").descarte).toMatch(/región distinta/);
  });
});

describe("normalizadores", () => {
  it("packs", () => {
    expect(esPack("Celeste Crianza | 2 botellas + 2 copas")).toBe(true);
    expect(esPack("Colección Ribera del Duero Tempranillo")).toBe(true);
    expect(esPack("Estuche Pesquera 3 bot")).toBe(true);
    expect(esPack("Protos 27 2016")).toBe(false);
    expect(esPack("La Capilla Crianza Mágnum 2022")).toBe(false);
  });

  it("nombre del vino sin añada ni formato", () => {
    expect(nombreVino("La Capilla Crianza Mágnum 2022")).toBe("La Capilla Crianza");
    expect(nombreVino("Legaris Crianza 2023")).toBe("Legaris Crianza");
    expect(nombreVino("Matarromera Esencia")).toBe("Matarromera Esencia");
    expect(nombreVino("Pesquera Reserva 37,5 cl 2019")).toBe("Pesquera Reserva");
    expect(nombreVino("Protos 27 2016")).toBe("Protos 27");
  });

  it("año", () => {
    expect(anioDesde("Legaris Crianza 2023")).toBe(2023);
    expect(anioDesde("Matarromera Esencia", "")).toBeNull();
    expect(anioDesde("Matarromera Esencia", "2019")).toBe(2019);
    expect(anioDesde("Protos 27 2016")).toBe(2016);
  });

  it("formato", () => {
    expect(formatoMl("150", undefined, "")).toBe(1500);
    expect(formatoMl(undefined, "75 cl", "")).toBe(750);
    expect(formatoMl(undefined, "1,5 l", "")).toBe(1500);
    expect(formatoMl(undefined, undefined, "X Mágnum 2020")).toBe(1500);
    expect(formatoMl(undefined, undefined, "X 2020")).toBeNull();
  });

  it("tipo y crianza", () => {
    expect(tipoDesde("Vino Tinto", "")).toBe("tinto");
    expect(tipoDesde("Tinto Crianza", "")).toBe("tinto");
    expect(tipoDesde("Vino Rosado", "")).toBe("rosado");
    expect(tipoDesde(null, "Pago de Carraovejas Blanco 2024")).toBe("blanco");
    expect(tipoDesde(null, "Pago de Carraovejas 2022")).toBeNull();
    expect(crianzaDesde("Protos Gran Reserva 2016", null)).toBe("gran_reserva");
    expect(crianzaDesde("Matarromera Reserva 2017", null)).toBe("reserva");
    expect(crianzaDesde("Celeste", "Tinto Crianza")).toBe("crianza");
    expect(crianzaDesde("Arzuaga Roble 2024", null)).toBe("roble");
    expect(crianzaDesde("Conde de San Cristóbal 2023", "Vino Tinto")).toBeNull();
  });

  it("temperatura de servicio", () => {
    expect(temperaturaDesde("15-16 ºC")).toEqual({ min: 15, max: 16 });
    expect(temperaturaDesde("17 ºC")).toEqual({ min: 17, max: 17 });
    expect(temperaturaDesde("Degustar a un temperatura entre 6 y 8º C")).toEqual({ min: 6, max: 8 });
    expect(temperaturaDesde("16 a 18 ºC")).toEqual({ min: 16, max: 18 });
    expect(temperaturaDesde("Recomendamos decantar")).toBeNull();
    expect(temperaturaDesde("45 ºC")).toBeNull();
  });

  it("meses de crianza y grado", () => {
    expect(mesesDesde("12 meses")).toBe(12);
    expect(mesesDesde("12 a 14 meses")).toBeNull();
    expect(mesesDesde(undefined)).toBeNull();
    expect(gradoDesde("14,5 %")).toBe(14.5);
    expect(gradoDesde("14.5% vol")).toBe(14.5);
    expect(gradoDesde("sin dato")).toBeNull();
  });

  it("variedades", () => {
    expect(variedadesDesde("100% Tempranillo")).toEqual([{ nombre: "Tempranillo", porcentaje: 100 }]);
    expect(variedadesDesde("Tinta del País 90%, Merlot 10%")).toEqual([
      { nombre: "Tinta del País", porcentaje: 90 },
      { nombre: "Merlot", porcentaje: 10 },
    ]);
    expect(variedadesDesde("Merlot, Tempranillo")).toEqual([
      { nombre: "Merlot", porcentaje: null },
      { nombre: "Tempranillo", porcentaje: null },
    ]);
    expect(variedadesDesde("95% Tempranillo y 5% Albillo Mayor")).toEqual([
      { nombre: "Tempranillo", porcentaje: 95 },
      { nombre: "Albillo Mayor", porcentaje: 5 },
    ]);
    // Porcentajes incoherentes (suma > 100): se conservan las uvas sin porcentaje.
    expect(variedadesDesde("100% Tempranillo, 20% Merlot")).toEqual([
      { nombre: "Tempranillo", porcentaje: null },
      { nombre: "Merlot", porcentaje: null },
    ]);
    // Caso real (La Capilla Crianza Mágnum): porcentajes vacíos en la tarjeta.
    expect(variedadesDesde("% Merlot, % Tempranillo")).toEqual([
      { nombre: "Merlot", porcentaje: null },
      { nombre: "Tempranillo", porcentaje: null },
    ]);
    expect(variedadesDesde("")).toEqual([]);
  });
});
