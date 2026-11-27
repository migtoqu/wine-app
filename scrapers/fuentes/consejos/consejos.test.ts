import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Contexto } from "../../lib/ejecucion.ts";
import { provinciaDeCodigoPostal } from "../../lib/geo.ts";
import { decodificarCuerpo } from "../../lib/http.ts";
import { Log } from "../../lib/log.ts";
import * as bierzo from "./bierzo.ts";
import * as cigales from "./cigales.ts";
import { crearScraperConsejo, fichaDesdeListado } from "./comun/ejecutar.ts";
import { candidatosSlug, hechosConsejo, vinculoDudosoPorDominio } from "./comun/guardar.ts";
import { limpiarMarcas, municipioDe, normalizarBodega, provinciaDe, provinciaDeTexto, webPropia } from "./comun/normalizar.ts";
import type { DefinicionConsejo, EntradaListado } from "./comun/tipos.ts";
import { CONSEJOS } from "./index.ts";
import * as jerez from "./jerez.ts";
import * as penedes from "./penedes.ts";
import * as priorat from "./priorat.ts";
import * as rueda from "./rueda.ts";
import * as toro from "./toro.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const fixtureBytes = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

describe("provincia y municipio", () => {
  it("provincia por código postal", () => {
    expect(provinciaDeCodigoPostal("49882")).toBe("Zamora");
    expect(provinciaDeCodigoPostal("24401")).toBe("León");
    expect(provinciaDeCodigoPostal("43737")).toBe("Tarragona");
    expect(provinciaDeCodigoPostal("40450")).toBe("Segovia");
    expect(provinciaDeCodigoPostal("01300")).toBe("Álava");
    expect(provinciaDeCodigoPostal("52001")).toBe("Melilla");
    expect(provinciaDeCodigoPostal("53000")).toBeNull();
    expect(provinciaDeCodigoPostal("4988")).toBeNull();
    expect(provinciaDeCodigoPostal(null)).toBeNull();
  });

  it("provincia: CP, luego tabla de municipios, luego texto de la fuente; nunca por defecto", () => {
    const tabla = { nieva: "Segovia" };
    expect(provinciaDe("47490", "Nieva", null, tabla)).toBe("Valladolid");
    expect(provinciaDe(null, "Nieva", null, tabla)).toBe("Segovia");
    expect(provinciaDe(null, "Otro", "(Zamora)", tabla)).toBe("Zamora");
    expect(provinciaDe(null, "Otro", null, tabla)).toBeNull();
    expect(provinciaDeTexto("León, España")).toBe("León");
    expect(provinciaDeTexto("VALLADOLID")).toBe("Valladolid");
    expect(provinciaDeTexto("Spain")).toBeNull();
  });

  it("municipio con alias y capitalización", () => {
    expect(municipioDe("TORROJA", priorat.ALIAS_MUNICIPIO)).toBe("Torroja del Priorat");
    expect(municipioDe("Vilella Baixa", priorat.ALIAS_MUNICIPIO)).toBe("La Vilella Baixa");
    expect(municipioDe("SAN ROMÁN DE HORNIJA")).toBe("San Román de Hornija");
    expect(municipioDe("  ")).toBeNull();
  });

  it("web propia: ni redes sociales ni la web del consejo", () => {
    expect(webPropia("www.bodegajaviersanz.com")).toBe("http://www.bodegajaviersanz.com");
    expect(webPropia("https://es-es.facebook.com/BodegasClavidor")).toBeNull();
    expect(webPropia("https://www.dotoro.com/bodegas/x/")).toBeNull();
    expect(webPropia(null)).toBeNull();
  });

  it("marcas sin duplicados ni vacías", () => {
    expect(limpiarMarcas(["Termes", " termes.", "", "Numanthia"])).toEqual(["Termes", "Numanthia"]);
  });
});

