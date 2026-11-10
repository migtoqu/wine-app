import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ClienteHttp } from "../../lib/http.ts";
import { Log } from "../../lib/log.ts";
import { LimitadorPorHost } from "../../lib/rate-limit.ts";
import { decidirDenominacion, denominacionesDeSemillas, detectarDenominacion, ResolutorDenominaciones } from "./denominacion.ts";
import { descripcionServicio, extraerDetalle } from "./enoturismo.ts";
import { candidataPorEmail } from "./entrada.ts";
import { camposVino_, entradasOferta, sinNulos } from "./guardar.ts";
import { esNombreDeVino as esVino, nombreVino } from "./extraer.ts";
import { limpiarTitulo } from "./html.ts";
import { esNombreDeVino, extraerServicio } from "./extraer.ts";
import { cargar } from "./html.ts";
import { candidatasDePagina, elegirImagenBodega, esFoto, imagenBotella } from "./imagen.ts";
import { formatoMl, ofertaDeJsonLd, ofertaDeWoo, unidades } from "./ofertas.ts";
import { dominioBase, RastreadorSitio, verificarNombre, type EntradaSitio, type PaginaPrevia } from "./sitio.ts";

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const resolutor = new ResolutorDenominaciones(denominacionesDeSemillas());
const ribera = resolutor.porSlugDe("ribera-del-duero")!;
const rioja = resolutor.porSlugDe("rioja")!;

describe("denominación por vino", () => {
  it("las semillas traen las 106 DOP y las 43 IGP", () => {
    const todas = denominacionesDeSemillas();
    expect(todas.filter((d) => d.tipo === "igp")).toHaveLength(43);
    expect(todas.filter((d) => d.tipo !== "igp")).toHaveLength(106);
  });

  it.each([
    ["Emina Verdejo", "Vino blanco D.O. Rueda elaborado con verdejo.", [], "https://emina.es/vinos/emina-verdejo/", "rueda", "ficha"],
    ["Dehesa La Granja", "Vino de la Tierra de Castilla y León. 100% Tempranillo", [], "https://x.es/v/dehesa/", "castilla-y-leon", "ficha"],
    ["Viña Ardanza", "D.O.Ca. Rioja · Reserva", [], "https://x.es/v/ardanza/", "rioja", "ficha"],
    ["Pintia", "", ["Vinos de Toro"], "https://x.es/x/pintia/", "toro", "categoria"],
    ["Doble R Crianza", "", [], "https://www.bodegadobler.com/vino/doble-r-crianza-ribera-del-duero/", "ribera-del-duero", "ruta"],
    ["Blanco", "", [], "https://x.es/vinos-rueda/x-blanco/", "rueda", "ruta"],
  ])("%s → %s", (titulo, texto, categorias, url, slug, origen) => {
    const d = detectarDenominacion({ titulo, texto, categorias, url }, resolutor);
    expect(d?.denominacion?.slug).toBe(slug);
    expect(d?.origen).toBe(origen);
  });

  it("«Denominación de Origen: DOCa Rioja» (sin cruzar de línea), «I.G.P.: Vino de la Tierra de Castilla» y «Vino de España»", () => {
    expect(detectarDenominacion({ titulo: "Otoñal Crianza", texto: "Denominación de Origen: DOCa Rioja\nTipo: Tinto", url: "https://x.es/x" }, resolutor)?.denominacion?.slug).toBe("rioja");
    expect(detectarDenominacion({ titulo: "Zagal", texto: "I.G.P.: Vino de la Tierra de Castilla GRADO ALCOHÓLICO", url: "https://x.es/x" }, resolutor)?.denominacion?.slug).toBe("castilla");
    expect(detectarDenominacion({ titulo: "Cueva", texto: "I.G.P.: Vino de España GRADO", url: "https://x.es/x" }, resolutor)?.clase).toBe("sin_do");
  });

  it("sin falsos positivos: «Toro Loco» en la ruta del vino no es D.O. Toro", () => {
    expect(detectarDenominacion({ titulo: "Toro Loco", texto: "", url: "https://x.es/vinos/toro-loco/" }, resolutor)).toBeNull();
  });

  it("decisión: ficha > bodega con una sola D.O.; varias D.O. sin pista o D.O. desconocida → revisión; VT fuera de tabla o Vino de España → sin D.O.", () => {
    const rueda = detectarDenominacion({ titulo: "X", texto: "D.O. Rueda", url: "https://x.es/x" }, resolutor);
    expect(decidirDenominacion(rueda, [ribera])).toMatchObject({ estado: "asignada", denominacion: { slug: "rueda" } });
    expect(decidirDenominacion(null, [ribera])).toMatchObject({ estado: "asignada", denominacion: { slug: "ribera-del-duero" }, deteccion: { origen: "bodega" } });
    expect(decidirDenominacion(null, [ribera, rioja])).toMatchObject({ estado: "revision", motivo: "do_ambigua" });
    const inventada = detectarDenominacion({ titulo: "X", texto: "D.O. Inventada", url: "https://x.es/x" }, resolutor);
    expect(decidirDenominacion(inventada, [ribera])).toMatchObject({ estado: "revision", motivo: "do_desconocida" });
    // Otra D.O. sin la marca de la bodega en el nombre: posible reventa → revisión; con la marca, se asigna.
    expect(decidirDenominacion(rueda, [ribera], { vino: "Albariño Pazo de Rubianes", bodega: "Bodegas Arzuaga Navarro" })).toMatchObject({ estado: "revision", motivo: "otra_do" });
    expect(decidirDenominacion(rueda, [ribera], { vino: "Arzuaga Verdejo", bodega: "Bodegas Arzuaga Navarro" })).toMatchObject({ estado: "asignada" });
    const espana = detectarDenominacion({ titulo: "X", texto: "Vino de España", url: "https://x.es/x" }, resolutor);
    expect(decidirDenominacion(espana, [ribera])).toMatchObject({ estado: "sin_do" });
  });
});

