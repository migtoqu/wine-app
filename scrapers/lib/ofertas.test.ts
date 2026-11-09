import { describe, expect, it } from "vitest";
import type { ClienteDb } from "./db.ts";
import { Log } from "./log.ts";
import {
  compararOferta,
  disponibleDesde,
  normalizarOferta,
  RegistroOfertas,
  resolverSupresion,
  type EntradaOferta,
  type FilaOferta,
} from "./ofertas.ts";
import type { FilaSupresion } from "./consolidacion/supresiones.ts";

const entrada = (e: Partial<EntradaOferta> = {}): EntradaOferta => ({
  idExterno: "sku-1",
  vinoId: "vino-1",
  anadaId: "anada-1",
  url: "https://tienda.example/vino",
  precio: 19.9,
  ...e,
});

describe("disponibleDesde", () => {
  it("entiende schema.org con y sin prefijo", () => {
    expect(disponibleDesde("InStock")).toBe(true);
    expect(disponibleDesde("https://schema.org/OutOfStock")).toBe(false);
    expect(disponibleDesde("http://schema.org/LimitedAvailability")).toBe(true);
    expect(disponibleDesde("PreOrder")).toBe(true);
    expect(disponibleDesde("Discontinued")).toBe(false);
  });
  it("sin dato conocido usa la marca de la tienda o null", () => {
    expect(disponibleDesde(null, false)).toBe(false);
    expect(disponibleDesde("raro", true)).toBe(true);
    expect(disponibleDesde(undefined)).toBeNull();
  });
});

describe("normalizarOferta", () => {
  it("rellena formato 75 cl, EUR y disponible por defecto, y redondea el precio", () => {
    const r = normalizarOferta(entrada({ precio: 19.899, ean: " 8410000000011 " }));
    expect(r).toEqual({
      fila: {
        id_externo: "sku-1",
        vino_id: "vino-1",
        anada_id: "anada-1",
        url: "https://tienda.example/vino",
        precio: 19.9,
        moneda: "EUR",
        formato_ml: 750,
        disponible: true,
        ean: "8410000000011",
        registro_id: null,
      },
    });
  });
  it("descarta sin precio, otra moneda, formato imposible o URL no válida", () => {
    expect(normalizarOferta(entrada({ precio: null }))).toEqual({ motivo: "sin precio" });
    expect(normalizarOferta(entrada({ precio: 0 }))).toEqual({ motivo: "sin precio" });
    expect(normalizarOferta(entrada({ moneda: "usd" }))).toEqual({ motivo: "moneda USD" });
    expect(normalizarOferta(entrada({ formatoMl: 10 }))).toEqual({ motivo: "formato 10" });
    expect(normalizarOferta(entrada({ url: "/relativa" }))).toEqual({ motivo: "URL no válida" });
  });
  it("ignora EAN mal formados y respeta la disponibilidad conocida", () => {
    const r = normalizarOferta(entrada({ ean: "123", disponible: false, formatoMl: 1500 }));
    expect("fila" in r && r.fila).toMatchObject({ ean: null, disponible: false, formato_ml: 1500 });
  });
});

describe("compararOferta", () => {
  const fila = (normalizarOferta(entrada()) as { fila: FilaOferta }).fila;
  const previa = { ...fila, ejecuciones_sin_ver: 0 };
  it("distingue nueva, cambio de precio, otros cambios y sin cambios", () => {
    expect(compararOferta(null, fila)).toBe("nueva");
    expect(compararOferta({ ...previa, precio: 21 }, fila)).toBe("precio");
    expect(compararOferta({ ...previa, disponible: false }, fila)).toBe("actualizada");
    expect(compararOferta({ ...previa, ejecuciones_sin_ver: 2 }, fila)).toBe("actualizada");
    expect(compararOferta(previa, fila)).toBe("sin_cambios");
  });
});

const sup = (entidad_id: string, motivo: string, fusionada_en: string | null = null): FilaSupresion => ({
  id: `s-${entidad_id}`,
  entidad_id,
  motivo,
  fusionada_en,
  claves: {},
});

describe("resolverSupresion", () => {
  const m = new Map([
    ["a", sup("a", "fusion", "b")],
    ["b", sup("b", "fusion", "c")],
    ["x", sup("x", "borrado")],
  ]);
  it("sigue fusiones encadenadas y corta en borrados", () => {
    expect(resolverSupresion("a", m)).toBe("c");
    expect(resolverSupresion("x", m)).toBeNull();
    expect(resolverSupresion("libre", m)).toBe("libre");
  });
  it("no entra en bucle con fusiones circulares", () => {
    const ciclo = new Map([["p", sup("p", "fusion", "q")], ["q", sup("q", "fusion", "p")]]);
    expect(resolverSupresion("p", ciclo)).toBeNull();
  });
});

// --- RegistroOfertas con una BD falsa ----------------------------------------------------------

type Llamada = { tabla: string; op: string; args: unknown[] };

