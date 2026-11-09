import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ClienteHttp } from "../../lib/http.ts";
import { Log } from "../../lib/log.ts";
import { LimitadorPorHost } from "../../lib/rate-limit.ts";
import { clasificar, esOtroIdioma, huella } from "./clasificar.ts";
import { descriptores, CATA_NARIZ } from "./diccionarios.ts";
import { agruparPorDominio, bodegasDeArgumento, loteDe, parsearLote } from "./entrada.ts";
import {
  eanValido,
  esNombreDeVino,
  extraerBarrica,
  extraerBodega,
  extraerCata,
  extraerDuracion,
  extraerGrado,
  extraerIdiomas,
  extraerPrecio,
  extraerServicio,
  extraerTemperatura,
  extraerVariedades,
  extraerVino,
  nombreVino,
  tipoServicio,
} from "./extraer.ts";
import { bloques, bloquesDeFragmento, cargar, textoDe, xRobotsTag } from "./html.ts";
import { cuentaHechosHistoria, hechosBodega, hechosVino } from "./normalizar.ts";
import { buscarClausulas, contentSignal, detectarAntiBot, enlacesAvisoLegal, evaluarSenales, notaPuerta, type Exclusiones } from "./puerta.ts";
import { RastreadorSitio, type EntradaSitio } from "./sitio.ts";

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const HOY = 2026;

describe("puerta legal", () => {
  it("cláusulas fuertes del aviso legal", () => {
    const texto =
      "Queda prohibida la reproducción total o parcial. Asimismo, se prohíbe el uso de robots, spiders o crawlers " +
      "para extraer información de este sitio web sin autorización expresa.";
    const r = buscarClausulas(texto);
    expect(r.coincidencias).toEqual(expect.arrayContaining(["spiders", "crawlers"]));
    expect(r.fragmento).toMatch(/spiders/);
    expect(r.fragmento!.length).toBeLessThanOrEqual(200);
    expect(buscarClausulas("El titular se reserva la minería de textos y datos conforme al art. 4 de la Directiva 2019/790.").coincidencias.length).toBeGreaterThan(0);
    expect(buscarClausulas("Prohibido el web scraping de los contenidos.").coincidencias.length).toBeGreaterThan(0);
  });

  it("plantillas de gestoría sin cláusulas no bloquean (reproducción, cookies, robots.txt de Google)", () => {
    const plantilla =
      "Todos los contenidos son propiedad del titular. Queda prohibida su reproducción, distribución o comunicación pública " +
      "sin autorización. Google utiliza robots para indexar las páginas en los buscadores. Consulte nuestro robots.txt. " +
      "Las cookies técnicas son necesarias.";
    expect(buscarClausulas(plantilla).coincidencias).toEqual([]);
  });

  it("«robots» con una prohibición cerca sí cuenta", () => {
    expect(buscarClausulas("No está permitido acceder a la web mediante robots u otros medios.").coincidencias).toContain("robots");
  });

  it("Content-Signal: grupo propio, `*` y señales; search=no bloquea, ai-* solo se registra", () => {
    const robots = "User-agent: *\nContent-Signal: search=yes, ai-input=no, ai-train=no\nAllow: /\n";
    const cs = contentSignal(robots);
    expect(cs).toEqual({ search: "yes", "ai-input": "no", "ai-train": "no" });
    expect(evaluarSenales(cs, ["noai"])).toEqual({ bloquea: false, ia: ["content-signal ai-input=no", "content-signal ai-train=no", "noai"] });
    expect(evaluarSenales(contentSignal("User-agent: *\nContent-Signal: search=no\n"), []).bloquea).toBe(true);
    expect(contentSignal("User-agent: otrobot\nContent-Signal: search=no\n")).toBeNull();
    expect(contentSignal(null)).toBeNull();
  });

  it("desafíos anti-bot", () => {
    expect(detectarAntiBot("<html><head><title>Just a moment...</title></head><body>cf_chl_opt</body></html>")).toBe("Cloudflare");
    expect(detectarAntiBot('<meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2F">')).toBe("SiteGround captcha");
    expect(detectarAntiBot(fx("dobler-vino-crianza.html"))).toBeNull();
  });

  it("localiza el aviso legal en los enlaces y no confunde privacidad/cookies", () => {
    const enlacesHtml = cargar('<a href="/politica-de-cookies/">Cookies</a><a href="/privacidad/">Privacidad</a><a href="/aviso-legal/">Aviso legal</a><a href="https://otra.es/aviso-legal">Aviso</a>');
    const urls = enlacesAvisoLegal(
      enlacesHtml("a").map((_, a) => ({ url: new URL(enlacesHtml(a).attr("href")!, "https://x.es/").href, texto: enlacesHtml(a).text() })).get(),
      "x.es",
    );
    expect(urls).toEqual(["https://x.es/aviso-legal/"]);
  });

  it("X-Robots-Tag: genéricas y las de nuestro bot", () => {
    expect(xRobotsTag("noindex, nofollow")).toEqual(["noindex", "nofollow"]);
    expect(xRobotsTag("googlebot: noindex")).toEqual([]);
    expect(xRobotsTag("wine-app-bot: noindex")).toEqual(["noindex"]);
  });
});

