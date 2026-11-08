import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ejecutar } from "../../lib/ejecucion.ts";
import { camposServicio, hechosFicha } from "./guardar.ts";
import {
  asignarBodega, normalizarFicha, normalizarProducto, resumirHorario, separarDireccion, tipoDeServicio,
} from "./normalizar.ts";
import {
  anioFundacionDe, duracionDe, esBodega, idiomasDe, importeDe, parsearContacto, parsearFichaDirectorio,
  parsearProducto, urlsSitemap,
} from "./parsear.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

const B = "https://rutadelvinoriberadelduero.es";
const pesqueraUrl = `${B}/producto/tinto-pesquera-visita-por-el-mes-del-enoturismo/`;
const producto = (f: string, url: string) => parsearProducto(fixture(f), url)!;

describe("sitemaps y producto", () => {
  it("lista solo las URLs en español de cada tipo", () => {
    expect(urlsSitemap(fixture("sitemap-productos.xml"), "producto")).toEqual([
      `${B}/producto/raices/`,
      `${B}/producto/ribiertete-ribera-enolvidable/`,
      `${B}/producto/experiencia-premium-bodega-tierra-aranda-vanguardia-y-tradicion/`,
    ]);
    const f = urlsSitemap(fixture("sitemap-directorio.xml"), "directories");
    expect(f).toHaveLength(2);
    expect(f.every((u) => !u.includes("/en/"))).toBe(true);
  });

  it("nombre, precio, URL de reserva externa, categoría, duración e idiomas", () => {
    expect(producto("producto-pesquera.html", pesqueraUrl)).toEqual({
      id: 20149,
      nombre: "Tinto Pesquera Visita por el Mes del Enoturismo",
      permalink: pesqueraUrl,
      precio: 40,
      url_reserva: "https://vindesia.com/experiencias-tinto-pesquera/",
      categorias: ["noviembre mes del enoturismo"],
      duracion_minutos: 120,
      idiomas: ["es", "en"],
    });
  });

  it("precio 0 → sin precio, pero conserva el enlace de reserva externo", () => {
    const p = producto("producto-gratuito.html", `${B}/producto/maridajes-de-ruta/`);
    expect(p).toMatchObject({ id: 20155, precio: null, url_reserva: "https://forms.cloud.microsoft/e/d4h8gRFbGP?origin=lprLink" });
  });

  it("importes", () => {
    expect(importeDe("40,00 €")).toBe(40);
    expect(importeDe("1.250,50 €")).toBe(1250.5);
    expect(importeDe("0,00 €")).toBeNull();
    expect(importeDe("")).toBeNull();
  });

  it("una página que no es producto → null", () => {
    expect(parsearProducto("<html><body>nada</body></html>", pesqueraUrl)).toBeNull();
  });
});

describe("duración, idiomas y fundación (solo si el texto lo dice claro)", () => {
  it("duración", () => {
    expect(duracionDe("Duración aproximada de 2 horas")).toBe(120);
    expect(duracionDe("Duración: 90 minutos.")).toBe(90);
    expect(duracionDe("Recepción a las 14:00h")).toBeNull();
  });
  it("idiomas", () => {
    expect(idiomasDe("Idiomas: español e inglés.")).toEqual(["es", "en"]);
    expect(idiomasDe("Visita guiada")).toEqual([]);
  });
  it("fundación", () => {
    expect(anioFundacionDe("Finca fundada en 1990. Visita guiada.")).toBe(1990);
    expect(anioFundacionDe("Fundada en 1990, y otra vez fundada en 1990")).toBe(1990);
    expect(anioFundacionDe("Fundada en 1950 y fundada en 1990")).toBeNull();
    expect(anioFundacionDe("Desde 1990")).toBeNull();
  });
});