describe("Toro", () => {
  it("listado: fichas únicas, relativas incluidas", () => {
    expect(toro.parsearListado(fixture("toro-listado.html")).map((e) => e.datos.id_externo)).toEqual([
      "slug:a-velasco-e-hijos-s-l",
      "slug:bodegas-numanthia",
      "slug:vina-zangarron-s-l",
    ]);
  });

  it("ficha: etiquetas, dirección partida, marcas y web", () => {
    const url = "https://www.dotoro.com/bodegas/bodegas-numanthia/";
    const f = toro.parsearFicha(fixture("toro-ficha-numanthia.html"), { url, datos: { id_externo: "slug:bodegas-numanthia" } });
    expect(f).toMatchObject({
      nombre: "BODEGA NUMANTHIA",
      direccion: "C/ Real S/N",
      codigo_postal: "49882",
      municipio: "Valdefinjas",
      provincia_texto: "Zamora",
      web: "https://www.numanthia.com",
      telefono: "980 699 147",
      email: "contact@numanthia.com",
      marcas: ["Numanthia", "Termes", "Termanthia"],
      extra: { anio_inscripcion: 2000 },
    });
    const n = normalizarBodega(f, toro.consejoToro);
    expect(n.campos).toMatchObject({ nombre: "Bodega Numanthia", provincia: "Zamora", comunidad: "Castilla y León", telefono: "+34 980 699 147" });
    expect(n.datos.claves_marcas).toEqual(["numanthia", "termes", "termanthia"]);
  });

  it("municipio limpio y provincia por tabla (Villafranca de Duero es Valladolid)", () => {
    expect(toro.limpiarMunicipio("Pedrosa del Rey: Pago de Villaester de Arriba")).toBe("Pedrosa del Rey");
    expect(toro.limpiarMunicipio("Toro, Toro")).toBe("Toro");
    const f = fichaDesdeListado({ url: "u", datos: { id_externo: "slug:x", nombre: "Campiña, S. Coop. CyL", municipio: "Villafranca de Duero", provincia_texto: "Zamora" } });
    expect(normalizarBodega(f, toro.consejoToro).campos).toMatchObject({ nombre: "Campiña", provincia: "Valladolid" });
  });

  it("partirMarcas", () => {
    expect(toro.partirMarcas("Vega Saúco, Wences / Adoremus y Selección")).toEqual(["Vega Saúco", "Wences", "Adoremus", "Selección"]);
    expect(toro.partirMarcas(null)).toEqual([]);
  });
});

describe("Cigales", () => {
  it("listado: municipio del encabezado anterior", () => {
    const es = cigales.parsearListado(fixture("cigales-listado.html"));
    expect(es.map((e) => [e.datos.nombre, e.datos.municipio])).toEqual([
      ["Bodegas Thesaurus", "Cigales"],
      ["Bodegas Protos", "Cubillas de Santa Marta"],
      ["Bodegas Sinforiano", "Trigueros"],
    ]);
  });

  it("ficha: marcas y contacto; la dirección de la sede (otro municipio) no se usa como dirección", () => {
    const url = "https://do-cigales.es/bodegas/bodegas-protos/";
    const f = cigales.parsearFicha(fixture("cigales-ficha-protos.html"), {
      url, datos: { id_externo: "slug:bodegas-protos", nombre: "Bodegas Protos", municipio: "Cubillas de Santa Marta" },
    });
    expect(f).toMatchObject({
      nombre: "Bodegas Protos",
      direccion: null,
      codigo_postal: null,
      municipio: "Cubillas de Santa Marta",
      web: "https://www.bodegasprotos.com/",
      telefono: "+34 983 878011",
      email: "contacto@bodegasprotos.com",
      marcas: ["Protos Clarete", "Aire de Protos", "Protos Rosé"],
      extra: { direccion_contacto: "Cam. Bodegas Protos, 24-28, 47300 Peñafiel, Valladolid" },
    });
    expect(JSON.stringify(f)).not.toContain("persona de contacto");
    expect(normalizarBodega(f, cigales.consejoCigales).campos.provincia).toBe("Valladolid");
  });

  it("alias de municipio y Dueñas en Palencia", () => {
    const base = fichaDesdeListado({ url: "u", datos: { id_externo: "slug:x", nombre: "X", municipio: "Trigueros" } });
    expect(normalizarBodega(base, cigales.consejoCigales).campos).toMatchObject({ municipio: "Trigueros del Valle", provincia: "Valladolid" });
    const duenas = { ...base, municipio: "Dueñas" };
    expect(normalizarBodega(duenas, cigales.consejoCigales).campos.provincia).toBe("Palencia");
  });

  it("partirDireccion", () => {
    expect(cigales.partirDireccion("Ctra. Cigales, s/n, 47270 Cigales, Valladolid")).toEqual({
      calle: "Ctra. Cigales, s/n", cp: "47270", municipio: "Cigales", provincia: "Valladolid",
    });
    expect(cigales.partirDireccion("Camino viejo")).toEqual({ calle: "Camino viejo", cp: null, municipio: null, provincia: null });
  });
});