describe("clasificación y huella", () => {
  it.each([
    ["https://aalto.es/visitas/", "enoturismo"],
    ["https://x.es/visita-la-bodega/", "enoturismo"],
    ["https://x.es/la-bodega/", "historia"],
    ["https://x.es/quienes-somos/", "historia"],
    ["https://x.es/nuestros-vinos/", "vino"],
    ["https://x.es/vinos/aalto-gran-reserva-2019/", "vino"],
    ["https://x.es/aviso-legal/", "legal"],
    ["https://x.es/contacto/", "contacto"],
    ["https://x.es/", "historia"],
    ["https://x.es/carrito/", "otra"],
    ["https://dariolubiano.com/ficha-de-cata-2024/", "vino"],
    ["https://balbas.es/ficha-vinos/gran-reserva/", "vino"],
  ])("%s → %s", (url, clase) => {
    expect(clasificar({ url })).toBe(clase);
  });

  it("el tipo de WordPress manda sobre la URL", () => {
    expect(clasificar({ url: "https://www.bodegadobler.com/vino/doble-r-crianza-ribera-del-duero/", tipoWp: "vino" })).toBe("vino");
    expect(clasificar({ url: "https://x.es/p/123", tipoWp: "experiencia" })).toBe("enoturismo");
  });

  it("idiomas", () => {
    expect(esOtroIdioma("https://aalto.es/en/wine-aalto-2024/")).toBe(true);
    expect(esOtroIdioma("https://aalto.es/pt-pt/vinho-aalto-2024/")).toBe(true);
    expect(esOtroIdioma("https://aalto.es/vino-aalto-2024/")).toBe(false);
    expect(esOtroIdioma("https://x.es/es/vinos/")).toBe(false);
    expect(esOtroIdioma("https://x.es/vinos/?lang=en")).toBe(true);
  });

  it("huella de plataforma", () => {
    expect(huella(fx("aalto-portada.html"), "https://aalto.es")).toMatchObject({ plataforma: "wordpress", wpJson: "https://aalto.es/wp-json/" });
    expect(huella('<script src="https://cdn.shopify.com/s/x.js"></script>', "https://x.es").plataforma).toBe("shopify");
    expect(huella('<img src="https://static.wixstatic.com/media/a.jpg">', "https://x.es").plataforma).toBe("wix");
    expect(huella(fx("sangabriel-historia.html"), "https://www.bodegasangabriel.com").plataforma).toBe("generico");
  });
});