describe("directorio", () => {
  const url = `${B}/directories/dominio-dechauz/`;

  it("categoría, contacto y horario de visitas de la ficha HTML", () => {
    const f = parsearFichaDirectorio(fixture("ficha-dechauz.html"), url)!;
    expect(f).toMatchObject({
      id: 19337, slug: "dominio-dechauz", nombre: "Dominio D´Echauz", categorias: ["Bodega"], anio_fundacion: 1990,
      direccion: "Carretera de Zayas s/n. San Esteban de Gormaz (Soria)",
      telefono: "681 13 19 03", email: "comercial@echauz.com", web: "http://www.echauz.com", codigo_postal: "42351",
    });
    expect(esBodega(f)).toBe(true);
    expect(f.horario_visitas).toHaveLength(5);
    expect(f.horario_visitas[0]).toEqual({ dia: "Lunes", horas: "10:00 h - 17:00 h" });
  });

  it("un pueblo no es una bodega", () => {
    const f = parsearFichaDirectorio(fixture("ficha-pueblo.html"), `${B}/directories/quintanilla-de-onesimo/`)!;
    expect(f.categorias).toEqual(["Pueblo"]);
    expect(esBodega(f)).toBe(false);
  });

  it("normaliza la ficha", () => {
    const n = normalizarFicha(parsearFichaDirectorio(fixture("ficha-dechauz.html"), url)!);
    expect(n.idExterno).toBe("directorio:19337");
    expect(n.campos).toMatchObject({
      direccion: "Carretera de Zayas s/n", municipio: "San Esteban de Gormaz", provincia: "Soria",
      comunidad: "Castilla y León", codigo_postal: "42351", email: "comercial@echauz.com", anio_fundacion: 1990,
    });
    expect(n.campos.telefono).toBe("+34 681 131 903");
    expect(n.campos.web).toMatch(/^https?:\/\/(www\.)?echauz\.com/);
    expect(n.horario_visitas).toBe("Lunes a Viernes: 10:00 h - 17:00 h");
    const h = hechosFicha(n, "f1", "guia", "2026-11-09T00:00:00Z");
    expect(h.map((x) => x.clave)).toEqual(["bodega.enoturismo", "bodega.fundacion_anio", "bodega.horario_visitas"]);
  });

  it("separa dirección, municipio y provincia", () => {
    expect(separarDireccion("Calle Mayor 3. Roa (Burgos)")).toEqual({ calle: "Calle Mayor 3", municipio: "Roa", provincia: "Burgos" });
    expect(separarDireccion("Sin formato")).toEqual({ calle: "Sin formato", municipio: null, provincia: null });
    expect(separarDireccion(null).calle).toBeNull();
  });

  it("resume el horario agrupando días consecutivos", () => {
    expect(resumirHorario([
      { dia: "Lunes", horas: "10:00 h - 14:00 h" }, { dia: "Martes", horas: "10:00 H - 14:00 h" },
      { dia: "Sábado", horas: "11:00 h - 13:00 h" },
    ])).toBe("Lunes a Martes: 10:00 h - 14:00 h; Sábado: 11:00 h - 13:00 h");
    expect(resumirHorario([])).toBeNull();
  });
});

