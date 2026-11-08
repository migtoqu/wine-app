import { describe, expect, it } from "vitest";
import { dominioWeb, esDominioGenerico } from "../lib/contacto.ts";
import { EmparejadorBodegas, type BodegaCatalogo } from "./entidades.ts";

const AALTO: BodegaCatalogo = { id: "aalto", nombre: "Aalto Bodegas y Viñedos", municipio: "Quintanilla de Arriba", web: "https://www.aalto.es" };
const PESQUERA: BodegaCatalogo = { id: "pesquera", nombre: "Bodegas Alejandro Fernández Tinto Pesquera", municipio: "Pesquera de Duero", web: null };
const GRUPO_A: BodegaCatalogo = { id: "ga", nombre: "Bodega Uno del Grupo", municipio: "Roa", web: "https://www.grupo.es" };
const GRUPO_B: BodegaCatalogo = { id: "gb", nombre: "Bodega Dos del Grupo", municipio: "Aranda de Duero", web: "https://grupo.es/dos" };
const CATALOGO = [AALTO, PESQUERA, GRUPO_A, GRUPO_B];

describe("dominioWeb", () => {
  it("normaliza esquema, mayúsculas, www, subdominios habituales y puerto", () => {
    expect(dominioWeb("https://WWW.Aalto.es/vinos?x=1")).toBe("aalto.es");
    expect(dominioWeb("http://m.bodega.com:8080")).toBe("bodega.com");
    expect(dominioWeb("https://es.bodega.com/")).toBe("bodega.com");
    expect(dominioWeb("https://www2.bodega.com")).toBe("bodega.com");
    expect(dominioWeb("https://tienda.bodega.es")).toBe("tienda.bodega.es");
    expect(dominioWeb("aalto.es")).toBeNull();
    expect(dominioWeb(null)).toBeNull();
  });

  it("detecta dominios genéricos y sus subdominios", () => {
    for (const d of ["facebook.com", "bodega.wixsite.com", "x.wordpress.com", "algo.blogspot.com", "linktr.ee",
      "sites.google.com", "vinoseleccion.com", "bodeboca.com", "instagram.com"]) {
      expect(esDominioGenerico(d), d).toBe(true);
    }
    expect(esDominioGenerico("aalto.es")).toBe(false);
    expect(esDominioGenerico("notfacebook.com")).toBe(false);
  });
});