describe("extracción: bodega", () => {
  const municipios = ["La Aguilera", "Valbuena de Duero", "Roa", "Pesquera de Duero", "Quintanilla de Arriba"];

  it("Aalto (WordPress + Divi por la API): fundación, sin confundir la primera cosecha del enólogo en otra bodega", () => {
    const paginas = JSON.parse(fx("aalto-wp-pages-contenido.json")) as { link: string; content: { rendered: string } }[];
    const bodega = paginas.find((p) => p.link.endsWith("/la-bodega/"))!;
    const texto = textoDe(bloquesDeFragmento(bodega.content.rendered));
    expect(texto).not.toMatch(/\[et_pb/); // shortcodes fuera
    const h = extraerBodega(texto, { municipios, esHistoria: true, anioActual: HOY });
    expect(h.fundacion_anio).toBe(1999);
    expect(h.primera_anada).toBeNull(); // «elaboró su primera cosecha en 1968 en Vega Sicilia»
  });

  it("San Gabriel (HTML/ASP): «bodega joven (1998)»", () => {
    const h = extraerBodega(textoDe(bloques(cargar(fx("sangabriel-historia.html")))), { municipios, esHistoria: true, anioActual: HOY });
    expect(h.fundacion_anio).toBe(1998);
  });

  it("frases típicas de historia", () => {
    const t =
      "Bodegas Ejemplo fue fundada en 1987 por Juan Pérez García y María López en Pesquera de Duero. " +
      "Hoy la familia Pérez López, ya en su cuarta generación, cultiva 45 hectáreas de viñedo propio en Pesquera de Duero y Roa, " +
      "a 850 metros de altitud. Nuestra primera añada fue la de 1990. En 2005 inauguramos la nueva bodega. " +
      "Producimos unas 120.000 botellas al año.";
    const h = extraerBodega(t, { municipios, esHistoria: true, anioActual: HOY });
    expect(h).toMatchObject({
      fundacion_anio: 1987,
      fundadores: ["Juan Pérez García", "María López"],
      familia: "Pérez López",
      generacion: 4,
      hectareas: 45,
      altitud: 850,
      vinedo_municipios: ["Pesquera de Duero", "Roa"],
      primera_anada: 1990,
      inauguracion: 2005,
      produccion_botellas: 120000,
    });
  });

  it("falsos positivos: copyright, «desde» fuera de la historia, hectáreas que no son viñedo, años futuros", () => {
    const t = "© 2024 Bodega X. Desde 1900 el viñedo de la zona… Un jardín de 2 hectáreas. Fundada en 2090. Política de privacidad.";
    const h = extraerBodega(t, { municipios, esHistoria: false, anioActual: HOY });
    expect(h.fundacion_anio).toBeNull();
    expect(h.hectareas).toBeNull();
    expect(extraerBodega("Nuestro enólogo nació en 1950 en Roa.", { municipios, esHistoria: true, anioActual: HOY }).fundacion_anio).toBeNull();
    // Un salto de línea corta el apellido; «Familia Gente» no es una familia.
    expect(extraerBodega("Bodega de la familia Postigo\nPasión por el vino", { municipios, esHistoria: true }).familia).toBe("Postigo");
    expect(extraerBodega("Somos Familia Gente de campo", { municipios, esHistoria: true }).familia).toBeNull();
  });
});

describe("extracción: vino", () => {
  it("Doble R Crianza (HTML de un tipo «vino» de WordPress)", () => {
    const $ = cargar(fx("dobler-vino-crianza.html"));
    const v = extraerVino("Doble R Crianza", textoDe(bloques($)), { hoy: HOY });
    expect(v).toMatchObject({
      nombre: "Doble R Crianza",
      tipo: "tinto",
      crianza: "crianza",
      barrica_meses: 12,
      variedades: [{ nombre: "Tempranillo", porcentaje: null }],
    });
    // Los porcentajes de roble francés/americano no son de uvas.
    expect(v.variedades).toHaveLength(1);
    expect(v.cata_vista).toEqual(expect.arrayContaining(["rojo intenso", "rojo picota", "capa alta"]));
    expect(v.cata_nariz).toEqual(expect.arrayContaining(["frutos negros", "especias", "monte bajo", "balsámicos", "tostados"]));
    expect(v.cata_boca).toEqual(expect.arrayContaining(["untuoso", "equilibrado", "estructurado", "final largo"]));
    expect(v.evidencias).toBeGreaterThanOrEqual(3);
  });

  it("41 Norte (Store API de WooCommerce): ficha, cata por etiquetas Visual/Aroma/Taste y packs fuera", () => {
    const productos = JSON.parse(fx("41norte-store-products.json")) as { name: string; description: string; short_description: string }[];
    const vs = productos.find((p) => p.name === "41N Vendimia Seleccionada")!;
    const v = extraerVino(vs.name, textoDe(bloquesDeFragmento(vs.short_description + vs.description)), { hoy: HOY });
    expect(v.cata_vista).toEqual(expect.arrayContaining(["capa alta", "rojo cereza", "granate"]));
    expect(v.cata_nariz).toEqual(expect.arrayContaining(["frutos rojos", "especias"]));
    expect(v.cata_boca).toContain("taninos pulidos");
    expect(esNombreDeVino("41N Premium (2+2+2)")).toBe(false);
    expect(esNombreDeVino("Rosetta Special Edition lote de 3 botellas")).toBe(false);
    expect(esNombreDeVino("Marcoli, 30 meses")).toBe(true);
    expect(esNombreDeVino("Aalto Gran Reserva")).toBe(true);
    expect(esNombreDeVino("Visita y cata en bodega")).toBe(false);
    // Falsos positivos vistos en el dry-run de Ribera (tiendas con comida y páginas en inglés).
    expect(esNombreDeVino("Queso curado de oveja Dehesa la Granja")).toBe(false);
    expect(esNombreDeVino("Garbanzos IGP Fuentesauco")).toBe(false);
    expect(esNombreDeVino("Private Visit and Wine Tasting")).toBe(false);
    expect(esNombreDeVino("Estate wines")).toBe(false);
  });

  it("Aalto 2024 (página de WordPress): añada del título, uvas, barrica y grado", () => {
    const paginas = JSON.parse(fx("aalto-wp-pages-contenido.json")) as { link: string; title: { rendered: string }; content: { rendered: string } }[];
    const p = paginas.find((x) => x.link.endsWith("/vino-aalto-2024/"))!;
    const v = extraerVino(p.title.rendered, textoDe(bloquesDeFragmento(p.content.rendered)), { hoy: HOY });
    expect(v).toMatchObject({ nombre: "Aalto", anio: 2024, tipo: "tinto", variedades: [{ nombre: "Tempranillo", porcentaje: 100 }] });
    expect(v.grado).toBeGreaterThan(13);
  });

  it("San Gabriel Tinto Crianza (HTML genérico)", () => {
    const $ = cargar(fx("sangabriel-vino-crianza.html"));
    const v = extraerVino("San Gabriel Tinto Crianza", textoDe(bloques($)), { hoy: HOY });
    expect(v).toMatchObject({ tipo: "tinto", crianza: "crianza", barrica_meses: 12 });
    expect(v.cata_boca).toEqual(expect.arrayContaining(["carnoso", "estructurado", "redondo"]));
  });

  it("nombre sin añada, formato ni D.O.", () => {
    expect(nombreVino("Vino Aalto 2021 Mágnum")).toBe("Aalto");
    expect(nombreVino("Doble R Crianza D.O. Ribera del Duero 75cl")).toBe("Doble R Crianza");
    expect(nombreVino("EMINA CRIANZA 2020")).toBe("Emina Crianza");
    expect(nombreVino("Vino aalto ps 2024")).toBe("Aalto Ps");
  });

  it("uvas: «tempranillo blanco» no es tempranillo; los % deben sumar ≤ 100", () => {
    expect(extraerVariedades("Elaborado con 100% Tempranillo Blanco.")).toEqual([{ nombre: "Tempranillo Blanco", porcentaje: 100 }]);
    expect(extraerVariedades("Tinta del País 90%, Merlot 10%")).toEqual([
      { nombre: "Tempranillo", porcentaje: 90 },
      { nombre: "Merlot", porcentaje: 10 },
    ]);
    expect(extraerVariedades("90% Tempranillo y 10% Cabernet Sauvignon")).toEqual([
      { nombre: "Tempranillo", porcentaje: 90 },
      { nombre: "Cabernet Sauvignon", porcentaje: 10 },
    ]);
    // Sumas imposibles → solo menciones, sin porcentajes.
    expect(extraerVariedades("Tempranillo 90%, Merlot 40%").every((v) => v.porcentaje === null)).toBe(true);
    expect(extraerVariedades("Verdejo y un 2% de Sauvignon Blanc")).toEqual([
      { nombre: "Sauvignon Blanc", porcentaje: 2 },
      { nombre: "Verdejo", porcentaje: null },
    ]);
  });

  it("barrica, grado y temperatura", () => {
    expect(extraerBarrica("Crianza de 14 meses en barrica de roble francés.")).toBe(14);
    expect(extraerBarrica("Entre 12 a 14 meses en barrica.")).toBeNull();
    expect(extraerBarrica("12 meses en barrica y 18 meses en roble")).toBeNull();
    expect(extraerBarrica("Envejecimiento en barrica nueva de roble francés")).toBeNull();
    expect(extraerGrado("Grado alcohólico: 14,5%")).toBe(14.5);
    expect(extraerGrado("15% vol.")).toBe(15);
    expect(extraerGrado("Descuento del 25% en la segunda unidad")).toBeNull();
    expect(extraerTemperatura("Temperatura de servicio: 16-18 ºC")).toEqual({ min: 16, max: 18 });
    expect(extraerTemperatura("Servir a 14 ºC")).toEqual({ min: 14, max: 14 });
    expect(extraerTemperatura("Fermentación a 26-28 ºC")).toBeNull();
  });

  it("cata: solo descriptores del diccionario, nunca frases", () => {
    const c = extraerCata("Nariz: intensa, con recuerdos de la infancia, frutos negros y regaliz. Boca: sedoso y persistente. Maridaje: lechazo asado y quesos curados.");
    expect(c.nariz).toEqual(["frutos negros", "regaliz"]);
    expect(c.boca).toEqual(["taninos sedosos", "final largo"]);
    expect(c.maridaje).toEqual(["lechazo asado", "quesos curados"]);
    expect([...c.nariz, ...c.boca, ...c.maridaje].every((d) => d.split(" ").length <= 3)).toBe(true);
    // Un «color» suelto no es una nota de cata.
    expect(extraerCata("El color de nuestra etiqueta es el rojo cereza.").vista).toEqual([]);
    expect(descriptores("cerezas y frutos rojos", CATA_NARIZ)).toEqual(["frutos rojos"]);
  });

  it("EAN con dígito de control", () => {
    expect(eanValido("8410013000010")).toBe(true);
    expect(eanValido("8410013000011")).toBe(false);
    expect(extraerVino("X Crianza", "EAN: 8410013000010. Crianza de 12 meses en barrica.").ean).toBe("8410013000010");
  });
});

describe("extracción: enoturismo", () => {
  it("precio, duración, idiomas y reserva", () => {
    const texto =
      "Visita guiada a la bodega y cata de tres vinos. Precio: 25 € por persona (niños gratis). Duración aproximada: 1 hora y media. " +
      "Visitas disponibles en español e inglés. Envío gratuito en pedidos de más de 60 €.";
    const s = extraerServicio("Visita Premium", texto, [{ url: "https://turitop.com/aalto/visita", texto: "Reservar" }, { url: "https://x.es/tienda/", texto: "Tienda" }], "x.es", "x.es");
    expect(s).toMatchObject({ tipo: "visita", titulo: "Visita Premium", precio_desde: 25, duracion_minutos: 90, idiomas: ["es", "en"], url_reserva: "https://turitop.com/aalto/visita" });
  });

  it("falsos positivos: horarios no son duración, gastos de envío no son precio", () => {
    expect(extraerDuracion("Horario: de 10:00 h a 14:00 h")).toBeNull();
    expect(extraerPrecio("Gastos de envío 6 € por pedido")).toBeNull();
    expect(extraerDuracion("La visita dura 2 horas")).toBe(120);
    expect(extraerDuracion("Duración: 45 minutos")).toBe(45);
    expect(extraerIdiomas("Nuestros vinos se exportan a Inglaterra")).toEqual([]);
  });

  it("tipo y título", () => {
    expect(tipoServicio("Cata de vinos maridada")).toBe("cata");
    expect(tipoServicio("Visita y cata")).toBe("visita");
    expect(tipoServicio("Restaurante El Lagar")).toBe("restaurante");
    expect(tipoServicio("Paseo en bicicleta por el viñedo")).toBe("actividad");
    expect(extraerServicio("Enoturismo", "", [], "x.es", "x.es").titulo).toBe("Visita a la bodega");
    expect(extraerServicio("¿Eres un apasionado del vino?", "", [], "x.es", "x.es").titulo).toBe("Visita a la bodega");
    expect(extraerServicio("Eventos", "Celebra tu evento", [], "x.es", "x.es").titulo).toBe("Eventos en la bodega");
  });
});

describe("entrada y lotes", () => {
  it("agrupa por dominio y descarta redes y tiendas", () => {
    const sitios = agruparPorDominio([
      { id: "1", nombre: "Bardos", municipio: "Roa", web: "https://bardos.wine/" },
      { id: "2", nombre: "Bardos 2", municipio: "Roa", web: "https://bardos.wine" },
      { id: "3", nombre: "Otra", municipio: null, web: "https://www.facebook.com/otra" },
      { id: "4", nombre: "41", municipio: null, web: "www.41norte.com" },
    ]);
    expect(sitios.map((s) => [s.dominio, s.bodegas.length])).toEqual([["bardos.wine", 2], ["41norte.com", 1]]);
    expect(sitios[1]!.url).toBe("http://www.41norte.com/");
  });

  it("lotes estables por hash del dominio", () => {
    expect(parsearLote("2/3")).toEqual({ indice: 2, total: 3 });
    expect(() => parsearLote("4/3")).toThrow();
    const dominios = Array.from({ length: 60 }, (_, i) => `bodega${i}.es`);
    const lotes = dominios.map((d) => loteDe(d, 3));
    expect(new Set(lotes)).toEqual(new Set([1, 2, 3]));
    expect(dominios.map((d) => loteDe(d, 3))).toEqual(lotes); // mismo reparto siempre
  });

  it("--webs: lista separada por comas", () => {
    expect(bodegasDeArgumento("https://aalto.es,www.emina.es").map((b) => b.web)).toEqual(["https://aalto.es", "www.emina.es"]);
  });
});

describe("hechos y resúmenes", () => {
  it("cada hecho lleva la URL de su página y las listas usan sujeto", () => {
    const b = {
      fundacion_anio: 1999, fundadores: ["Mariano García"], familia: null, generacion: null, hectareas: 130, altitud: null,
      vinedo_municipios: ["Roa", "La Horra"], primera_anada: null, inauguracion: null, produccion_botellas: null,
      enoturismo: true, enoturismo_web: "https://aalto.es/visitas/", enoturismo_email: null, enoturismo_telefono: null, redes: {},
      urls: { fundacion_anio: "https://aalto.es/la-bodega/" },
    };
    const h = hechosBodega(b, "f", "https://aalto.es/", "2026-11-08T00:00:00Z", "Aalto");
    expect(h.find((x) => x.clave === "bodega.fundacion_anio")?.fuente.url).toBe("https://aalto.es/la-bodega/");
    expect(h.filter((x) => x.clave === "bodega.vinedo_municipio").map((x) => x.sujeto)).toEqual(["roa", "la horra"]);
    expect(h.find((x) => x.clave === "bodega.enoturismo")?.fuente.url).toBe("https://aalto.es/visitas/");
    expect(h.every((x) => x.fuente.origen === "bodega")).toBe(true);
    expect(cuentaHechosHistoria(b)).toBe(5);
    const v = extraerVino("Doble R Crianza", "Nariz: frutos negros y regaliz. 14% vol.", { hoy: HOY });
    const hv = hechosVino({ ...v, url: "https://x.es/v", denominacion: null, imagen: null, ofertas: [] }, "f", "2026-11-08T00:00:00Z", "Ribera del Duero");
    expect(hv.filter((x) => x.clave === "anada.cata.nariz").map((x) => x.sujeto)).toEqual(["frutos negros", "regaliz"]);
  });
});

// ---------------------------------------------------------------------------
// Rastreo completo con fetch simulado
// ---------------------------------------------------------------------------

type Ruta = string | { status?: number; cuerpo?: string; tipo?: string; cabeceras?: Record<string, string>; url?: string } | ((url: string) => string);

function rastreador(rutas: Record<string, Ruta>, exclusiones: Exclusiones = { excluidos: [], permitidos: [] }) {
  const pedidas: string[] = [];
  const fetchFalso = vi.fn<typeof fetch>(async (entrada) => {
    const url = String(entrada);
    pedidas.push(url);
    const ruta = rutas[url] ?? rutas[url.replace(/\?.*$/, "")];
    if (ruta === undefined) return conUrl(new Response("no", { status: 404 }), url);
    const r = typeof ruta === "function" ? ruta(url) : ruta;
    const o = typeof r === "string" ? { cuerpo: r } : r;
    const tipo = o.tipo ?? (o.cuerpo?.trimStart().startsWith("{") || o.cuerpo?.trimStart().startsWith("[") ? "application/json" : "text/html; charset=utf-8");
    return conUrl(new Response(o.cuerpo ?? "", { status: o.status ?? 200, headers: { "content-type": tipo, ...(o.cabeceras ?? {}) } }), o.url ?? url);
  });
  const log = new Log();
  const limitador = new LimitadorPorHost({ minMs: 0, maxMs: 0 });
  const r = new RastreadorSitio(() => new ClienteHttp({ log, fetch: fetchFalso, limitador, dormir: async () => {}, backoffMs: [] }), {
    log, exclusiones, municipios: ["Quintanilla de Arriba", "Roa"], ahora: () => new Date("2026-11-08T10:00:00Z"),
  });
  return { r, pedidas };
}

function conUrl(res: Response, url: string): Response {
  Object.defineProperty(res, "url", { value: url });
  return res;
}

const sitio = (url: string, nombre = "Bodega"): EntradaSitio => ({ dominio: new URL(url).host.replace(/^www\./, ""), url, bodegas: [{ id: "b1", nombre, municipio: null }] });
const AVISO_OK = `<html><body><main><h1>Aviso legal</h1><p>${"Todos los contenidos de esta web son propiedad del titular y su reproducción está prohibida sin autorización. ".repeat(6)}</p></main></body></html>`;

describe("RastreadorSitio", () => {
  it("WordPress (Aalto): portada → aviso legal → API REST por tipos → vinos, historia y visitas; sin páginas en otros idiomas", async () => {
    const { r, pedidas } = rastreador({
      "https://aalto.es/robots.txt": "User-agent: *\nDisallow: /wp-admin/\n",
      "https://aalto.es/": fx("aalto-portada.html"),
      "https://aalto.es/aviso-legal/": AVISO_OK,
      "https://aalto.es/wp-json/wp/v2/types": fx("aalto-wp-types.json"),
      // Listado ligero y, con ?include=…, el contenido de las páginas elegidas.
      "https://aalto.es/wp-json/wp/v2/pages": (url) => (url.includes("include=") ? fx("aalto-wp-pages-contenido.json") : fx("aalto-wp-pages-lista.json")),
      "https://aalto.es/wp-json/wp/v2/project": "[]",
    });
    const out = await r.rastrear(sitio("https://aalto.es/", "Aalto"));
    expect(out.puerta).toMatchObject({ apta: true, motivo: null });
    expect(out.puerta.aviso_legal?.url).toBe("https://aalto.es/aviso-legal/");
    expect(out.extractor).toMatch(/^wordpress/);
    expect(out.paginas.some((p) => p.url.includes("/en/"))).toBe(false);
    expect(out.vinos.map((v) => [v.nombre, v.anio])).toEqual([["Aalto", 2024]]);
    expect(out.bodega?.fundacion_anio).toBe(1999);
    expect(out.bodega?.enoturismo_web).toBe("https://aalto.es/visitas/");
    expect(out.servicios.length).toBeGreaterThanOrEqual(1);
    expect(notaPuerta(out.puerta)).toMatch(/^2026-11-08: apta · robots\.txt permite el rastreo · aviso legal \(\/aviso-legal\/\)/);
    expect(pedidas.some((u) => u.includes("/wp-admin") || u.includes("/en/"))).toBe(false);
  });

  it("HTML genérico (San Gabriel): sitemap → listado de vinos → fichas enlazadas (profundidad 2)", async () => {
    const base = "https://www.bodegasangabriel.com";
    const { r } = rastreador({
      [`${base}/robots.txt`]: `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`,
      [`${base}/`]: `<html><head><title>Inicio</title></head><body><a href="legal.asp">Aviso legal</a><a href="nuestrosVinos.asp?lang=es">Nuestros Vinos</a><main><p>Bodega San Gabriel.</p></main></body></html>`,
      [`${base}/legal.asp`]: AVISO_OK,
      [`${base}/sitemap.xml`]: `<?xml version="1.0"?><urlset><url><loc>${base}/historia.asp?lang=es</loc></url><url><loc>${base}/nuestrosVinos.asp?lang=es</loc></url></urlset>`,
      [`${base}/historia.asp?lang=es`]: fx("sangabriel-historia.html"),
      [`${base}/nuestrosVinos.asp?lang=es`]: fx("sangabriel-nuestros-vinos.html"),
      [`${base}/nuestrosVinos.asp?sec=6&lang=es`]: fx("sangabriel-vino-crianza.html"),
    });
    const out = await r.rastrear(sitio(`${base}/`, "Bodega San Gabriel"));
    expect(out.puerta.apta).toBe(true);
    expect(out.extractor).toBe("sitemap");
    expect(out.bodega?.fundacion_anio).toBe(1998);
    expect(out.vinos.map((v) => [v.nombre, v.crianza])).toEqual([["San Gabriel Tinto Crianza", "crianza"]]);
  });

  it("WooCommerce (41 Norte): la portada redirige a otro dominio y el nuevo host pasa la puerta completa", async () => {
    const { r, pedidas } = rastreador({
      "http://www.41norte.com/robots.txt": "User-agent: *\nAllow: /\n",
      "http://www.41norte.com/": { url: "https://41norte.es/", cuerpo: '<html><head><link rel="https://api.w.org/" href="https://41norte.es/wp-json/"></head><body class="woocommerce"><a href="/aviso-legal/">Aviso legal</a><main><p>Bodega boutique.</p></main></body></html>' },
      "https://41norte.es/robots.txt": "User-agent: *\nDisallow: /wp-admin/\n",
      "https://41norte.es/aviso-legal/": AVISO_OK,
      "https://41norte.es/wp-json/wc/store/v1/products": fx("41norte-store-products.json"),
      "https://41norte.es/wp-json/wp/v2/types": "{}",
    });
    const out = await r.rastrear(sitio("http://www.41norte.com/", "41 Norte"));
    expect(out.puerta).toMatchObject({ apta: true, host: "41norte.es", redirigida_desde: "41norte.com" });
    expect(pedidas).toContain("https://41norte.es/robots.txt");
    expect(pedidas.indexOf("https://41norte.es/robots.txt")).toBeLessThan(pedidas.indexOf("https://41norte.es/aviso-legal/"));
    expect(out.extractor).toMatch(/woocommerce/);
    const nombres = out.vinos.map((v) => v.nombre);
    expect(nombres).toEqual(expect.arrayContaining(["41N Vendimia Seleccionada", "Marcoli, 30 meses"]));
    expect(nombres.some((n) => /2\+2/.test(n))).toBe(false);
  });

  it("si el nuevo host prohíbe el rastreo en robots.txt, se salta", async () => {
    const { r, pedidas } = rastreador({
      "http://a.com/robots.txt": "User-agent: *\nAllow: /\n",
      "http://a.com/": { url: "https://b.es/", cuerpo: "<html></html>" },
      "https://b.es/robots.txt": "User-agent: *\nDisallow: /\n",
    });
    const out = await r.rastrear(sitio("http://a.com/"));
    expect(out.puerta).toMatchObject({ apta: false, motivo: "robots" });
    expect(pedidas).not.toContain("https://b.es/aviso-legal/");
  });

  it.each([
    ["403", { "https://x.es/": { status: 403 } }, "bloqueo_http"],
    ["desafío anti-bot", { "https://x.es/": "<html><head><title>Just a moment...</title></head></html>" }, "anti_bot"],
    ["Content-Signal search=no", { "https://x.es/robots.txt": "User-agent: *\nContent-Signal: search=no\n", "https://x.es/": "<html><body>x</body></html>" }, "content_signal"],
    ["cláusula en el aviso legal", {
      "https://x.es/": '<html><body><a href="/aviso-legal/">Aviso legal</a></body></html>',
      "https://x.es/aviso-legal/": `<html><body><main><p>${"Texto legal general sobre la titularidad de la web. ".repeat(8)} Se prohíbe el uso de robots, spiders o crawlers para extraer contenidos.</p></main></body></html>`,
    }, "clausula_legal"],
  ])("%s → se salta sin insistir", async (_n, rutas, motivo) => {
    const { r, pedidas } = rastreador({ "https://x.es/robots.txt": "User-agent: *\nAllow: /\n", ...(rutas as Record<string, Ruta>) });
    const out = await r.rastrear(sitio("https://x.es/"));
    expect(out.puerta).toMatchObject({ apta: false, motivo });
    expect(out.vinos).toEqual([]);
    expect(pedidas.filter((u) => u === "https://x.es/").length).toBe(1);
    expect(notaPuerta(out.puerta)).toMatch(/^2026-11-08: excluida — /);
  });

  it("lista de exclusión manual: ni siquiera se pide la portada", async () => {
    const { r, pedidas } = rastreador({}, { excluidos: [{ dominio: "abadiadeacon.com", motivo: "aviso legal anti-robots", fecha: "2026-11-08" }], permitidos: [] });
    const out = await r.rastrear(sitio("https://www.abadiadeacon.com/"));
    expect(out.puerta.motivo).toBe("exclusion_manual");
    expect(pedidas).toEqual([]);
  });

  it("Content-Signal ai-train=no y noai se registran sin bloquear; noindex en una página no se extrae", async () => {
    const { r } = rastreador({
      "https://x.es/robots.txt": "User-agent: *\nContent-Signal: search=yes, ai-train=no\n",
      "https://x.es/": { cuerpo: '<html><body><a href="/aviso-legal/">Aviso legal</a><a href="/nuestros-vinos/">Vinos</a><main><p>Hola</p></main></body></html>', cabeceras: { "x-robots-tag": "noai" } },
      "https://x.es/aviso-legal/": AVISO_OK,
      "https://x.es/nuestros-vinos/": '<html><head><meta name="robots" content="noindex"></head><body><main><h1>Doble R Crianza</h1><p>Tempranillo 100%. 12 meses en barrica. 14% vol.</p></main></body></html>',
    });
    const out = await r.rastrear(sitio("https://x.es/"));
    expect(out.puerta.apta).toBe(true);
    expect(out.puerta.senales_ia).toEqual(["content-signal ai-train=no", "noai"]);
    expect(out.vinos).toEqual([]);
  });
});

