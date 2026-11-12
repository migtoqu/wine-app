import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { elegirLugar } from "../google-places/cliente.ts";
import { emparejarPoi, resolverConflictos, type BodegaRef, type Emparejamiento } from "./emparejar.ts";
import { Geocodificador } from "./geocodificar.ts";
import { bodegaDeJson, proponer, type BodegaOsm } from "./guardar.ts";
import {
  consultaCalle, consultaMunicipio, limpiarCalle, primerResultado, validarCalle, validarCodigoPostal, validarMunicipio,
} from "./nominatim.ts";
import { parsearOverpass, type Poi } from "./overpass.ts";

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

describe("limpiarCalle", () => {
  it("deja vía y número", () => {
    expect(limpiarCalle("C/ Valoria, 7")).toEqual({ via: "Calle Valoria", numero: "7" });
    expect(limpiarCalle("Avda. de la Constitución 12, 47300", { municipio: "Peñafiel" })).toEqual({
      via: "Avenida de la Constitución", numero: "12",
    });
    expect(limpiarCalle("Calle Chirría S/N")).toEqual({ via: "Calle Chirría", numero: null });
    expect(limpiarCalle("Arrabal 2, 31491")).toEqual({ via: "Arrabal", numero: "2" });
  });

  it("quita municipio y provincia repetidos detrás de la vía", () => {
    expect(limpiarCalle("Plaza Mayor 3, Toro", { municipio: "Toro", provincia: "Zamora" })).toEqual({ via: "Plaza Mayor", numero: "3" });
    expect(limpiarCalle("Carretera Sangüesa s/n – San Martín de Unx 31495 - Navarra")).toBeNull();
  });

  it("descarta carreteras con km, parajes y direcciones sin vía", () => {
    expect(limpiarCalle("Crta. Toro - Salamanca, Km. 5")).toBeNull();
    expect(limpiarCalle("Ctra. N-122, km 311")).toBeNull();
    expect(limpiarCalle("Paraje El Soto")).toBeNull();
    expect(limpiarCalle("31590")).toBeNull();
    expect(limpiarCalle(null)).toBeNull();
  });
});

describe("Nominatim", () => {
  it("consultas estructuradas con país, formato y un solo resultado", () => {
    const u = new URL(consultaMunicipio("Rubí de Bracamonte", "Valladolid"));
    expect(u.host).toBe("nominatim.openstreetmap.org");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      city: "Rubí de Bracamonte", county: "Valladolid", featureType: "settlement", countrycodes: "es", limit: "1", format: "jsonv2",
    });
    expect(new URL(consultaCalle({ via: "Calle Real", numero: "7" }, "Pesquera de Duero")).searchParams.get("street")).toBe("7 Calle Real");
  });

  it("municipio: acepta el núcleo de la provincia esperada y lo marca como 'municipio'", () => {
    const r = primerResultado(fixture("nominatim-municipio.json"));
    const g = validarMunicipio(r, "Rubí de Bracamonte", "Valladolid", "q");
    expect(g).toMatchObject({ precision: "municipio", osm: "relation/343148", punto: { lat: 41.2143669, lon: -4.9241377 } });
    expect(validarMunicipio(r, "Rubí de Bracamonte", "Zamora", "q")).toBeNull();
    expect(validarMunicipio(r, "Rueda", "Valladolid", "q")).toBeNull();
  });

  it("código postal: solo si coincide y cae en su provincia (Navarra uniprovincial)", () => {
    const r = primerResultado(fixture("nominatim-cp.json"));
    expect(validarCodigoPostal(r, "31590", "q")?.precision).toBe("municipio");
    expect(validarCodigoPostal(r, "31591", "q")).toBeNull();
  });

  it("calle y portal dentro del municipio; nunca en otro municipio", () => {
    const centro = { lat: 41.644, lon: -4.157 };
    expect(validarCalle(primerResultado(fixture("nominatim-calle.json")), "Pesquera de Duero", centro, "q")?.precision).toBe("calle");
    expect(validarCalle(primerResultado(fixture("nominatim-portal.json")), "Pesquera de Duero", centro, "q")?.precision).toBe("portal");
    expect(validarCalle(primerResultado(fixture("nominatim-otro-municipio.json")), "Pesquera de Duero", centro, "q")).toBeNull();
    // El municipio es un place, no una calle: no sube de precisión.
    expect(validarCalle(primerResultado(fixture("nominatim-municipio.json")), "Rubí de Bracamonte", null, "q")).toBeNull();
    expect(primerResultado("[]")).toBeNull();
    expect(primerResultado("<html>")).toBeNull();
  });

  it("geocodificador: una consulta por municipio y la calle si es geocodificable", async () => {
    const pedidas: string[] = [];
    const g = new Geocodificador(async (url) => {
      pedidas.push(url);
      const p = new URL(url).searchParams;
      if (p.get("street")) return fixture("nominatim-portal.json");
      return p.get("city") === "Pesquera de Duero"
        ? fixture("nominatim-calle.json").replace('"place_rank":26', '"place_rank":16')
        : "[]";
    });
    const b = { direccion: "C/ Real, 7", codigoPostal: "47315", municipio: "Pesquera de Duero", provincia: "Valladolid" };
    const r1 = await g.geocodificar(b);
    expect(r1.mejor?.precision).toBe("portal");
    expect(r1.municipio?.precision).toBe("municipio");
    const r2 = await g.geocodificar({ ...b, direccion: "Ctra. Renedo, km 3" });
    expect(r2.mejor?.precision).toBe("municipio");
    // Municipio en caché de la ejecución: 1 (municipio) + 1 (calle) + 0.
    expect(pedidas).toHaveLength(2);
    expect(r2.consultas).toHaveLength(1);
  });
});

