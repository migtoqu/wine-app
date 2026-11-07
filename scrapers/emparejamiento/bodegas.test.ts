import { describe, expect, it } from "vitest";
import { claveNombreBodega, claveTexto } from "../lib/texto.ts";
import { similitud, trigramas } from "../lib/trigram.ts";
import { Emparejador, type BodegaCandidata } from "./bodegas.ts";

const bodega = (id: string, razonSocial: string, marcas: string[] = []): BodegaCandidata => ({
  id,
  nombre: razonSocial,
  clave: claveNombreBodega(razonSocial),
  marcas: marcas.map(claveTexto),
});

describe("trigramas (como pg_trgm)", () => {
  it("rellena cada palabra con dos espacios delante y uno detrás", () => {
    expect([...trigramas("Cat")].sort()).toEqual(["  c", " ca", "at ", "cat"]);
  });

  it("similitud = comunes / unión, sin tildes ni mayúsculas", () => {
    expect(similitud("Protos", "PROTOS")).toBe(1);
    expect(similitud("Cristóbal", "cristobal")).toBe(1);
    // select similarity('word', 'two words') en PostgreSQL = 0.36363637
    expect(similitud("word", "two words")).toBeCloseTo(0.363636, 5);
    expect(similitud("", "algo")).toBe(0);
  });
});