function dbFalsa(datos: {
  tienda?: { id: string; nombre: string; activa: boolean } | null;
  ofertas?: Record<string, unknown>[];
  supresiones?: (FilaSupresion & { entidad_tipo: string })[];
  noVistas?: number;
}) {
  const llamadas: Llamada[] = [];
  const consulta = (tabla: string) => {
    const filtros: Record<string, unknown> = {};
    let op = "select";
    let args: unknown[] = [];
    const resultado = () => {
      if (op === "upsert") return { data: null, error: null };
      if (tabla === "tiendas") return { data: datos.tienda ?? null, error: null };
      if (tabla === "ofertas") return { data: datos.ofertas ?? [], error: null };
      if (tabla === "supresiones") {
        return { data: (datos.supresiones ?? []).filter((s) => s.entidad_tipo === filtros.entidad_tipo), error: null };
      }
      return { data: [], error: null };
    };
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => ((filtros[c] = v), b),
      order: () => b,
      range: () => b,
      maybeSingle: () => b,
      upsert: (...a: unknown[]) => {
        op = "upsert";
        args = a;
        llamadas.push({ tabla, op, args });
        return b;
      },
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, ko),
    };
    return b;
  };
  const db = {
    from: consulta,
    rpc: (nombre: string, a: unknown) => {
      llamadas.push({ tabla: nombre, op: "rpc", args: [a] });
      return Promise.resolve({ data: datos.noVistas ?? 0, error: null });
    },
  };
  return { db: db as unknown as ClienteDb, llamadas };
}

const log = new Log();

describe("RegistroOfertas", () => {
  it("sin tienda activa no escribe nada", async () => {
    const { db, llamadas } = dbFalsa({ tienda: { id: "t1", nombre: "T", activa: false } });
    const r = new RegistroOfertas(db, "f1", log);
    expect(await r.preparar()).toBe(false);
    expect(await r.registrarOferta(entrada())).toBe("omitida");
    expect(await r.cerrar(new Date(), { completa: true })).toBe(0);
    expect(llamadas).toEqual([]);
  });

  it("upsert por (tienda, id_externo) sin tocar oculta_admin; redirige fusiones y omite borrados", async () => {
    const { db, llamadas } = dbFalsa({
      tienda: { id: "t1", nombre: "T", activa: true },
      ofertas: [
        {
          id_externo: "sku-1", vino_id: "vino-1", anada_id: "anada-2", url: "https://tienda.example/antes",
          precio: "18.00", formato_ml: 750, disponible: true, ean: null, ejecuciones_sin_ver: 1,
        },
      ],
      supresiones: [
        { ...sup("anada-1", "fusion", "anada-2"), entidad_tipo: "anada" },
        { ...sup("vino-borrado", "borrado"), entidad_tipo: "vino" },
      ],
    });
    const r = new RegistroOfertas(db, "f1", log);
    expect(await r.preparar()).toBe(true);
    expect(r.tiendaId).toBe("t1");

    expect(await r.registrarOferta(entrada())).toBe("precio");
    const [fila, opciones] = llamadas[0]!.args as [Record<string, unknown>, unknown];
    expect(opciones).toEqual({ onConflict: "tienda_id,id_externo" });
    expect(fila).toMatchObject({
      tienda_id: "t1",
      id_externo: "sku-1",
      anada_id: "anada-2",
      precio: 19.9,
      ejecuciones_sin_ver: 0,
      estado_enlace: "sin_comprobar", // la URL cambió
    });
    expect(fila).not.toHaveProperty("oculta_admin");

    // Misma oferta otra vez en la ejecución: sin cambios y sin reiniciar el estado del enlace.
    expect(await r.registrarOferta(entrada())).toBe("sin_cambios");
    expect(llamadas[1]!.args[0]).not.toHaveProperty("estado_enlace");

    expect(await r.registrarOferta(entrada({ idExterno: "sku-2", vinoId: "vino-borrado", anadaId: null }))).toBe("omitida");
    expect(await r.registrarOferta(entrada({ idExterno: "sku-3", precio: null }))).toBe("omitida");
    expect(llamadas).toHaveLength(2);
    expect(r.contadores).toMatchObject({ precio: 1, sinCambios: 1, omitidas: 2 });
  });

  it("cerrar solo marca no vistas en ejecuciones completas", async () => {
    const { db, llamadas } = dbFalsa({ tienda: { id: "t1", nombre: "T", activa: true }, noVistas: 4 });
    const r = new RegistroOfertas(db, "f1", log);
    await r.preparar();
    const inicio = new Date("2026-11-09T03:00:00Z");
    expect(await r.cerrar(inicio, { completa: false })).toBe(0);
    expect(llamadas).toEqual([]);
    expect(await r.cerrar(inicio, { completa: true })).toBe(4);
    expect(llamadas).toEqual([
      { tabla: "marcar_ofertas_no_vistas", op: "rpc", args: [{ p_tienda: "t1", p_inicio: inicio.toISOString(), p_umbral: 3 }] },
    ]);
  });
});
