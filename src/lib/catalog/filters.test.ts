import { describe, expect, it } from "vitest";
import {
  clearFilters,
  countActiveFilters,
  isValidSlug,
  parseAnada,
  parseSearchFilters,
  serializeSearchFilters,
  toListarBodegasArgs,
  toListarVinosArgs,
  totalPages,
} from "./filters";

describe("parseSearchFilters", () => {
  it("devuelve valores por defecto sin parámetros", () => {
    expect(parseSearchFilters({})).toEqual({
      q: "",
      ver: "vinos",
      tipos: [],
      crianzas: [],
      denominaciones: [],
      variedades: [],
      anada: null,
      bodega: null,
      orden: "nombre",
      pagina: 1,
    });
  });

  it("normaliza el texto y usa relevancia por defecto si hay búsqueda", () => {
    const f = parseSearchFilters({ q: "  vega   sicilia " });
    expect(f.q).toBe("vega sicilia");
    expect(f.orden).toBe("relevancia");
  });

  it("recorta búsquedas demasiado largas", () => {
    expect(parseSearchFilters({ q: "a".repeat(500) }).q).toHaveLength(100);
  });

  it("acepta claves repetidas y listas separadas por comas, sin duplicados y en orden canónico", () => {
    const f = parseSearchFilters({
      tipo: ["rosado", "tinto", "tinto"],
      crianza: "reserva,joven",
      do: ["ribera-del-duero", "rioja", "ribera-del-duero"],
      uva: "tempranillo",
    });
    expect(f.tipos).toEqual(["tinto", "rosado"]);
    expect(f.crianzas).toEqual(["joven", "reserva"]);
    expect(f.denominaciones).toEqual(["ribera-del-duero", "rioja"]);
    expect(f.variedades).toEqual(["tempranillo"]);
  });

  it("descarta valores inválidos", () => {
    const f = parseSearchFilters({
      tipo: ["tinto", "cerveza"],
      crianza: "eterna",
      do: ["Rioja!", "../etc", "rioja"],
      bodega: "Bodega Con Espacios",
      orden: "precio",
      ver: "mapa",
      pagina: "-3",
      anada: "20x0",
    });
    expect(f.tipos).toEqual(["tinto"]);
    expect(f.crianzas).toEqual([]);
    expect(f.denominaciones).toEqual(["rioja"]);
    expect(f.bodega).toBeNull();
    expect(f.orden).toBe("nombre");
    expect(f.ver).toBe("vinos");
    expect(f.pagina).toBe(1);
    expect(f.anada).toBeNull();
  });

  it("no permite ordenar por relevancia sin texto", () => {
    expect(parseSearchFilters({ orden: "relevancia" }).orden).toBe("nombre");
    expect(parseSearchFilters({ orden: "novedad" }).orden).toBe("novedad");
  });

  it("acota la página", () => {
    expect(parseSearchFilters({ pagina: "3" }).pagina).toBe(3);
    expect(parseSearchFilters({ pagina: "999999" }).pagina).toBe(400);
  });
});

describe("parseAnada", () => {
  it("entiende años y 'sin'", () => {
    expect(parseAnada("2020")).toBe(2020);
    expect(parseAnada("SIN")).toBe("sin");
    expect(parseAnada(["2018", "2019"])).toBe(2018);
  });

  it("rechaza años fuera de rango o mal formados", () => {
    expect(parseAnada("1500")).toBeNull();
    expect(parseAnada("20")).toBeNull();
    expect(parseAnada(undefined)).toBeNull();
  });
});