describe("Overpass", () => {
  const pois = parsearOverpass(fixture("overpass.json"));

  it("POI con nombre, clase, centro de las vías, web, teléfono y horario", () => {
    expect(pois).toHaveLength(4); // el que no tiene nombre se descarta
    expect(pois.find((p) => p.id === "node/3586613380")).toEqual({
      id: "node/3586613380", clase: "bodega", nombre: "Bodegas Sierra", punto: { lat: 42.0441497, lon: -3.7484296 },
      municipio: "Villalmanzo", codigoPostal: "09390", calle: "Autovía del Norte", web: "https://bodegassierra.com",
      telefono: "+34 947 170 083", horario: "Mo-Fr 09:00-14:15,16:00-19:00",
    });
    expect(pois.find((p) => p.id === "way/34206655")?.punto).toEqual({ lat: 28.4924381, lon: -17.8475739 });
    expect(pois.find((p) => p.id === "node/366355337")?.clase).toBe("tienda");
  });

  it("rechaza respuestas de error", () => {
    expect(() => parsearOverpass('{"remark":"runtime error: Query timed out"}')).toThrow();
  });
});

const poi = (o: Partial<Poi> & { id: string; nombre: string; punto: Poi["punto"] }): Poi => ({
  clase: "bodega", municipio: null, codigoPostal: null, calle: null, web: null, telefono: null, horario: null, ...o,
});
const bodega = (o: Partial<BodegaRef> = {}): BodegaRef => ({
  id: "b1", nombre: "Bodegas Sierra", municipio: "Villalmanzo", provincia: "Burgos", codigoPostal: null, web: null, telefono: null, ...o,
});

describe("emparejarPoi", () => {
  const sierra = poi({ id: "node/1", nombre: "Bodegas Sierra", punto: { lat: 42.0441, lon: -3.7484 }, horario: "Mo-Fr 09:00-14:00" });

  it("vincula por nombre dentro del radio del municipio", () => {
    const e = emparejarPoi(bodega(), { punto: { lat: 42.05, lon: -3.75 }, precision: "municipio" }, [sierra]);
    expect(e).toMatchObject({ poi: { id: "node/1" } });
    expect(e!.confianza).toBeGreaterThanOrEqual(0.9);
  });

  it("nada fuera del radio ni con otro nombre", () => {
    expect(emparejarPoi(bodega(), { punto: { lat: 42.3, lon: -3.75 }, precision: "municipio" }, [sierra])).toBeNull();
    expect(emparejarPoi(bodega({ nombre: "Bodegas Arzuaga" }), { punto: { lat: 42.05, lon: -3.75 }, precision: "municipio" }, [sierra])).toBeNull();
  });

  it("una vinoteca (shop=wine) solo con prueba fuerte (web o teléfono)", () => {
    const tienda = { ...sierra, clase: "tienda" as const };
    const ref = { punto: { lat: 42.0441, lon: -3.7484 }, precision: "oficial" as const };
    expect(emparejarPoi(bodega(), ref, [tienda])).toBeNull();
    const conWeb = { ...tienda, web: "https://bodegassierra.com" };
    expect(emparejarPoi(bodega({ web: "https://www.bodegassierra.com/" }), ref, [conWeb])?.motivo).toBe("dominio");
  });

  it("un POI para dos bodegas: gana la de más confianza", () => {
    const e = (id: string, confianza: number, d: number): Emparejamiento => ({ poi: sierra, confianza, motivo: "nombre", distanciaKm: d });
    const r = resolverConflictos(new Map([["a", e("a", 0.92, 1)], ["b", e("b", 0.97, 3)]]));
    expect([...r.keys()]).toEqual(["b"]);
  });
});

