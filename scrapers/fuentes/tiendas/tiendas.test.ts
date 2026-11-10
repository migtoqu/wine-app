import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Contexto } from "../../lib/ejecucion.ts";
import type { ClienteHttp } from "../../lib/http.ts";
import { Log } from "../../lib/log.ts";
import { normalizarOferta } from "../../lib/ofertas.ts";
import { ofertaVinopremier } from "../vinopremier/guardar.ts";
import { VINATIS, VINOREA } from "./config.ts";
import { atributosFicha, disponibilidadRotulada, formatoTexto, gtinValido, parsearFichaEstructurada } from "./estructurados.ts";
import { crearScraperTienda, SCRAPERS_TIENDAS } from "./index.ts";
import { parsearListado, urlListado } from "./listados.ts";
import { denominacionDesde, idExternoDe, nombreTienda, normalizarFichaTienda } from "./normalizar.ts";
import type { CategoriaTienda, ConfigTienda } from "./tipos.ts";
import { partesNombre, productoElastic } from "./vinatis.ts";
import * as cheerio from "cheerio";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const fixtureVp = (f: string) => readFileSync(new URL(`../vinopremier/fixtures/${f}`, import.meta.url), "utf8");

const RIBERA: CategoriaTienda = { denominacion: "ribera-del-duero", nombre: "Ribera del Duero", ruta: "/categoria/ribera-del-duero/" };
const WOO: ConfigTienda = { ...VINOREA, slug: "ejemplo", base: "https://tienda.example", plataforma: "woocommerce", paramPagina: undefined, selectorBodega: undefined, categorias: [RIBERA] };
const MAGENTO: ConfigTienda = {
  ...VINOREA,
  slug: "magento",
  base: "https://vinopremier.com",
  plataforma: "magento",
  paramPagina: undefined,
  selectorBodega: ".page-bodega",
  categorias: [{ denominacion: "ribera-del-duero", nombre: "Ribera del Duero", ruta: "/vinos/denominaciones/d-o-ribera-del-duero" }],
};

describe("configuración", () => {
  it("solo Vinatis y Vinorea, con ritmo ≥ 10 s y tope por ejecución", () => {
    expect(Object.keys(SCRAPERS_TIENDAS)).toEqual(["tienda-vinatis", "tienda-vinorea"]);
    for (const t of [VINATIS, VINOREA]) {
      expect(t.pausaMs.minMs).toBeGreaterThanOrEqual(10_000);
      expect(t.maxPeticiones).toBeLessThanOrEqual(700);
    }
    expect(VINATIS.maxPeticiones).toBe(60);
  });
});

describe("URLs de listado por plataforma", () => {
  it("Magento ?p=N, WooCommerce /page/N/, PrestaShop con su parámetro", () => {
    expect(urlListado(MAGENTO, MAGENTO.categorias[0]!, 1)).toBe("https://vinopremier.com/vinos/denominaciones/d-o-ribera-del-duero");
    expect(urlListado(MAGENTO, MAGENTO.categorias[0]!, 3)).toBe("https://vinopremier.com/vinos/denominaciones/d-o-ribera-del-duero?p=3");
    expect(urlListado(WOO, RIBERA, 2)).toBe("https://tienda.example/categoria/ribera-del-duero/page/2/");
    expect(urlListado(VINOREA, VINOREA.categorias[0]!, 4)).toBe("https://www.vinorea.com/vino/espana/ribera-de-duero/?p=4");
    expect(urlListado(VINATIS, VINATIS.categorias[1]!, 2)).toBe("https://www.vinatis.es/comprar-vino-rioja?page=2");
  });
});