describe("serializeSearchFilters", () => {
  it("omite los valores por defecto", () => {
    expect(serializeSearchFilters(parseSearchFilters({}))).toBe("");
    expect(serializeSearchFilters(parseSearchFilters({ q: "protos", orden: "relevancia" }))).toBe(
      "?q=protos",
    );
  });

  it("es la inversa de parseSearchFilters", () => {
    const query =
      "?q=vega+sicilia&tipo=tinto&tipo=blanco&crianza=reserva&do=ribera-del-duero&uva=tempranillo&anada=sin&bodega=vega-sicilia&orden=novedad&pagina=2";
    const f = parseSearchFilters(Object.fromEntries(groupParams(query)));
    expect(parseSearchFilters(Object.fromEntries(groupParams(serializeSearchFilters(f))))).toEqual(
      f,
    );
  });

  it("vuelve a la página 1 al cambiar un filtro, pero no al cambiar de página", () => {
    const f = parseSearchFilters({ q: "rioja", pagina: "4" });
    expect(serializeSearchFilters(f, { tipos: ["tinto"] })).toBe("?q=rioja&tipo=tinto");
    expect(serializeSearchFilters(f, { pagina: 5 })).toBe("?q=rioja&pagina=5");
  });

  it("limpia los filtros conservando la búsqueda", () => {
    const f = parseSearchFilters({ q: "rioja", tipo: "tinto", anada: "2019", bodega: "muga" });
    expect(serializeSearchFilters(f, clearFilters(f))).toBe("?q=rioja");
  });
});

describe("countActiveFilters", () => {
  it("cuenta cada valor seleccionado", () => {
    const f = parseSearchFilters({ tipo: ["tinto", "blanco"], anada: "2019", bodega: "muga", q: "x" });
    expect(countActiveFilters(f)).toBe(4);
  });
});

describe("toListarVinosArgs", () => {
  it("solo incluye los filtros definidos y calcula el desplazamiento", () => {
    const f = parseSearchFilters({ pagina: "3" });
    expect(toListarVinosArgs(f)).toEqual({ orden: "nombre", limite: 24, desplazamiento: 48 });
  });

  it("traduce todos los filtros a los parámetros de la función SQL", () => {
    const f = parseSearchFilters({
      q: "reserva",
      tipo: "tinto",
      crianza: "reserva",
      do: "rioja",
      uva: "garnacha",
      anada: "2019",
      bodega: "muga",
    });
    expect(toListarVinosArgs(f, 12)).toEqual({
      q: "reserva",
      tipos: ["tinto"],
      crianzas: ["reserva"],
      denominaciones: ["rioja"],
      variedades: ["garnacha"],
      anio: 2019,
      bodega: "muga",
      orden: "relevancia",
      limite: 12,
      desplazamiento: 0,
    });
  });

  it("usa sin_anada para 'sin'", () => {
    const args = toListarVinosArgs(parseSearchFilters({ anada: "sin" }));
    expect(args.sin_anada).toBe(true);
    expect(args.anio).toBeUndefined();
  });
});

describe("toListarBodegasArgs", () => {
  it("usa el texto y la primera D.O.", () => {
    const f = parseSearchFilters({ q: "pago", do: ["toro", "rioja"], pagina: "2" });
    expect(toListarBodegasArgs(f)).toEqual({
      q: "pago",
      denominacion: "rioja",
      limite: 24,
      desplazamiento: 24,
    });
  });
});

describe("utilidades", () => {
  it("totalPages", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(24)).toBe(1);
    expect(totalPages(25)).toBe(2);
  });

  it("isValidSlug", () => {
    expect(isValidSlug("vega-sicilia-unico")).toBe(true);
    expect(isValidSlug("__placeholder__")).toBe(false);
    expect(isValidSlug("Vega")).toBe(false);
  });
});

// Agrupa una query string en el formato de searchParams de Next (claves repetidas → array).
function groupParams(query: string): Map<string, string | string[]> {
  const map = new Map<string, string | string[]>();
  for (const [k, v] of new URLSearchParams(query)) {
    const prev = map.get(k);
    map.set(k, prev === undefined ? v : [...(Array.isArray(prev) ? prev : [prev]), v]);
  }
  return map;
}