describe("Bierzo", () => {
  it("listado: URLs absolutas por <base>, sin el buscador ni duplicados", () => {
    const es = bierzo.parsearListado(fixture("bierzo-listado.html"));
    expect(es.map((e) => e.url)).toEqual([
      "https://www.crdobierzo.es/es/bodegas-y-vinos/13-vinas/108/",
      "https://www.crdobierzo.es/es/bodegas-y-vinos/bodegas-emilio-moro-sl/93/",
    ]);
    expect(es[1]!.datos).toEqual({ id_externo: "id:93", nombre: "BODEGAS EMILIO MORO, S.L." });
  });

  it("ficha: dirección en líneas, coordenadas y sin personas", () => {
    const url = "https://www.crdobierzo.es/es/bodegas-y-vinos/bodegas-emilio-moro-sl/93/";
    const f = bierzo.parsearFicha(fixture("bierzo-ficha-emilio-moro.html"), { url, datos: { id_externo: "id:93" } });
    expect(f).toMatchObject({
      nombre: "BODEGAS EMILIO MORO, S.L.",
      direccion: "Ctra. de Molinaseca, Km.2",
      codigo_postal: "24401",
      municipio: "Ponferrada",
      provincia_texto: "León, España",
      ubicacion: { lat: 42.598161, lng: -6.713569000000007 },
      web: "http://www.emiliomoro.com/el-bierzo",
    });
    const n = normalizarBodega(f, bierzo.consejoBierzo);
    expect(n.campos).toMatchObject({
      nombre: "Bodegas Emilio Moro", provincia: "León", telefono: "+34 983 878 400", email: "bodega@emiliomoro.com",
      ubicacion: "SRID=4326;POINT(-6.713569000000007 42.598161)",
    });
    expect(JSON.stringify(n)).not.toContain("[persona]");
  });
});