describe("listados", () => {
  it("PrestaShop 1.6 (Vinorea): solo la rejilla, paginador de la misma categoría y total", () => {
    const l = parsearListado(fixture("vinorea-listado-ribera.html"), VINOREA, VINOREA.categorias[0]!);
    expect(l.tarjetas).toHaveLength(4);
    expect(l.tarjetas.every((t) => t.url.startsWith("https://www.vinorea.com/") && t.url.endsWith(".html"))).toBe(true);
    expect(l.tarjetas.some((t) => t.url.includes("destacado"))).toBe(false);
    expect(l.maxPagina).toBe(6);
    expect(l.total).toBe(140);
    expect(l.fichas).toEqual([]);
  });

  it("Magento (fixture de Vinopremier): rejilla principal y paginador", () => {
    const l = parsearListado(fixtureVp("listado-ribera.html"), MAGENTO, MAGENTO.categorias[0]!);
    expect(l.tarjetas.map((t) => idExternoDe(t.url))).toEqual([
      "vino-tinto-arzuaga-reserva",
      "vino-tinto-bosque-de-matasnos-crianza",
      "vino-tinto-carmelo-rodero-crianza",
      "vino-tinto-vetusta-carrascalon-alto",
    ]);
    expect(l.maxPagina).toBe(5);
    expect(l.total).toBe(369);
  });

  it("WooCommerce: URLs sin query, sin otros dominios, páginas /page/N/ de la categoría", () => {
    const l = parsearListado(fixture("woocommerce-listado.html"), WOO, RIBERA);
    expect(l.tarjetas).toEqual([
      { url: "https://tienda.example/producto/vino-tinto-ejemplo-crianza-2020/", nombre: "Vino Tinto Ejemplo Crianza 2020" },
      { url: "https://tienda.example/producto/ejemplo-blanco-2023/", nombre: "Ejemplo Blanco 2023" },
    ]);
    expect(l.maxPagina).toBe(3);
    expect(l.total).toBe(30);
  });

  it("Vinatis: fichas completas desde el JSON del listado", () => {
    const l = parsearListado(fixture("vinatis-listado-rioja.html"), VINATIS, VINATIS.categorias[1]!);
    expect(l.total).toBe(63);
    expect(l.maxPagina).toBe(2);
    expect(l.fichas).toHaveLength(5);
    expect(l.fichas[0]).toMatchObject({
      url: "https://www.vinatis.es/73988-palacio-del-burgo-tinto-2023-bodegas-burgo-viejo",
      nombre: "Palacio del Burgo Tinto 2023",
      bodega: "Bodegas Burgo Viejo",
      precio: 6.82,
      moneda: "EUR",
      disponibilidad: "InStock",
      tipoTexto: "Tinto",
      denominacionTexto: "DOCa Rioja",
      anio: 2023,
      formatoMl: 750,
      grado: 13.5,
      ean: null,
      descripcion: "",
    });
    expect(l.fichas[0]!.imagen).toBe("https://www.vinatis.es/96944-detail_default/palacio-del-burgo-tinto-2023-bodegas-burgo-viejo.png");
    expect(l.tarjetas.map((t) => t.url)).toEqual(l.fichas.map((f) => f.url));
  });

  it("Vinatis: un formato suelto al principio forma parte del nombre del vino", () => {
    expect(partesNombre("Magnum - Macán 2020 - Vega Sicilia")).toEqual({ vino: "Magnum Macán 2020", resto: ["Vega Sicilia"] });
    expect(partesNombre("El Espino 2021 - Áster - La Rioja Alta")).toEqual({ vino: "El Espino 2021", resto: ["Áster", "La Rioja Alta"] });
    expect(nombreTienda("Magnum Macán 2020")).toBe("Macán");
  });

  it("Vinatis: el JSON se corta bien aunque haya llaves dentro de cadenas", () => {
    const e = productoElastic('<script>var product_elastic={"a":"x}{y","products":[]};var otra={"b":1};</script>');
    expect(e).toEqual({ a: "x}{y", products: [] });
    expect(productoElastic("<html></html>")).toBeNull();
  });
});

