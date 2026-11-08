import { describe, expect, it } from "vitest";
import { compararCandidatos, decidirCampo, decidirCampos, mejorCandidato, type Candidato, type Procedencia } from "./decidir.ts";

const AHORA = "2026-11-10T09:00:00.000Z";

function cand(p: Partial<Candidato> & Pick<Candidato, "registroId" | "origen" | "valor">): Candidato {
  return {
    fuenteId: `f-${p.registroId}`,
    url: `https://${p.registroId}.test`,
    observadoEn: "2026-11-01T00:00:00.000Z",
    valorDesde: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}
const proc = (c: Candidato): Procedencia => ({
  origen: c.origen, fuenteId: c.fuenteId, registroId: c.registroId, url: c.url, observadoEn: c.observadoEn,
});
const ADMIN: Procedencia = { origen: "admin", fuenteId: null, registroId: null, url: null, observadoEn: AHORA };

describe("prioridad de fuentes (SCOPE §7.2)", () => {
  it("web oficial > consejo regulador > guía > tienda", () => {
    const tienda = cand({ registroId: "t", origen: "tienda", valor: 13 });
    const cr = cand({ registroId: "c", origen: "consejo_regulador", valor: 14 });
    const web = cand({ registroId: "w", origen: "bodega", valor: 15 });
    const guia = cand({ registroId: "g", origen: "guia", valor: 16 });
    expect(mejorCandidato([tienda, cr, guia, web])).toBe(web);
    expect(mejorCandidato([tienda, guia, cr])).toBe(cr);
    expect(mejorCandidato([tienda, guia])).toBe(guia);
  });

  it("a igual prioridad gana el valor más reciente (valor_desde), no la última visita", () => {
    // A lleva desde enero diciendo 13,5; B dice 14 desde marzo. A se visita después cada semana.
    const a = cand({ registroId: "a", origen: "tienda", valor: 13.5, valorDesde: "2026-01-01T00:00:00Z", observadoEn: "2026-11-09T00:00:00Z" });
    const b = cand({ registroId: "b", origen: "tienda", valor: 14, valorDesde: "2026-03-01T00:00:00Z", observadoEn: "2026-11-02T00:00:00Z" });
    expect(mejorCandidato([a, b])).toBe(b);
    expect(mejorCandidato([b, a])).toBe(b);
  });

  it("empate total → orden determinista por registro", () => {
    const a = cand({ registroId: "a", origen: "tienda", valor: 1 });
    const b = cand({ registroId: "b", origen: "tienda", valor: 2 });
    expect([b, a].sort(compararCandidatos)[0]).toBe(a);
  });

  it("los valores vacíos no compiten", () => {
    const web = cand({ registroId: "w", origen: "bodega", valor: null });
    const tienda = cand({ registroId: "t", origen: "tienda", valor: "x" });
    expect(mejorCandidato([web, tienda])).toBe(tienda);
  });
});

describe("decidirCampo", () => {
  it("el admin siempre gana, también si dejó el campo vacío", () => {
    const web = cand({ registroId: "w", origen: "bodega", valor: "+34 1" });
    expect(decidirCampo("+34 0", ADMIN, [web], AHORA)).toEqual({});
    expect(decidirCampo(null, ADMIN, [web], AHORA)).toEqual({});
  });

  it("campo vacío sin procedencia → escribe el ganador", () => {
    const t = cand({ registroId: "t", origen: "tienda", valor: 14 });
    expect(decidirCampo(null, null, [t], AHORA)).toEqual({ escribir: { valor: 14 }, procedencia: proc(t) });
  });

  it("valor manual sin procedencia (creado a mano) → se respeta y pasa a 'admin'", () => {
    const t = cand({ registroId: "t", origen: "tienda", valor: "otro" });
    const d = decidirCampo("del admin", null, [t], AHORA);
    expect(d.escribir).toBeUndefined();
    expect(d.procedencia).toMatchObject({ origen: "admin", fuenteId: null });
  });

  it("valor sin procedencia que coincide con una fuente → se le atribuye", () => {
    const t = cand({ registroId: "t", origen: "tienda", valor: "igual" });
    expect(decidirCampo("igual", null, [t], AHORA)).toEqual({ procedencia: proc(t) });
  });

  it("una fuente más prioritaria pisa a la tienda", () => {
    const t = cand({ registroId: "t", origen: "tienda", valor: 13, valorAnterior: 13 });
    const w = cand({ registroId: "w", origen: "bodega", valor: 14 });
    expect(decidirCampo(13, proc(t), [t, w], AHORA)).toEqual({ escribir: { valor: 14 }, procedencia: proc(w) });
  });

  it("una tienda no pisa al consejo regulador", () => {
    const c = cand({ registroId: "c", origen: "consejo_regulador", valor: "Roa", valorAnterior: "Roa" });
    const t = cand({ registroId: "t", origen: "tienda", valor: "Aranda" });
    expect(decidirCampo("Roa", proc(c), [c, t], AHORA)).toEqual({});
  });

  it("mismo ganador y mismo valor → no reescribe aunque la BD lo devuelva en otro formato", () => {
    const c = cand({ registroId: "c", origen: "consejo_regulador", valor: "SRID=4326;POINT(1 2)", valorAnterior: "SRID=4326;POINT(1 2)" });
    expect(decidirCampo("0101000020E6100000…", proc(c), [c], AHORA)).toEqual({});
  });

  it("el ganador cambió su valor → se reescribe", () => {
    const c = cand({ registroId: "c", origen: "consejo_regulador", valor: "b@x.es", valorAnterior: "a@x.es" });
    expect(decidirCampo("a@x.es", proc(c), [c], AHORA)).toEqual({ escribir: { valor: "b@x.es" }, procedencia: proc(c) });
  });

  it("la fuente deja de dar el dato y nadie más lo da → se vacía (como antes)", () => {
    const c = cand({ registroId: "c", origen: "consejo_regulador", valor: null, valorAnterior: "a@x.es" });
    expect(decidirCampo("a@x.es", proc(c), [c], AHORA)).toEqual({ escribir: { valor: null }, procedencia: null });
  });

  it("la fuente ganadora deja de dar el dato → pasa a la siguiente", () => {
    const c = cand({ registroId: "c", origen: "consejo_regulador", valor: null });
    const t = cand({ registroId: "t", origen: "tienda", valor: "t@x.es" });
    expect(decidirCampo("c@x.es", proc(c), [c, t], AHORA)).toEqual({ escribir: { valor: "t@x.es" }, procedencia: proc(t) });
  });

  it("decidirCampos solo devuelve los campos con algo que hacer", () => {
    const t = cand({ registroId: "t", origen: "tienda", valor: 14, valorAnterior: 14 });
    const g = cand({ registroId: "t", origen: "tienda", valor: 15 });
    const out = decidirCampos(
      { grado: 14, temp: null },
      new Map([["grado", proc(t)]]),
      new Map([["grado", [t]], ["temp", [g]]]),
      ["grado", "temp"],
      AHORA,
    );
    expect([...out.keys()]).toEqual(["temp"]);
  });
});