describe("servicios", () => {
  const pesquera = normalizarProducto(producto("producto-pesquera.html", pesqueraUrl));

  it("tipo, precio y temporada", () => {
    expect(pesquera).toMatchObject({
      idExterno: "producto:20149", tipo: "visita", precio_desde: 40, horario: "Noviembre, Mes del Enoturismo",
      paquete: false, duracion_minutos: 120, idiomas: ["es", "en"],
    });
    expect(tipoDeServicio("Curso de Cata")).toBe("cata");
    expect(tipoDeServicio("Picnic en el Bosque")).toBe("otra");
  });

  it("campos de servicios_bodega sin descripción", () => {
    expect(camposServicio(pesquera, "Visita")).toEqual({
      titulo: "Visita", precio_desde: 40, duracion_minutos: 120, idiomas: ["es", "en"],
      horario: "Noviembre, Mes del Enoturismo", url_reserva: "https://vindesia.com/experiencias-tinto-pesquera/", activo: true,
    });
  });

  const bodegas = [
    { nombre: "Bodega Tinto Pesquera", bodegaId: "b-pesquera" },
    { nombre: "Condado de Haza", bodegaId: "b-haza" },
    { nombre: "Bodegas y Viñedos Pradorey", bodegaId: "b-pradorey" },
    { nombre: "Visitar Finca Villacreces", bodegaId: "b-villacreces" },
    { nombre: "Bodega Bela", bodegaId: "b-bela" },
    { nombre: "Pago Dos", bodegaId: "b-otra" },
    { nombre: "Pago Dos", bodegaId: "b-otra2" },
  ];

  it("asigna la bodega por prefijo y recorta el título", () => {
    expect(asignarBodega("Tinto Pesquera Visita por el Mes del Enoturismo", bodegas)).toEqual({
      estado: "bodega", bodegaId: "b-pesquera", titulo: "Visita por el Mes del Enoturismo",
    });
    expect(asignarBodega("Bodegas Pradorey Visita premium", bodegas)).toMatchObject({ bodegaId: "b-pradorey", titulo: "Visita premium" });
    expect(asignarBodega("Bodega Finca Villacreces Picnic sobre ruedas", bodegas)).toMatchObject({ bodegaId: "b-villacreces", titulo: "Picnic sobre ruedas" });
    expect(asignarBodega("Bodegas Bela Bela Primordial", bodegas)).toMatchObject({ bodegaId: "b-bela", titulo: "Bela Primordial" });
    expect(asignarBodega("Condado de Haza El Château", bodegas)).toMatchObject({ bodegaId: "b-haza", titulo: "El Château" });
  });

  it("una palabra + «de X» es un lugar, no una bodega", () => {
    const b = [{ nombre: "Bodegas Hacienda Monasterio", bodegaId: "b-mon" }];
    expect(asignarBodega("Monasterio de Valbuena Restaurante Converso", b)).toEqual({ estado: "ninguna" });
    expect(asignarBodega("Monasterio Visita guiada", b)).toMatchObject({ bodegaId: "b-mon" });
  });

  it("sin prefijo → ninguna; dos bodegas con el mismo prefijo → ambigua", () => {
    expect(asignarBodega("Escape Room en Peñafiel", bodegas)).toEqual({ estado: "ninguna" });
    expect(asignarBodega("Pago Dos Visita", bodegas)).toEqual({ estado: "ambigua", bodegaIds: ["b-otra", "b-otra2"] });
  });

  it("los packs multibodega se marcan", () => {
    const p = normalizarProducto({ ...producto("producto-gratuito.html", pesqueraUrl), nombre: "AA.VV. Top Ribera del Duero. Plan" });
    expect(p.paquete).toBe(true);
  });
});

// Salvaguarda: con `fuentes.activa = false` el CLI no ejecuta la fuente salvo en --dry-run.
describe("fuente inactiva (aviso legal pendiente)", () => {
  let servidor: Server | undefined;
  afterEach(async () => {
    vi.unstubAllEnvs();
    await new Promise((r) => (servidor ? servidor.close(r) : r(null)));
  });

  async function arrancar() {
    const peticiones: string[] = [];
    servidor = createServer((req, res) => {
      peticiones.push(`${req.method} ${req.url}`);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "f1", activa: false }));
    });
    await new Promise<void>((r) => servidor!.listen(0, "127.0.0.1", r));
    const puerto = (servidor.address() as { port: number }).port;
    vi.stubEnv("SUPABASE_URL", `http://127.0.0.1:${puerto}`);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "clave-de-prueba");
    return peticiones;
  }

  it("ejecución real: no llama al scraper, no crea ejecución y sale con 0", async () => {
    const peticiones = await arrancar();
    const scraper = vi.fn(async () => {});
    const codigo = await ejecutar("ruta-vino-ribera", scraper, { dryRun: false, limite: null });
    expect(codigo).toBe(0);
    expect(scraper).not.toHaveBeenCalled();
    expect(peticiones.length).toBeGreaterThan(0);
    expect(peticiones.every((p) => p.startsWith("GET /rest/v1/fuentes"))).toBe(true);
  });

  it("--dry-run sí se ejecuta y no toca la BD", async () => {
    const peticiones = await arrancar();
    const scraper = vi.fn(async () => {});
    const codigo = await ejecutar("ruta-vino-ribera", scraper, {
      dryRun: true, limite: null, rutaSalida: join(tmpdir(), "ruta-ribera-test.json"),
    });
    expect(codigo).toBe(0);
    expect(scraper).toHaveBeenCalledOnce();
    expect(peticiones).toEqual([]);
  });
});