describe("EmparejadorBodegas", () => {
  const e = new EmparejadorBodegas(CATALOGO);

  it("NIF o registro de embotellador iguales → vinculada aunque cambie el nombre", () => {
    const conNif = new EmparejadorBodegas([{ ...AALTO, nif: "B47000000" }]);
    expect(conNif.emparejar({ nombre: "Otra Razón Social", nif: "b-47000000" })).toMatchObject({ estado: "vinculada", bodegaId: "aalto", confianza: 1 });
    const conRe = new EmparejadorBodegas([{ ...AALTO, registroEmbotellador: "R.E. 1234-BU" }]);
    expect(conRe.emparejar({ nombre: "X", registroEmbotellador: "re 1234 bu" }).bodegaId).toBe("aalto");
  });

  it("NIF distinto descarta aunque el nombre coincida", () => {
    const conNif = new EmparejadorBodegas([{ ...AALTO, nif: "B47000000" }]);
    expect(conNif.emparejar({ nombre: "Aalto", municipio: "Quintanilla de Arriba", nif: "A11111111" }).estado).toBe("nueva");
  });

  it("dominio exclusivo → vinculada", () => {
    const r = e.emparejar({ nombre: "Viñedos Aalto Web", web: "http://aalto.es/es/inicio" });
    expect(r).toMatchObject({ estado: "vinculada", bodegaId: "aalto" });
    expect(r.candidatos[0]!.motivo).toBe("dominio");
  });

  it("dominio compartido por un grupo bodeguero no basta", () => {
    const r = e.emparejar({ nombre: "Bodega Tres del Grupo", web: "https://grupo.es" });
    expect(r.estado).not.toBe("vinculada");
    expect(r.candidatos[0]!.motivo).toBe("dominio_compartido");
  });

  it("dominios genéricos (redes, wix, tiendas) se ignoran", () => {
    const fb = new EmparejadorBodegas([{ ...AALTO, web: "https://www.facebook.com/aalto" }]);
    const r = fb.emparejar({ nombre: "Bodega Distinta", web: "https://facebook.com/otra" });
    expect(r.estado).toBe("nueva");
  });

  it("nombre normalizado + municipio → vinculada", () => {
    const r = e.emparejar({ nombre: "AALTO BODEGAS Y VIÑEDOS, S.A.", municipio: "Quintanilla de ARRIBA" });
    expect(r).toMatchObject({ estado: "vinculada", bodegaId: "aalto", confianza: 0.97 });
  });

  it("nombre igual sin municipio en la fuente → vinculada (0,9)", () => {
    expect(e.emparejar({ nombre: "Aalto" })).toMatchObject({ estado: "vinculada", confianza: 0.9 });
  });

  it("nombre igual en otro municipio → no se vincula (podría ser otra bodega)", () => {
    expect(e.emparejar({ nombre: "Aalto", municipio: "Haro" }).estado).not.toBe("vinculada");
  });

  it("nombre contenido en el mismo municipio → vinculada; sin municipio → revisión", () => {
    expect(e.emparejar({ nombre: "Tinto Pesquera", municipio: "Pesquera de Duero" })).toMatchObject({ estado: "vinculada", bodegaId: "pesquera" });
    expect(e.emparejar({ nombre: "Tinto Pesquera" }).estado).toBe("revision");
  });

  it("parecido por trigramas en la zona dudosa → revisión, nunca duplicado", () => {
    const r = e.emparejar({ nombre: "Alto Bodegas", municipio: "Quintanilla de Arriba" });
    expect(r.estado).toBe("revision");
    expect(r.bodegaId).toBeNull();
    expect(r.candidatos[0]!.id).toBe("aalto");
  });

  it("sin parecido → nueva", () => {
    expect(e.emparejar({ nombre: "Bodegas Zarzuela", municipio: "Peñafiel" }).estado).toBe("nueva");
  });

  it("excluye las bodegas ya vinculadas a otro registro de la misma fuente", () => {
    const r = e.emparejar({ nombre: "Aalto", municipio: "Quintanilla de Arriba" }, { excluir: new Set(["aalto"]) });
    expect(r.estado).toBe("nueva");
  });

  it("una bodega fusionada es alias del superviviente", () => {
    const f = new EmparejadorBodegas([AALTO], [
      { supresionId: "s1", entidadId: "vieja", motivo: "fusion", destinoId: "aalto", nombre: "Aalto Viñedos Antiguo", municipio: "Roa" },
    ]);
    expect(f.emparejar({ nombre: "Aalto Viñedos Antiguo", municipio: "Roa" })).toMatchObject({ estado: "vinculada", bodegaId: "aalto" });
  });

  it("una bodega borrada por el admin no se recrea", () => {
    const f = new EmparejadorBodegas([AALTO], [
      { supresionId: "s2", entidadId: "borrada", motivo: "borrado", destinoId: null, nombre: "Bodegas Fantasma", municipio: "Roa" },
    ]);
    expect(f.emparejar({ nombre: "BODEGAS FANTASMA S.L.", municipio: "Roa" })).toMatchObject({ estado: "suprimida", supresionId: "s2", bodegaId: null });
  });

  it("dos candidatas empatadas → revisión", () => {
    const dup = new EmparejadorBodegas([
      { id: "a", nombre: "Bodegas Gemelas", municipio: "Roa" },
      { id: "b", nombre: "Gemelas", municipio: "Roa" },
    ]);
    expect(dup.emparejar({ nombre: "Gemelas", municipio: "Roa" }).estado).toBe("revision");
  });
});