describe("Emparejador", () => {
  const bodegas = [
    bodega("aalto", "AALTO BODEGAS Y VIÑEDOS.", ["AALTO", "AALTO PS"]),
    bodega("conde", "BODEGAS Y VIÑEDOS CONDE DE SAN CRISTÓBAL, S.L.", ["CONDE DE SAN CRISTÓBAL", "FLOR DE SAN CRISTÓBAL"]),
    bodega("protos", "PROTOS BODEGA RIBERA DUERO DE PEÑAFIEL, S.L.", ["PROTOS"]),
    bodega("legaris", "BODEGAS LEGARIS, S.L.", ["LEGARIS", "PÁRAMOS DE LEGARIS"]),
    bodega("cielo", "PAGO DEL CIELO, S.L.", ["CELESTE"]),
    bodega("hnos-a", "HERMANOS PÉREZ PASCUAS, S.L.", ["VIÑA PEDROSA"]),
    bodega("hnos-b", "HERMANOS SASTRE, S.L.", ["VIÑA SASTRE"]),
  ];
  const e = new Emparejador(bodegas);

  it("bodega exacta tras normalizar (forma societaria, «Bodegas», tildes)", () => {
    const r = e.emparejar({ bodega: "Bodegas Conde de San Cristóbal", grupo: [], vino: "Conde de San Cristóbal" });
    expect(r).toMatchObject({ estado: "emparejado", bodegaId: "conde", confianza: 1 });
    expect(r.candidatos[0]!.motivo).toBe("bodega_exacta");
  });

  it("nombre de tienda contenido en la razón social", () => {
    const r = e.emparejar({ bodega: "Protos", grupo: [], vino: "Protos Reserva" });
    expect(r).toMatchObject({ estado: "emparejado", bodegaId: "protos" });
  });

  it("marca del Consejo Regulador cuando la tienda no da bodega", () => {
    const r = e.emparejar({ bodega: null, grupo: [], vino: "Páramos de Legaris" });
    expect(r).toMatchObject({ estado: "emparejado", bodegaId: "legaris", confianza: 1 });
    const c = e.emparejar({ bodega: null, grupo: ["Familia Torres"], vino: "Celeste Crianza" });
    expect(c).toMatchObject({ estado: "emparejado", bodegaId: "cielo" });
  });

  it("sin señales suficientes → revisión, sin bodega", () => {
    const r = e.emparejar({ bodega: "Bodegas Inventadas del Norte", grupo: [], vino: "Nada Que Ver" });
    expect(r.estado).toBe("revision");
    expect(r.bodegaId).toBeNull();
    expect(r.confianza).toBeLessThan(0.85);
  });

  it("empate entre dos bodegas → revisión (no se elige al azar)", () => {
    const dup = new Emparejador([bodega("a", "Bodegas Ejemplo, S.L."), bodega("b", "EJEMPLO, S.A.")]);
    const r = dup.emparejar({ bodega: "Ejemplo", grupo: [], vino: "Ejemplo Roble" });
    expect(r.estado).toBe("revision");
    expect(r.candidatos.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("las palabras compartidas («Hermanos») no bastan", () => {
    const r = e.emparejar({ bodega: "Hermanos", grupo: [], vino: "Tinto Hermanos" });
    expect(r.estado).toBe("revision");
  });

  it("el grupo solo apoya: por sí solo no supera el umbral", () => {
    const r = e.emparejar({ bodega: null, grupo: ["Legaris"], vino: "Vino Sin Marca" });
    expect(r.confianza).toBe(0.8);
    expect(r.estado).toBe("revision");
  });

  it("ignora marcas genéricas y años en las marcas", () => {
    const m = new Emparejador([
      bodega("protos", "PROTOS BODEGA RIBERA DUERO DE PEÑAFIEL, S.L.", ["PROTOS", "RIBERA DUERO"]),
      bodega("adrada", "Dominio de Adrada", ["Dominio de Adrada 2022"]),
    ]);
    expect(m.emparejar({ bodega: null, grupo: [], vino: "Ribera Duero Selección" }).estado).toBe("revision");
    expect(m.emparejar({ bodega: null, grupo: [], vino: "Dominio de Adrada" })).toMatchObject({
      estado: "emparejado",
      bodegaId: "adrada",
    });
  });

  it("umbral y margen configurables", () => {
    const laxo = new Emparejador(bodegas, { umbral: 0.5, margen: 0 });
    expect(laxo.emparejar({ bodega: null, grupo: ["Legaris"], vino: "Vino Sin Marca" }).estado).toBe("emparejado");
  });
});

// Casos reales del dry-run del 2026-11-07: nombre y marcas tal y como los publica el
// Consejo Regulador, frente a lo que muestra Vinoselección.
describe("Emparejador con casos reales", () => {
  const ribera = [
    bodega("vargas", "Grupo Vinicola Marques de Vargas", [
      "CONDE DE SAN CRISTOBAL", "CONDE SAN CRISTOBAL RAICES", "CONDE DE SAN CRISTOBAL FLAMINGO ROSE",
    ]),
    bodega("lopez-cristobal", "Bodegas López Cristóbal", []),
    bodega("atauta", "Bodegas Dominio de Atauta", ["DOMINIO DE ATAUTA", "PARADA DE ATAUTA", "LA CELESTINA"]),
    bodega("capilla", "Bodegas Finca La Capilla", ["LA CAPILLA", "VALNOGAL"]),
    bodega("legaris", "Legaris", ["LEGARIS", "PARAMOS DE LEGARIS", "CALMO LEGARIS"]),
    bodega("emilio-moro", "Bodegas Emilio Moro", ["FINCA RESALSO", "EMILIO MORO", "MALLEOLUS"]),
    bodega("arzuaga", "Bodegas Arzuaga Navarro", ["ARZUAGA", "VIÑEDOS Y BODEGAS LA PLANTA", "GRAN ARZUAGA"]),
    bodega("protos", "Protos B. Ribera Duero de Peñafiel", ["PROTOS", "RIBERA DUERO", "PROTOS SELECCIÓN"]),
    bodega("matarromera", "Bodega Matarromera", ["MATARROMERA CRIANZA", "Matarromera Esencia"]),
  ];
  const e = new Emparejador(ribera);
  const caso = (bodegaTienda: string | null, vino: string, grupo: string[] = []) =>
    e.emparejar({ bodega: bodegaTienda, grupo, vino });

  it.each([
    // [bodega en la tienda, vino, bodega esperada, motivo]
    ["Bodegas Conde de San Cristóbal", "Conde de San Cristóbal", "vargas", "marca"],
    ["Bodegas La Celestina", "La Celestina Crianza", "atauta", "marca"],
    ["Bodegas Finca La Capilla", "La Capilla Crianza", "capilla", "bodega_exacta"],
    ["Bodegas Legaris", "Legaris Crianza", "legaris", "bodega_exacta"],
    ["Bodegas Emilio Moro", "La Felisa", "emilio-moro", "bodega_exacta"],
    ["Bodegas Arzuaga Navarro", "La Planta", "arzuaga", "bodega_exacta"],
    ["Protos", "Protos Reserva", "protos", "marca"],
    ["Protos", "Tinto Especial", "protos", "bodega_contenida"],
    [null, "Matarromera Esencia", "matarromera", "marca"],
  ])("%s · %s → %s", (bodegaTienda, vino, esperada, motivo) => {
    const r = caso(bodegaTienda, vino);
    expect(r.estado).toBe("emparejado");
    expect(r.bodegaId).toBe(esperada);
    expect(r.candidatos[0]!.motivo).toBe(motivo);
  });

  it("gana la marca más específica (EMINA PASIÓN es marca de Matarromera, EMINA de Emina)", () => {
    const m = new Emparejador([
      bodega("emina", "Bodega Emina", ["EMINA"]),
      bodega("matarromera", "Bodega Matarromera", ["EMINA PASIÓN", "EMINA CRIANZA"]),
    ]);
    expect(m.emparejar({ bodega: "Bodega Emina Ribera", grupo: [], vino: "Emina Pasión" })).toMatchObject({
      estado: "emparejado",
      bodegaId: "matarromera",
    });
  });

  it("el grupo propietario solo no basta (Viña Mayor → Entrecanales Domecq e Hijos)", () => {
    const m = new Emparejador([bodega("entrecanales", "Entrecanales Domecq e Hijos", ["CAMPARRÓN"])]);
    const r = m.emparejar({
      bodega: "Bodegas y Viñedos Viña Mayor",
      grupo: ["Entrecanales Domecq e Hijos"],
      vino: "Viña Mayor Crianza",
    });
    expect(r).toMatchObject({ estado: "revision", confianza: 0.8 });
  });

  it("la bodega de la tienda es una marca registrada de otra razón social", () => {
    const m = new Emparejador([
      bodega("alberto-benito", "Alberto y Benito", ["BRIEGO", "BRIEGO FIEL"]),
      bodega("grandes", "Grandes Bodegas", ["MARQUÉS DE VELILLA", "FINCA LA MARÍA MARQUÉS DE VELILLA"]),
    ]);
    expect(m.emparejar({ bodega: "Bodegas Briego", grupo: [], vino: "Supernova Crianza" })).toMatchObject({
      estado: "emparejado",
      bodegaId: "alberto-benito",
      confianza: 0.9,
    });
    expect(m.emparejar({ bodega: "Marqués de Velilla", grupo: [], vino: "Núa Crianza" })).toMatchObject({
      estado: "emparejado",
      bodegaId: "grandes",
    });
  });

  it("dos bodegas con la misma puntuación máxima → revisión (Bardos)", () => {
    const m = new Emparejador([
      bodega("bardos", "Bodega Bardos", []),
      bodega("hoz", "Bodegas y Viñedos de Hoz Sualdea", ["BARDOS ROMÁNTICA", "BARDOS SUPREMA"]),
    ]);
    expect(m.emparejar({ bodega: "Bodegas De Bardos", grupo: [], vino: "Bardos Suprema" }).estado).toBe("revision");
  });

  it("una bodega de la tienda que no está en Ribera va a revisión", () => {
    expect(caso("Bodegas Inexistentes", "Vino Desconocido 2020", ["Grupo X"]).estado).toBe("revision");
  });
});