describe("fichas (datos estructurados)", () => {
  it("PrestaShop 1.6 (Vinorea): microdatos + tabla de atributos + selector de bodega", () => {
    const url = "https://www.vinorea.com/arzuaga-crianza.html";
    const f = parsearFichaEstructurada(fixture("vinorea-ficha-arzuaga-crianza.html"), url, VINOREA);
    expect(f).toMatchObject({
      nombre: "ARZUAGA Crianza",
      sku: "AR0",
      ean: null,
      precio: 22,
      moneda: "EUR",
      disponibilidad: "InStock",
      imagen: "https://www.vinorea.com/2078-large_default/arzuaga-crianza.jpg",
      bodega: "Bodegas Arzuaga",
      tipoTexto: "TINTO",
      denominacionTexto: "D.O. Ribera del Duero",
      uvasTexto: "Tempranillo",
      anio: 2021,
      formatoMl: 750,
      grado: 14.5,
    });
  });

  it("PrestaShop 1.7: GTIN13 propio, sin mezclar el de productos relacionados", () => {
    const f = parsearFichaEstructurada(fixture("prestashop17-ficha.html"), "https://ps.example/es/vino-tinto/1-ejemplo-toro-2021", {});
    expect(f).toMatchObject({ nombre: "Ejemplo Toro 2021", ean: "8437008194349", precio: 23.5, bodega: "Bodegas Ejemplo Toro", anio: 2021, grado: 14.5 });
    expect(f.denominacionTexto).toBe("DO Toro");
  });

  it("WooCommerce: JSON-LD en @graph y atributos", () => {
    const f = parsearFichaEstructurada(fixture("woocommerce-ficha.html"), "https://tienda.example/producto/vino-tinto-ejemplo-crianza-2020/", {});
    expect(f).toMatchObject({
      nombre: "Vino Tinto Ejemplo Crianza 2020",
      sku: "EJ-CR-20",
      ean: "8437003104763",
      precio: 18.5,
      disponibilidad: "OutOfStock",
      bodega: "Bodegas Ejemplo",
      imagen: "https://tienda.example/wp-content/uploads/ejemplo.jpg",
      formatoMl: 750,
      grado: 14.5,
    });
  });

  it("Magento (fixture de Vinopremier): JSON-LD con fabricante y selector de bodega", () => {
    const f = parsearFichaEstructurada(fixtureVp("ficha-aalto.html"), "https://vinopremier.com/vino-tinto-aalto.html", MAGENTO);
    expect(f).toMatchObject({ nombre: "Vino Tinto Aalto", sku: "VT-AALTO", precio: 38.9, bodega: "Aalto" });
  });

  it("GTIN: dígito de control y GTIN-14 con cero inicial", () => {
    expect(gtinValido("8437003104763")).toBe("8437003104763");
    expect(gtinValido("08437003104763")).toBe("8437003104763");
    expect(gtinValido("8437003104764")).toBeNull();
    expect(gtinValido("12345")).toBeNull();
    expect(gtinValido(null)).toBeNull();
  });

  it("disponibilidad rotulada (PrestaShop 1.6 sin stock) y precio redondeado", () => {
    const sin = '<div itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">X Roble</h1><span itemprop="price" content="10.750001">10,75 €</span></div><span id="availability_value" class="label label-danger">Sin stock, disponible pr&oacute;ximamente</span>';
    const f = parsearFichaEstructurada(sin, "https://ps.example/x-roble.html", {});
    expect(f.disponibilidad).toBe("OutOfStock");
    expect(f.precio).toBe(10.75);
    expect(disponibilidadRotulada(cheerio.load('<span id="availability_value" class="label label-success">En stock</span>'))).toBe("InStock");
    expect(disponibilidadRotulada(cheerio.load("<p>nada</p>"))).toBeNull();
  });

  it("formato y atributos", () => {
    expect(formatoTexto("Botella de 75cl")).toBe(750);
    expect(formatoTexto("Magnum 1,5 L")).toBe(1500);
    expect(formatoTexto("Botella")).toBeNull();
    const attrs = atributosFicha(cheerio.load('<table class="table-data-sheet"><tr><td>Añada:</td><td> 2019 </td></tr></table>'));
    expect(attrs.get("anada")).toBe("2019");
  });
});

describe("normalizar", () => {
  it("D.O. del foco, fuera del foco o sin dato", () => {
    expect(denominacionDesde("D.O. Ribera del Duero")).toEqual({ slug: "ribera-del-duero", nombre: "Ribera del Duero" });
    expect(denominacionDesde("DOCa Rioja")).toEqual({ slug: "rioja", nombre: "Rioja" });
    expect(denominacionDesde("DO Toro")).toEqual({ slug: "toro", nombre: "Toro" });
    expect(denominacionDesde("IGP Castilla y León")).toBe("fuera");
    expect(denominacionDesde("D.O. Rías Baixas")).toBe("fuera");
    expect(denominacionDesde(null)).toBeNull();
    expect(nombreTienda("Vino Tinto Ejemplo Crianza 2020")).toBe("Ejemplo Crianza");
    expect(nombreTienda("TRUS Reserva Magnum")).toBe("TRUS Reserva");
  });

  it("Vinorea: vino, añada, uvas y oferta válida", () => {
    const url = "https://www.vinorea.com/arzuaga-crianza.html";
    const n = normalizarFichaTienda(parsearFichaEstructurada(fixture("vinorea-ficha-arzuaga-crianza.html"), url, VINOREA), VINOREA.categorias[0]!);
    expect(n).toMatchObject({
      idExterno: "arzuaga-crianza",
      denominacion: "ribera-del-duero",
      descarte: null,
      vino: { nombre: "ARZUAGA Crianza", tipo: "tinto", crianza: "crianza" },
      anada: { anio: 2021, grado: 14.5 },
      variedades: [{ nombre: "Tempranillo", porcentaje: null }],
      senales: { bodega: "Bodegas Arzuaga", grupo: [], vino: "ARZUAGA Crianza" },
      datos: { precio: 22, formato_ml: 750, bodega_tienda: "Bodegas Arzuaga" },
    });
    const o = normalizarOferta(ofertaVinopremier(n, "vino-1", "anada-1", null));
    expect(o).toMatchObject({ fila: { precio: 22, moneda: "EUR", formato_ml: 750, disponible: true, url } });
  });

  it("Vinatis: temperatura y uvas del JSON; el pack se descarta", () => {
    const l = parsearListado(fixture("vinatis-listado-rioja.html"), VINATIS, VINATIS.categorias[1]!);
    const ns = l.fichas.map((f) => normalizarFichaTienda(f, VINATIS.categorias[1]!));
    expect(ns[0]).toMatchObject({
      idExterno: "73988-palacio-del-burgo-tinto-2023-bodegas-burgo-viejo",
      denominacion: "rioja",
      vino: { nombre: "Palacio del Burgo Tinto", tipo: "tinto" },
      anada: { anio: 2023, temp_servicio_min: 14, temp_servicio_max: 16, grado: 13.5 },
      variedades: [{ nombre: "Tempranillo", porcentaje: 100 }],
    });
    expect(ns.at(-1)!.descarte).toBe("pack o estuche");
  });

  it("producto de otra D.O. dentro de la categoría: descartado", () => {
    const f = parsearFichaEstructurada(fixture("prestashop17-ficha-igp.html"), "https://ps.example/es/1-ejemplo-tierra-2022", {});
    expect(normalizarFichaTienda(f, RIBERA).descarte).toMatch(/fuera de las D\.O\. del foco/);
  });

  it("la D.O. de la ficha manda sobre la de la categoría", () => {
    const f = parsearFichaEstructurada(fixture("prestashop17-ficha.html"), "https://ps.example/es/1-ejemplo-toro-2021", {});
    expect(normalizarFichaTienda(f, RIBERA).denominacion).toBe("toro");
  });
});

