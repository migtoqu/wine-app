import { describe, expect, it } from "vitest";
import { datosBodegaDeRegistro, reemparejar, type Instantanea } from "./reemparejar.ts";

const base = (): Instantanea => ({
  bodegas: [
    { id: "valdubon", nombre: "Bodegas Valdubón", municipio: "Milagros", codigoPostal: "09460", web: "http://www.valdubon.com", marcas: ["valdubon"] },
    { id: "pascual", nombre: "Bodegas Pascual", municipio: "Fuentecén", codigoPostal: "09471", web: "http://www.bodegaspascual.com" },
    { id: "bardos", nombre: "Bodega Bardos", municipio: "Vadocondes", web: "https://bardos.wine" },
  ],
  supresionesBodega: [],
  vinos: [{ id: "roble", bodegaId: "pascual", nombre: "Heredad de Peñalosa Roble", tipo: "tinto", crianza: "roble" }],
  eans: [],
  supresionesVino: [],
  vinculadas: [],
  registros: [
    { id: "r1", fuente: "ruta-vino-ribera", idExterno: "directorio:1", bodegaId: null,
      datos: { nombre: "Bodegas Valdubón", direccion: "Bodegas Valdubón - Ribera del Duero, 09460, Milagros, Burgos", web: "http://ferrerwines.com/valdubon/" } },
    { id: "r2", fuente: "web-bodegaspascual-com", idExterno: "vino:/x", bodegaId: "pascual",
      datos: { vino: { nombre: "Heredad de Peñalosa Tinto Roble", tipo: "tinto", crianza: "roble" }, emparejamiento: { motivo: "parecido" } } },
    { id: "r3", fuente: "web-bodegaspascual-com", idExterno: "vino:/y", bodegaId: "pascual",
      datos: { vino: { nombre: "Ideas para regalar", tipo: null }, emparejamiento: { motivo: "tipo_desconocido" } } },
    { id: "r4", fuente: "vinoseleccion", idExterno: "bardos", bodegaId: null,
      datos: { nombre: "Bardos Suprema 2021", bodega_tienda: "Bodegas De Bardos", grupo_tienda: [] } },
    { id: "r5", fuente: "cr-rioja", idExterno: "exp:visita", bodegaId: null, datos: { titulo: "Visita", motivo: "bodega_sin_enlace" } },
  ],
});

describe("reemparejar", () => {
  it("clasifica cada registro y solo marca como aplicables las fichas de bodega", () => {
    const inf = reemparejar(base());
    const por = Object.fromEntries(inf.resultados.map((r) => [r.registroId, r]));
    expect(por.r1).toMatchObject({ tipo: "bodega", accion: "vincular_bodega", destinoId: "valdubon" });
    expect(por.r2).toMatchObject({ tipo: "vino", accion: "vino_existente", destinoId: "roble", motivo: "nombre_canonico" });
    expect(por.r3).toMatchObject({ accion: "omitido", motivo: "tipo_desconocido" });
    expect(por.r4).toMatchObject({ tipo: "vino_tienda", accion: "bodega_encontrada", destinoId: "bardos" });
    expect(por.r5).toMatchObject({ tipo: "servicio", accion: "omitido" });
    expect(inf.resumen["webs-bodegas"]).toMatchObject({ vino_existente: 1, omitido: 1 });
  });

  it("no vincula a una bodega ya vinculada a otro registro de la misma fuente", () => {
    const inst = base();
    inst.vinculadas = [{ fuente: "ruta-vino-ribera", idExterno: "directorio:2", bodegaId: "valdubon" }];
    expect(reemparejar(inst).resultados[0]!.accion).not.toBe("vincular_bodega");
  });

  it("respeta las supresiones del admin: una bodega borrada no es destino", () => {
    const inst = base();
    inst.bodegas = inst.bodegas.filter((b) => b.id !== "valdubon");
    inst.supresionesBodega = [{ supresionId: "s1", entidadId: "valdubon", motivo: "borrado", destinoId: null, nombre: "Bodegas Valdubón", municipio: "Milagros" }];
    const r = reemparejar(inst).resultados[0]!;
    expect(r.accion).not.toBe("vincular_bodega");
    expect(r.destinoId).toBeNull();
  });

  it("audita vinculaciones existentes que ya no se harían", () => {
    const inst = base();
    inst.auditoria = [
      { id: "a1", fuente: "web-valdubon-com", idExterno: "sitio", bodegaId: "valdubon", datos: { dominio: "valdubon.com" } },
      { id: "a2", fuente: "web-otra-com", idExterno: "sitio", bodegaId: "pascual", datos: { dominio: "otra.com" } },
    ];
    const s = reemparejar(inst).sospechas;
    expect(s.map((x) => x.registroId)).toEqual(["a2"]);
  });

  it("lee fichas de bodega en los formatos de las fuentes", () => {
    expect(datosBodegaDeRegistro({ campos: { nombre: "X", codigo_postal: "09300", telefono: "947 000 000" } })).toMatchObject({ nombre: "X", codigoPostal: "09300" });
    expect(datosBodegaDeRegistro({ dominio: "aalto.es" })).toMatchObject({ nombre: "aalto.es", web: "https://aalto.es" });
    expect(datosBodegaDeRegistro({})).toBeNull();
  });
});