describe("falsos vinos vistos en el dry-run de fase B", () => {
  it.each(["¿Eres mayor de edad?", "Jabón Sólido de Albariño 100g", "AOVE Arzuaga Cornicabra 100%", "Taylor´s Tawny 40 Años", "Moët Champagne Brut"])("%s no es un vino", (n) => {
    expect(esNombreDeVino(n)).toBe(false);
  });
});

describe("imágenes", () => {
  const html = `<html><head><meta property="og:image" content="https://x.es/wp-content/uploads/vinedo-paraje.jpg"><meta property="og:image:width" content="1200"></head>
    <body><header><img class="custom-logo" src="/wp-content/uploads/logo.png"></header>
    <main><img src="/wp-content/uploads/sello-premio.png" width="900"><img src="/wp-content/uploads/foto-150x150.jpg"><img src="/wp-content/uploads/sala-barricas.jpg" width="1600" alt="Sala de barricas"></main>
    <footer><img src="/kit-digital.png"></footer></body></html>`;
  const delSitio = (h: string) => h === "x.es";

  it("og:image de la página de historia; nunca logos, sellos ni miniaturas", () => {
    const c = candidatasDePagina(cargar(html), "https://x.es/historia/");
    expect(c.map((x) => x.url)).not.toContain("https://x.es/wp-content/uploads/logo.png");
    expect(c.filter(esFoto).map((x) => x.url)).toEqual([
      "https://x.es/wp-content/uploads/vinedo-paraje.jpg",
      "https://x.es/wp-content/uploads/sala-barricas.jpg",
    ]);
    expect(elegirImagenBodega([{ url: "https://x.es/historia/", candidatas: c }], delSitio)).toMatchObject({
      url: "https://x.es/wp-content/uploads/vinedo-paraje.jpg", tipo: "vinedo",
    });
  });

  it("sin og:image válida, una foto grande del contenido que diga bodega o viñedo", () => {
    const sinOg = html.replace(/<meta property="og:image"[^>]+>/, "");
    const c = candidatasDePagina(cargar(sinOg), "https://x.es/historia/");
    expect(elegirImagenBodega([{ url: "https://x.es/historia/", candidatas: c }], delSitio)).toMatchObject({ url: "https://x.es/wp-content/uploads/sala-barricas.jpg", tipo: "bodega" });
  });

  it("imágenes de terceros fuera; la CDN de la plataforma vale", () => {
    expect(imagenBotella("https://otra.com/botella.jpg", null, "https://x.es/v", delSitio)).toBeNull();
    expect(imagenBotella("https://i0.wp.com/x.es/botella.jpg", null, "https://x.es/v", delSitio)).toMatchObject({ tipo: "botella" });
    expect(imagenBotella("/wp-content/plugins/woocommerce/assets/images/woocommerce-placeholder.png", null, "https://x.es/v", delSitio)).toBeNull();
  });
});