/** Cliente HTTP falso: sirve fixtures por URL y cuenta peticiones. */
function clienteFalso(paginas: Record<string, string>) {
  const pedidas: string[] = [];
  const http = {
    peticiones: 0,
    async comprobarRobots() {},
    async get(url: string) {
      http.peticiones++;
      pedidas.push(url);
      const texto = paginas[url];
      if (texto == null) throw new Error(`HTTP 404 en ${url}`);
      return { url, status: 200, texto };
    },
  };
  return { http, pedidas };
}

function contexto(http: unknown, limite: number | null = null): Contexto & { motivos: string[] } {
  const motivos: string[] = [];
  return {
    fuenteSlug: "x",
    dryRun: true,
    limite,
    http: http as ClienteHttp,
    log: new Log(),
    db: null,
    fuenteId: null,
    contadores: { nuevos: 0, actualizados: 0, sinCambios: 0, descartados: 0, revision: 0, omitidas: 0, errores: 0 },
    rutaBodegas: null,
    salida: [],
    opciones: {},
    motivos,
    marcarParcial: (m: string) => void motivos.push(m),
    esParcial: () => motivos.length > 0,
  };
}

describe("scraper (dry-run con HTTP falso)", () => {
  it("Vinatis: solo pide listados y se para si ?page=N no pagina", async () => {
    const rioja = fixture("vinatis-listado-rioja.html");
    const config: ConfigTienda = { ...VINATIS, categorias: [VINATIS.categorias[1]!] };
    // La página 2 devuelve otra vez la 1 (page_number 1): no se adivina.
    const { http, pedidas } = clienteFalso({
      "https://www.vinatis.es/comprar-vino-rioja": rioja,
      "https://www.vinatis.es/comprar-vino-rioja?page=2": rioja,
    });
    const ctx = contexto(http);
    await crearScraperTienda(config)(ctx);
    expect(pedidas).toEqual(["https://www.vinatis.es/comprar-vino-rioja", "https://www.vinatis.es/comprar-vino-rioja?page=2"]);
    expect(ctx.salida).toHaveLength(5);
    expect(ctx.contadores.descartados).toBe(1);
    expect(ctx.motivos[0]).toMatch(/no pagina/);
  });

  it("PrestaShop: respeta el tope de peticiones y marca la ejecución parcial", async () => {
    const config: ConfigTienda = { ...VINOREA, categorias: [VINOREA.categorias[0]!], maxPeticiones: 3, maxPaginas: 1 };
    const listado = fixture("vinorea-listado-ribera.html");
    const ficha = fixture("vinorea-ficha-arzuaga-crianza.html");
    const urls = parsearListado(listado, config, config.categorias[0]!).tarjetas.map((t) => t.url);
    const { http, pedidas } = clienteFalso({
      "https://www.vinorea.com/vino/espana/ribera-de-duero/": listado,
      ...Object.fromEntries(urls.map((u) => [u, ficha])),
    });
    const ctx = contexto(http);
    await crearScraperTienda(config)(ctx);
    expect(pedidas).toHaveLength(3);
    expect(ctx.salida).toHaveLength(2);
    expect(ctx.motivos.some((m) => /Tope de 3 peticiones/.test(m))).toBe(true);
  });
});