describe("Priorat", () => {
  it("listado: fichas, última página y nada de otros hosts", () => {
    const p = priorat.parsearListado(fixture("priorat-listado.html"));
    expect(p.ultimaPagina).toBe(10);
    expect(p.entradas.map((e) => e.datos.id_externo)).toEqual(["slug:adrets-del-priorat", "slug:alvaro-palacios-sl"]);
    expect(priorat.urlPagina(1)).toBe("https://www.doqpriorat.org/cellers/");
    expect(priorat.urlPagina(3)).toBe("https://www.doqpriorat.org/cellers/page/3");
  });

  it("ficha en catalán: etiquetas, coordenadas, idiomas; visitas solo profesionales ≠ enoturismo", () => {
    const url = "https://www.doqpriorat.org/cellers/alvaro-palacios-sl/";
    const f = priorat.parsearFicha(fixture("priorat-ficha-alvaro-palacios.html"), { url, datos: { id_externo: "slug:alvaro-palacios-sl" } });
    expect(f).toMatchObject({
      nombre: "Alvaro Palacios",
      direccion: "Polígon 6, Parcel·la 26",
      codigo_postal: "43737",
      municipio: "Gratallops",
      ubicacion: { lat: 41.1897183, lng: 0.7794682 },
      web: "https://alvaropalacios.com/",
      email: "info@alvaropalacios.com",
      enoturismo: null,
      extra: { seccion_visitas: true, idiomas_visita: ["ca", "es", "en"] },
    });
    expect(JSON.stringify(f)).not.toMatch(/\[persona|descripci/);
    const n = normalizarBodega(f, priorat.consejoPriorat);
    expect(n.campos).toMatchObject({ provincia: "Tarragona", comunidad: "Cataluña", telefono: "+34 977 839 195" });
    expect(n.hechos.map((h) => h.clave)).not.toContain("bodega.enoturismo");
  });

  it("sin código postal, provincia por municipio (alias incluido)", () => {
    const f = fichaDesdeListado({ url: "u", datos: { id_externo: "slug:x", nombre: "Terra", municipio: "Torroja" } });
    expect(normalizarBodega(f, priorat.consejoPriorat).campos).toMatchObject({ municipio: "Torroja del Priorat", provincia: "Tarragona" });
  });

  it("visitasAbiertas", () => {
    expect(priorat.visitasAbiertas("Visites de dilluns a dissabte amb reserva prèvia")).toBe(true);
    expect(priorat.visitasAbiertas("No es fan visites")).toBe(false);
    expect(priorat.visitasAbiertas("Només professionals")).toBeNull();
    expect(priorat.visitasAbiertas("Professionals i públic en general")).toBe(true);
    expect(priorat.visitasAbiertas(null)).toBeNull();
  });
});

describe("Rueda", () => {
  it("la tabla es la ficha: localidad, web, visitable y tienda", () => {
    const es = rueda.parsearListado(fixture("rueda-listado.html"));
    expect(es.map((e) => [e.datos.id_externo, e.datos.municipio, e.datos.enoturismo])).toEqual([
      ["pdb:172", "La Seca", true],
      ["pdb:205", "Rubí de Bracamonte", true],
      ["pdb:164", "Rueda", false],
    ]);
    const n = normalizarBodega(fichaDesdeListado(es[0]!), rueda.consejoRueda);
    expect(n.campos).toMatchObject({ nombre: "Bodega Campo Eliseo", provincia: "Valladolid", web: "https://www.campoeliseo.es" });
    expect(n.datos.extra).toEqual({ visitable: "Ruta del Vino de Rueda", tienda_online: "https://www.bodeboca.com/search?term=campo%20eliseo" });
    expect(n.hechos).toContainEqual({ clave: "bodega.enoturismo", valor: true });
  });

  it("visitable", () => {
    expect(rueda.visitable("Ruta del Vino de Rueda")).toBe(true);
    expect(rueda.visitable("Sí")).toBe(true);
    expect(rueda.visitable("No")).toBe(false);
    expect(rueda.visitable("")).toBeNull();
  });

  it("municipios de Segovia y Ávila", () => {
    expect(provinciaDe(null, "Nieva", null, rueda.PROVINCIA_POR_MUNICIPIO)).toBe("Segovia");
    expect(provinciaDe(null, "Madrigal de las Altas Torres", null, rueda.PROVINCIA_POR_MUNICIPIO)).toBe("Ávila");
  });
});

describe("núcleo común", () => {
  it("hechos con origen consejo_regulador y D.O. de la definición", () => {
    const f = fichaDesdeListado({ url: "https://x/", datos: { id_externo: "slug:x", nombre: "BODEGAS X, S.L.", municipio: "Toro", enoturismo: true } });
    const n = normalizarBodega(f, toro.consejoToro);
    const hechos = hechosConsejo(n, "f1", "2026-11-09T00:00:00.000Z");
    expect(hechos.map((h) => [h.clave, h.valor])).toEqual([
      ["bodega.nombre", "Bodegas X"],
      ["bodega.municipio", "Toro"],
      ["bodega.provincia", "Zamora"],
      ["bodega.denominacion", "Toro"],
      ["bodega.enoturismo", true],
    ]);
    expect(hechos[0]!.fuente).toEqual({ fuente_id: "f1", registro_id: null, url: "https://x/", origen: "consejo_regulador" });
  });

  it("vínculo solo por dominio de grupo y nombres distintos → dudoso", () => {
    const emp = (nombre: string, motivo: "dominio" | "nombre" = "dominio") => ({
      estado: "vinculada" as const, bodegaId: "b1", supresionId: null, confianza: 0.97,
      candidatos: [{ id: "b1", nombre, puntuacion: 0.97, motivo }],
    });
    expect(vinculoDudosoPorDominio(emp("Viñedos de Paganos"), "Teso la Monja")).toBe(true);
    expect(vinculoDudosoPorDominio(emp("Bodegas Riojanas"), "Bodegas Torreduero")).toBe(true);
    expect(vinculoDudosoPorDominio(emp("Protos B. Ribera Duero de Peñafiel"), "Bodegas Protos")).toBe(false);
    expect(vinculoDudosoPorDominio(emp("Bodegas Ontañón, el Templo del Vino"), "Altos de Ontañon")).toBe(false);
    expect(vinculoDudosoPorDominio(emp("Otra", "nombre"), "Nada que ver")).toBe(false);
    expect(vinculoDudosoPorDominio({ ...emp("Otra"), estado: "nueva" }, "Nada que ver")).toBe(false);
  });

  it("candidatosSlug", () => {
    const n = normalizarBodega(fichaDesdeListado({ url: "u", datos: { id_externo: "id:1", nombre: "Viña Buena, S.A.", municipio: "Cigales" } }), cigales.consejoCigales);
    expect(candidatosSlug(n.campos, "id:1").slice(0, 3)).toEqual(["vina-buena", "vina-buena-cigales", "vina-buena-2"]);
  });

  it("fichaDesdeListado exige nombre e id", () => {
    expect(() => fichaDesdeListado({ url: "u", datos: { nombre: "X" } })).toThrow(/incompleta/);
  });

  it("todas las definiciones: slug cr-*, D.O. y robots", () => {
    expect(Object.keys(CONSEJOS)).toEqual(["consejo-toro", "consejo-cigales", "consejo-bierzo", "consejo-priorat", "consejo-rueda", "consejo-penedes", "consejo-jerez"]);
    for (const def of Object.values(CONSEJOS)) {
      expect(def.slug).toMatch(/^cr-[a-z]+$/);
      expect(def.denominacion.slug).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(def.urlsRobots.length).toBeGreaterThan(0);
    }
  });

  it("runner en dry-run: robots, listado, fichas; errores de ficha se cuentan sin parar", async () => {
    const pedidas: string[] = [];
    const robots: string[] = [];
    const def: DefinicionConsejo = {
      slug: "cr-prueba",
      denominacion: { slug: "toro", nombre: "Toro" },
      urlsRobots: ["https://p/listado"],
      async listar(ctx) {
        await ctx.http.get("https://p/listado");
        return [
          { url: "https://p/a", datos: { id_externo: "slug:a" } },
          { url: "https://p/rota", datos: { id_externo: "slug:rota" } },
          { url: "https://p/b", datos: { id_externo: "slug:b" } },
        ];
      },
      parsearFicha(html: string, e: EntradaListado) {
        if (html === "") throw new Error("vacía");
        return fichaDesdeListado({ url: e.url, datos: { ...e.datos, nombre: html, codigo_postal: "49800", municipio: "Toro" } });
      },
    };
    const ctx = {
      fuenteSlug: def.slug, dryRun: true, limite: 2, db: null, fuenteId: null, log: new Log({ verbose: false }),
      contadores: { nuevos: 0, actualizados: 0, sinCambios: 0, descartados: 0, revision: 0, omitidas: 0, errores: 0 },
      rutaBodegas: null, salida: [] as unknown[], opciones: {}, marcarParcial() {},
      http: {
        peticiones: 0,
        async comprobarRobots(u: string) { robots.push(u); },
        async get(u: string) { pedidas.push(u); return { url: u, status: 200, texto: u.endsWith("rota") ? "" : `Bodega ${u.slice(-1).toUpperCase()}` }; },
      },
    } as unknown as Contexto;
    await crearScraperConsejo(def)(ctx);
    expect(robots).toEqual(["https://p/listado"]);
    expect(pedidas).toEqual(["https://p/listado", "https://p/a", "https://p/rota"]);
    expect(ctx.contadores.errores).toBe(1);
    expect(ctx.salida).toHaveLength(1);
    expect((ctx.salida[0] as { campos: { provincia: string } }).campos.provincia).toBe("Zamora");
  });
});

describe("Penedès: tabla + CSV del consejo", () => {
  const tabla = penedes.parsearTabla(fixture("penedes-listado.html"));
  // El CSV se sirve en Latin-1: se decodifica como lo hace el cliente HTTP.
  const csv = penedes.parsearCsv(decodificarCuerpo(fixtureBytes("penedes-cellers.csv")));

  // La fixture del CSV tiene solo 4 filas (sin el contacto de las otras 130 bodegas en el repo).
  it("las 134 bodegas de la tabla; el contacto, de su fila del CSV", () => {
    expect(tabla).toHaveLength(134);
    expect(csv).toHaveLength(4);
    const es = penedes.combinar(tabla, csv);
    expect(es).toHaveLength(134);
    expect(es.filter((e) => e.datos.telefono || e.datos.web || e.datos.email)).toHaveLength(4);
    // Sin fila en el CSV, la bodega sale igual con lo que da la tabla.
    expect(es.find((e) => e.datos.nombre === "Vinya Escudé")?.datos).toMatchObject({ municipio: "Sant Quintí de Mediona", telefono: null });
    const albet = es.find((e) => e.datos.nombre === "Albet i Noya")!;
    expect(albet.url).toBe("https://dopenedes.cat/es/bodega/?id=77");
    expect(albet.datos).toMatchObject({
      id_externo: "id:77",
      municipio: "Sant Pau d'Ordal",
      codigo_postal: "08739",
      web: "www.albetinoya.cat",
      email: "info@albetinoya.cat",
    });
    expect(albet.datos.extra).toEqual({ venta_online: true, winebar: true });
    expect(es.find((e) => e.datos.nombre === "Agustí Torelló Mata")!.datos.extra).toEqual({});
  });

  it("CSV: comillas, Latin-1 y CP sin el cero de Excel", () => {
    expect(penedes.camposCsv('"Can ""Ràfols""";"A";;8770;"Sant Sadurní"')).toEqual(['Can "Ràfols"', "A", "", "8770", "Sant Sadurní"]);
    const [f] = penedes.parsearCsv('Celler;Carrer;Carrer2;"Codi Postal";Població;Tel;Web;Email\n"X";"C/ Major, 1";"Baixos";8770;"Sant Sadurní d\'Anoia";938911173;www.x.cat;INFO@X.CAT');
    expect(f).toEqual({ nombre: "X", direccion: "C/ Major, 1, Baixos", codigo_postal: "08770", municipio: "Sant Sadurní d'Anoia", telefono: "938911173", web: "www.x.cat", email: "info@x.cat" });
    expect(csv.find((c) => c.nombre === "Agricola de Llorenç")?.municipio).toBe("Llorenç del Penedès");
  });

  it("normaliza a la D.O. Penedès con provincia por CP (Barcelona y Tarragona)", () => {
    const es = penedes.combinar(tabla, csv);
    const llorenc = normalizarBodega(fichaDesdeListado(es.find((e) => e.datos.nombre === "Agricola de Llorenç")!), penedes.consejoPenedes);
    expect(llorenc.campos.provincia).toBe("Tarragona");
    const albet = normalizarBodega(fichaDesdeListado(es.find((e) => e.datos.nombre === "Albet i Noya")!), penedes.consejoPenedes);
    expect(albet.campos).toMatchObject({ nombre: "Albet i Noya", provincia: "Barcelona", codigo_postal: "08739", web: "http://www.albetinoya.cat" });
    expect(albet.hechos).toContainEqual({ clave: "bodega.denominacion", valor: "Penedès" });
  });
});

describe("Jerez: listado único de sherry.wine", () => {
  const es = jerez.parsearListado(fixture("jerez-listado.html"));

  it("una entrada por bodega con dirección en tres líneas, email y web", () => {
    expect(es.map((e) => e.datos.id_externo)).toContain("slug:albarizas");
    const albarizas = es.find((e) => e.datos.id_externo === "slug:albarizas")!;
    expect(albarizas.url).toBe("https://www.sherry.wine/sherry-wine/bodegas/albarizas");
    expect(albarizas.datos).toMatchObject({
      nombre: "Albarizas", direccion: "Avda. de Jerez s/n", codigo_postal: "11560", municipio: "Trebujena",
      provincia_texto: "Cádiz", web: "https://www.vinosdealbarizas.com",
    });
    expect(albarizas.datos.extra).toEqual({ razon_social: "S.C.A. Vitivinícola Albarizas" });
  });

  it("slugs con tildes codificadas y alias de municipio", () => {
    const n = (id: string) => normalizarBodega(fichaDesdeListado(es.find((e) => e.datos.id_externo === id)!), jerez.consejoJerez).campos;
    expect(n("slug:bodega-conde-peraleja")).toMatchObject({ municipio: "Jerez de la Frontera", provincia: "Cádiz", codigo_postal: "11591" });
    expect(es.every((e) => /^slug:[a-z0-9áéíóúüñ-]+$/.test(e.datos.id_externo!))).toBe(true);
    expect(jerez.partesDireccion(["C/ Olivo, 1", "Chiclana Cádiz", "11130 Spain"])).toEqual({ direccion: "C/ Olivo, 1", municipio: "Chiclana", provincia: "Cádiz", cp: "11130" });
    expect(municipioDe("Chiclana", jerez.ALIAS_MUNICIPIO)).toBe("Chiclana de la Frontera");
    expect(jerez.partesDireccion(["None", "None Sanlúcar de Barrameda", "11540 Spain"])).toEqual({ direccion: null, municipio: "Sanlúcar de Barrameda", provincia: null, cp: "11540" });
    expect(jerez.partesDireccion(["C/Bogotá, 19, B5, 3H", "Sevilla Sevilla", "41013 Spain"])).toMatchObject({ municipio: "Sevilla", provincia: "Sevilla" });
  });

  it("el tipo de registro sale de las pestañas", async () => {
    const pedidas: string[] = [];
    const html = fixture("jerez-listado.html");
    const soloAlbarizas = html.replace(/<div class="box-item is-flex(?:(?!<div class="box-item is-flex)[\s\S])*?bodega-conde-peraleja[\s\S]*?(?=<div class="box-item is-flex|<\/div><\/div><\/div><\/div><\/section>)/, "");
    const ctx = { http: { get: async (u: string) => { pedidas.push(u); return { url: u, status: 200, texto: u.endsWith("expedicion") ? soloAlbarizas : u.endsWith("almacenista") ? "<html></html>" : html }; } }, log: new Log() } as unknown as Contexto;
    const r = await jerez.consejoJerez.listar(ctx);
    expect(pedidas).toEqual([jerez.URL_LISTADO, jerez.URL_EXPEDICION, jerez.URL_ALMACENISTA]);
    expect(r.find((e) => e.datos.id_externo === "slug:albarizas")!.datos.extra).toMatchObject({ registro: "crianza_y_expedicion" });
    expect(r.find((e) => e.datos.id_externo === "slug:bodega-conde-peraleja")!.datos.extra).not.toHaveProperty("registro");
  });
});