describe("enoturismo: qué incluye, personas, horario y descripción propia", () => {
  it("vocabulario cerrado", () => {
    const t =
      "Visita a la bodega y paseo por el viñedo, sala de barricas y cata comentada de 3 vinos con aperitivo. " +
      "Grupos de 2 a 12 personas. De martes a domingo, con reserva previa. Disponible todo el año. Duración aproximada: 1 hora y media. En español e inglés.";
    const d = extraerDetalle(t);
    expect(d.incluye).toEqual(expect.arrayContaining(["visita_bodega", "visita_vinedo", "sala_barricas", "cata", "cata_comentada", "aperitivo"]));
    expect(d).toMatchObject({ vinos_cata: 3, personas_min: 2, personas_max: 12, horario: "de martes a domingo · con reserva previa", temporada: "todo el año" });
    const s = extraerServicio("Visita Premium", t, [], "x.es", "x.es");
    expect(s.descripcion).toBe(
      "Incluye visita al viñedo, visita a la bodega, sala de barricas, cata comentada de 3 vinos, aperitivo y paseo. " +
        "Unos 90 min, en español y inglés. Grupos de 2 a 12 personas. De martes a domingo, con reserva previa. Disponible todo el año.",
    );
  });

  it("sin datos → sin descripción", () => {
    expect(descripcionServicio({ duracion_minutos: null, idiomas: [], precio_desde: null, ...extraerDetalle("Ven a conocernos.") })).toBeNull();
  });
});

describe("ofertas de la tienda de la bodega", () => {
  it("Store API (importes en céntimos), formato y unidades", () => {
    const productos = JSON.parse(fx("41norte-store-products.json")) as Parameters<typeof ofertaDeWoo>[0][];
    const vs = productos.find((p) => p.name === "41N Vendimia Seleccionada")!;
    expect(ofertaDeWoo(vs, null)).toMatchObject({ precio: 12, moneda: "EUR", formato_ml: null, unidades: 1, precio_max: null });
    expect(formatoMl("Aalto 2021 Mágnum")).toBe(1500);
    expect(formatoMl("Crianza 0.5l")).toBe(500);
    expect(formatoMl("75 cl")).toBe(750);
    expect(unidades("Caja de 6 botellas")).toBe(6);
  });

  it("a RegistroOfertas: una por formato, sin cajas; clave por SKU o ruta + formato", () => {
    const base = { url: "https://x.es/p/crianza/", precio: 15, precio_regular: null, moneda: "EUR", disponible: true, unidades: 1, ean: null, sku: null, precio_max: null };
    const v = { ofertas: [
      { ...base, formato_ml: null },
      { ...base, url: "https://x.es/p/crianza-magnum/", formato_ml: 1500, sku: "CR-MG", precio: 35 },
      { ...base, url: "https://x.es/p/caja-crianza/", formato_ml: null, unidades: 6, precio: 80 },
      { ...base, precio: null, url: "https://x.es/p/sin-precio/", formato_ml: null },
    ] } as unknown as Parameters<typeof entradasOferta>[0];
    expect(entradasOferta(v, "v1", null, "r1").map((e) => [e.idExterno, e.precio, e.formatoMl])).toEqual([
      ["url:/p/crianza", 15, null],
      ["sku:CR-MG@1500", 35, 1500],
    ]);
  });

  it("JSON-LD Offer", () => {
    const o = ofertaDeJsonLd({ offers: { "@type": "Offer", price: "19.90", priceCurrency: "EUR", availability: "https://schema.org/InStock" }, sku: "A1" }, "https://x.es/v", "Crianza 75cl", "8410013000010");
    expect(o).toMatchObject({ precio: 19.9, moneda: "EUR", disponible: true, formato_ml: 750, ean: "8410013000010", sku: "A1" });
  });
});