describe("proponer", () => {
  const sin: BodegaOsm = bodegaDeJson({ id: "b1", nombre: "Bodegas Sierra", municipio: "Villalmanzo", provincia: "Burgos" });
  const geoMunicipio = {
    mejor: { punto: { lat: 42.05, lon: -3.75 }, precision: "municipio" as const, consulta: "?city=Villalmanzo", osm: "relation/1", nombre: null, tipo: null },
    consultas: ["?city=Villalmanzo"],
  };
  const emp: Emparejamiento = {
    poi: poi({ id: "node/1", nombre: "Bodegas Sierra", punto: { lat: 42.0441497, lon: -3.7484296 }, horario: "Mo-Fr 09:00-14:00", web: "https://bodegassierra.com" }),
    confianza: 0.97, motivo: "nombre_municipio", distanciaKm: 0.7,
  };

  it("centroide de municipio marcado como tal, sin URL de procedencia", () => {
    const p = proponer({ bodega: sin, geo: geoMunicipio, poi: null });
    expect(p.ubicacion).toMatchObject({ precision: "municipio", desde: "nominatim" });
    expect(p.datos.precision).toBe("municipio");
    expect(p.campos.ubicacion).toBe("SRID=4326;POINT(-3.75 42.05)");
    expect(p.url).toBeNull();
  });

  it("el POI emparejado da el punto exacto, la web que falta y el horario", () => {
    const p = proponer({ bodega: sin, geo: geoMunicipio, poi: emp });
    expect(p.ubicacion).toMatchObject({ precision: "exacta", desde: "poi" });
    expect(p.campos).toMatchObject({ web: "https://bodegassierra.com", telefono: null });
    expect(p.datos.opening_hours).toBe("Mo-Fr 09:00-14:00");
    expect(p.url).toBe("https://www.openstreetmap.org/node/1");
  });

  it("con coordenadas oficiales no aporta ubicación ni pisa una web manual", () => {
    const oficial = bodegaDeJson({ id: "b1", nombre: "Bodegas Sierra", lat: 42, lng: -3.7, web: "https://otra.es" });
    const p = proponer({ bodega: oficial, geo: null, poi: emp });
    expect(p.ubicacion).toBeNull();
    expect(p.campos).toEqual({ ubicacion: null, web: null, telefono: null });
    expect(p.datos.opening_hours).toBe("Mo-Fr 09:00-14:00");
  });
});

describe("Google Places: elegirLugar", () => {
  const lugar = (nombre: string, lat: number, lon: number) => ({ id: `id-${nombre}`, nombre, punto: { lat, lon }, tipos: [] });

  it("nombre parecido y cerca; nada si está lejos o no se parece", () => {
    const cerca = { lat: 41.6, lon: -4.1 };
    expect(elegirLugar("Bodegas Protos", cerca, [lugar("Protos Bodega Ribera Duero de Peñafiel", 41.6, -4.1)])?.lugar.id)
      .toBe("id-Protos Bodega Ribera Duero de Peñafiel");
    expect(elegirLugar("Bodegas Protos", cerca, [lugar("Bodegas Protos", 42.6, -4.1)])).toBeNull();
    expect(elegirLugar("Bodegas Protos", cerca, [lugar("Restaurante El Lagar", 41.6, -4.1)])).toBeNull();
  });
});