describe("webs para bodegas sin web", () => {
  it("dominio del email, nunca proveedores de correo", () => {
    expect(candidataPorEmail("info@bodegasx.com")).toEqual({ dominio: "bodegasx.com", url: "https://bodegasx.com/" });
    expect(candidataPorEmail("bodega@gmail.com")).toBeNull();
    expect(candidataPorEmail("x@telefonica.net")).toBeNull();
    expect(candidataPorEmail("no-es-un-email")).toBeNull();
  });

  it("la portada tiene que nombrar a la bodega", () => {
    const $ = cargar('<html><head><title>Bodegas Pérez Pascuas | Viña Pedrosa</title></head><body><h1>Inicio</h1></body></html>');
    expect(verificarNombre($, "perezpascuas.com", "Hermanos Pérez Pascuas").estado).toBe("verificada");
    expect(verificarNombre(cargar("<title>Talleres Gómez</title>"), "gomez.es", "Bodega Gómez Cruzado").estado).not.toBe("verificada");
    expect(verificarNombre(cargar("<title>Inicio</title>"), "otra.es", "Viña Sastre").estado).toBe("no_verificada");
  });

  it("dominio base para subdominios", () => {
    expect(dominioBase("tienda.matarromera.es")).toBe("matarromera.es");
    expect(dominioBase("www.bodega.com.es")).toBe("bodega.com.es");
  });
});

// ---------------------------------------------------------------------------
// Rastreo: subdominios, incremental y verificación
// ---------------------------------------------------------------------------

function rastreador(rutas: Record<string, string | { status?: number; cuerpo?: string; tipo?: string }>, previas = new Map<string, PaginaPrevia>()) {
  const pedidas: string[] = [];
  const fetchFalso = vi.fn<typeof fetch>(async (entrada) => {
    const url = String(entrada);
    pedidas.push(url);
    const r = rutas[url] ?? rutas[url.replace(/\?.*$/, "")];
    const o = r === undefined ? { status: 404, cuerpo: "no" } : typeof r === "string" ? { cuerpo: r } : r;
    const tipo = o.tipo ?? (/^\s*[[{]/.test(o.cuerpo ?? "") ? "application/json" : "text/html");
    const res = new Response(o.cuerpo ?? "", { status: o.status ?? 200, headers: { "content-type": tipo } });
    Object.defineProperty(res, "url", { value: url });
    return res;
  });
  const log = new Log();
  const limitador = new LimitadorPorHost({ minMs: 0, maxMs: 0 });
  const r = new RastreadorSitio(() => new ClienteHttp({ log, fetch: fetchFalso, limitador, dormir: async () => {}, backoffMs: [] }), {
    log, exclusiones: { excluidos: [], permitidos: [] }, municipios: [], denominaciones: resolutor, previas: () => previas,
    ahora: () => new Date("2026-11-09T10:00:00Z"),
  });
  return { r, pedidas };
}

const AVISO = `<html><body><main><p>${"Contenidos propiedad del titular; reproducción prohibida sin autorización. ".repeat(8)}</p></main></body></html>`;
const sitio = (url: string, extra: Partial<EntradaSitio> = {}): EntradaSitio => ({ dominio: new URL(url).host.replace(/^www\./, ""), url, bodegas: [{ id: "b1", nombre: "Bodega Ejemplo", municipio: null }], ...extra });
const ficha = (nombre: string) => `<html><head><title>${nombre}</title></head><body><main><h1>${nombre}</h1><p>D.O. Rueda. 100% Verdejo. 13% vol. Notas de cata: nariz con fruta blanca.</p></main></body></html>`;

describe("RastreadorSitio fase B", () => {
  it("subdominio de tienda enlazado desde la portada: entra; un 403 en el subdominio no detiene el sitio", async () => {
    const { r } = rastreador({
      "https://ejemplo.es/robots.txt": "User-agent: *\nAllow: /\n",
      "https://ejemplo.es/": '<html><body><a href="/aviso-legal/">Aviso legal</a><a href="https://tienda.ejemplo.es/">Tienda</a><a href="https://enoturismo.ejemplo.es/">Visitas</a><main><p>Hola</p></main></body></html>',
      "https://ejemplo.es/aviso-legal/": AVISO,
      "https://tienda.ejemplo.es/robots.txt": "User-agent: *\nAllow: /\nSitemap: https://tienda.ejemplo.es/sitemap.xml\n",
      "https://tienda.ejemplo.es/sitemap.xml": `<?xml version="1.0"?><urlset><url><loc>https://tienda.ejemplo.es/vinos/ejemplo-verdejo/</loc><lastmod>2026-10-01</lastmod></url></urlset>`,
      "https://tienda.ejemplo.es/vinos/ejemplo-verdejo/": ficha("Ejemplo Verdejo"),
      "https://enoturismo.ejemplo.es/robots.txt": "User-agent: *\nAllow: /\n",
      "https://enoturismo.ejemplo.es/wp-json/wc/store/v1/products": { status: 403 },
    });
    const out = await r.rastrear(sitio("https://ejemplo.es/"));
    expect(out.puerta.apta).toBe(true);
    expect(out.vinos.map((v) => [v.nombre, v.denominacion?.denominacion?.slug])).toEqual([["Ejemplo Verdejo", "rueda"]]);
    expect(out.hosts).toContain("tienda.ejemplo.es");
    expect(out.avisos.some((a) => a.startsWith("enoturismo.ejemplo.es: HTTP 403"))).toBe(true);
  });

  it("incremental: una ficha con el mismo lastmod que la vez anterior no se pide", async () => {
    const rutas = {
      "https://ejemplo.es/robots.txt": "User-agent: *\nAllow: /\nSitemap: https://ejemplo.es/sitemap.xml\n",
      "https://ejemplo.es/": '<html><body><a href="/aviso-legal/">Aviso legal</a><main><p>Hola</p></main></body></html>',
      "https://ejemplo.es/aviso-legal/": AVISO,
      "https://ejemplo.es/sitemap.xml": `<?xml version="1.0"?><urlset><url><loc>https://ejemplo.es/vinos/a-verdejo/</loc><lastmod>2026-10-01</lastmod></url><url><loc>https://ejemplo.es/vinos/b-verdejo/</loc><lastmod>2026-11-05</lastmod></url></urlset>`,
      "https://ejemplo.es/vinos/a-verdejo/": ficha("A Verdejo"),
      "https://ejemplo.es/vinos/b-verdejo/": ficha("B Verdejo"),
    };
    const previa = (vista: string, oferta = false): PaginaPrevia => ({ modificada: "2026-10-01", vista, oferta });
    const previas = new Map([["https://ejemplo.es/vinos/a-verdejo", previa("2026-11-08T00:00:00Z")], ["https://ejemplo.es/vinos/b-verdejo", previa("2026-11-08T00:00:00Z")]]);
    const { r, pedidas } = rastreador(rutas, previas);
    const out = await r.rastrear(sitio("https://ejemplo.es/"));
    expect(out.sinCambios).toEqual(["https://ejemplo.es/vinos/a-verdejo/"]);
    expect(pedidas).not.toContain("https://ejemplo.es/vinos/a-verdejo/");
    expect(out.vinos.map((v) => v.nombre)).toEqual(["B Verdejo"]);
    expect(out.paginas.find((p) => p.url.endsWith("/b-verdejo/"))?.vista).toBe("2026-11-09T10:00:00.000Z");
  });

  it("incremental: una ficha con oferta que no se lee desde hace más de 7 días se vuelve a pedir aunque no cambie", async () => {
    const rutas = {
      "https://ejemplo.es/robots.txt": "User-agent: *\nAllow: /\nSitemap: https://ejemplo.es/sitemap.xml\n",
      "https://ejemplo.es/": '<html><body><a href="/aviso-legal/">Aviso legal</a><main><p>Hola</p></main></body></html>',
      "https://ejemplo.es/aviso-legal/": AVISO,
      "https://ejemplo.es/sitemap.xml": `<?xml version="1.0"?><urlset><url><loc>https://ejemplo.es/vinos/a-verdejo/</loc><lastmod>2026-10-01</lastmod></url><url><loc>https://ejemplo.es/vinos/b-verdejo/</loc><lastmod>2026-10-01</lastmod></url></urlset>`,
      "https://ejemplo.es/vinos/a-verdejo/": ficha("A Verdejo"),
      "https://ejemplo.es/vinos/b-verdejo/": ficha("B Verdejo"),
    };
    const previas = new Map<string, PaginaPrevia>([
      ["https://ejemplo.es/vinos/a-verdejo", { modificada: "2026-10-01", vista: "2026-10-20T00:00:00Z", oferta: true }], // caducada
      ["https://ejemplo.es/vinos/b-verdejo", { modificada: "2026-10-01", vista: "2026-11-05T00:00:00Z", oferta: true }], // reciente
    ]);
    const { r, pedidas } = rastreador(rutas, previas);
    const out = await r.rastrear(sitio("https://ejemplo.es/"));
    expect(pedidas).toContain("https://ejemplo.es/vinos/a-verdejo/");
    expect(out.sinCambios).toEqual(["https://ejemplo.es/vinos/b-verdejo/"]);
  });

  it("web candidata: si la portada no nombra a la bodega se salta sin pedir nada más", async () => {
    const { r, pedidas } = rastreador({
      "https://bodegasx.com/robots.txt": "User-agent: *\nAllow: /\n",
      "https://bodegasx.com/": "<html><head><title>Inmobiliaria Sol</title></head><body><main><p>Pisos</p></main></body></html>",
    });
    const out = await r.rastrear(sitio("https://bodegasx.com/", { candidata: { origen: "email", detalle: "info@bodegasx.com" }, bodegas: [{ id: "b1", nombre: "Viña Sastre", municipio: null }] }));
    expect(out.puerta).toMatchObject({ apta: false, motivo: "no_verificada" });
    expect(pedidas).toEqual(["https://bodegasx.com/robots.txt", "https://bodegasx.com/"]);
  });
});

describe("fallos de la carga completa de fase B (run 42591481017, lote 2)", () => {
  it("nunca se envía null al vino: «tipo» es NOT NULL (herascordon.com, carlosserres.com)", () => {
    expect(camposVino_({ tipo: null, crianza: null, nombre: "X" }, false, null)).toEqual({});
    expect(camposVino_({ tipo: "tinto", crianza: null, nombre: "X" }, true, "do-1")).toEqual({ tipo: "tinto", nombre: "X", denominacion_id: "do-1" });
    // Decisión de D.O. dudosa (undefined): esta fuente no opina sobre la D.O.
    expect(camposVino_({ tipo: "blanco", crianza: "joven", nombre: "X" }, false, undefined)).toEqual({ tipo: "blanco", crianza: "joven" });
    // Lo mismo para bodega, añada y servicio: un dato que no llega no vacía el de otra pasada.
    expect(sinNulos({ anio_fundacion: null, hectareas: 12, redes: undefined })).toEqual({ hectareas: 12 });
  });

  it("títulos genéricos («Ficha Producto», etiquetado nutricional) no son nombres de vino", () => {
    expect(limpiarTitulo("Ficha Producto - Viña Pedrosa Crianza")).toBe("Viña Pedrosa Crianza");
    expect(limpiarTitulo("Etiquetado nutricional | Bodegas X")).toBe("Bodegas X");
    expect(nombreVino("Ficha producto: Hacienda Monasterio Reserva 2019")).toBe("Hacienda Monasterio Reserva");
    expect(nombreVino("Pago de Carraovejas – Ficha técnica")).toBe("Pago de Carraovejas");
    expect(nombreVino("Viña Sastre Roble (etiquetado nutricional)")).toBe("Viña Sastre Roble");
    // Solo plantilla: no queda un nombre de vino.
    for (const n of ["Ficha Producto", "Etiquetado nutricional", "Info nutricional", "Ficha técnica", "Fichas de producto"]) {
      expect(esVino(nombreVino(n))).toBe(false);
    }
    // Plantilla + nombre: se queda el nombre (prefijo «Ficha »/«Info nutricional», sufijo «+ Ficha Técnica»).
    expect(nombreVino("Información nutricional Crianza")).toBe("Crianza");
    expect(nombreVino("Ficha Rivendel Roble")).toBe("Rivendel Roble");
    expect(nombreVino("Viña Pedrosa Reserva + Ficha Técnica")).toBe("Viña Pedrosa Reserva");
    expect(nombreVino("TresMatas Reserva 22- Etiquetado nutricional")).toBe("TresMatas Reserva");
  });
});
