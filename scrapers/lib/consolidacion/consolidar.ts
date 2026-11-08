// Upsert común por entidad con prioridad de fuentes por campo (SCOPE §7.2).
// Cada registro de fuente deja sus valores candidatos en valores_fuente; aquí
// se decide el ganador (decidir.ts) y se escribe la columna y su procedencia.
import type { Json } from "../../../src/lib/supabase/database.types.ts";
import { sinError, type ClienteDb } from "../db.ts";
import { igualesJson } from "../json.ts";
import { decidirCampos, origenDeFuente, type Candidato, type Origen, type Procedencia, type TipoFuente } from "./decidir.ts";

export type EntidadConsolidable = "bodega" | "vino" | "anada" | "servicio_bodega";

const TABLA: Record<EntidadConsolidable, "bodegas" | "vinos" | "anadas" | "servicios_bodega"> = {
  bodega: "bodegas",
  vino: "vinos",
  anada: "anadas",
  servicio_bodega: "servicios_bodega",
};

/** Fuente y registro que aportan los valores. */
export interface Aporte {
  registroId: string;
  fuenteId: string;
  tipoFuente: TipoFuente;
  url: string | null;
  /** ISO; por defecto, ahora. */
  observadoEn?: string;
}

export interface ResultadoConsolidacion {
  /** Columnas reescritas en el catálogo. */
  escritos: string[];
}

// Supabase devuelve numeric como number y jsonb como objeto: se guarda tal cual.
const aJson = (v: unknown): Json => (v === undefined ? null : (JSON.parse(JSON.stringify(v)) as Json));

export class Consolidador {
  private db: ClienteDb;

  constructor(db: ClienteDb) {
    this.db = db;
  }

  /**
   * Aporta `campos` (columna → valor; null = la fuente ya no lo da) de un registro a una entidad
   * y reescribe lo que corresponda según la prioridad. Idempotente.
   */
  async consolidar(
    tipo: EntidadConsolidable,
    id: string,
    campos: Record<string, unknown>,
    aporte: Aporte,
  ): Promise<ResultadoConsolidacion> {
    const nombres = Object.keys(campos);
    if (nombres.length === 0) return { escritos: [] };
    const ahora = new Date().toISOString();
    const observadoEn = aporte.observadoEn ?? ahora;
    const origen = origenDeFuente(aporte.tipoFuente);

    const [valores, procs, fila] = await Promise.all([
      this.db
        .from("valores_fuente")
        .select("registro_id, fuente_id, origen, url, campo, valor, observado_en, valor_desde")
        .eq("entidad_tipo", tipo)
        .eq("entidad_id", id)
        .in("campo", nombres),
      this.db
        .from("procedencia_campos")
        .select("campo, origen, fuente_id, registro_id, url, observado_en")
        .eq("entidad_tipo", tipo)
        .eq("entidad_id", id)
        .in("campo", nombres),
      this.db.from(TABLA[tipo]).select(nombres.join(", ")).eq("id", id).maybeSingle(),
    ]);
    const filasValores = sinError(valores, "leer valores_fuente");
    const filasProc = sinError(procs, "leer procedencia");
    const actual = sinError(fila, `leer ${TABLA[tipo]}`) as Record<string, unknown> | null;
    if (!actual) throw new Error(`No existe ${tipo} ${id}`);

    // Candidatos de las demás fuentes + los de este registro (con su valor anterior).
    const candidatos = new Map<string, Candidato[]>();
    const anteriores = new Map<string, { valor: unknown; valorDesde: string }>();
    for (const v of filasValores) {
      if (v.registro_id === aporte.registroId) {
        anteriores.set(v.campo, { valor: v.valor, valorDesde: v.valor_desde });
        continue;
      }
      const lista = candidatos.get(v.campo) ?? [];
      lista.push({
        registroId: v.registro_id,
        fuenteId: v.fuente_id,
        origen: v.origen as Exclude<Origen, "admin">,
        url: v.url,
        valor: v.valor,
        observadoEn: v.observado_en,
        valorDesde: v.valor_desde,
        valorAnterior: v.valor,
      });
      candidatos.set(v.campo, lista);
    }

    const filasPropias: {
      registro_id: string; entidad_tipo: EntidadConsolidable; entidad_id: string; campo: string; valor: Json;
      fuente_id: string; origen: Exclude<Origen, "admin">; url: string | null; observado_en: string; valor_desde: string;
    }[] = [];
    const camposSinValor: string[] = [];
    for (const campo of nombres) {
      const valor = campos[campo];
      const anterior = anteriores.get(campo);
      if (valor === null || valor === undefined) {
        if (anterior) camposSinValor.push(campo);
        continue;
      }
      const valorDesde = anterior && igualesJson(anterior.valor, valor) ? anterior.valorDesde : observadoEn;
      filasPropias.push({
        registro_id: aporte.registroId, entidad_tipo: tipo, entidad_id: id, campo, valor: aJson(valor),
        fuente_id: aporte.fuenteId, origen, url: aporte.url, observado_en: observadoEn, valor_desde: valorDesde,
      });
      const lista = candidatos.get(campo) ?? [];
      lista.push({
        registroId: aporte.registroId, fuenteId: aporte.fuenteId, origen, url: aporte.url,
        valor: JSON.parse(JSON.stringify(valor)), observadoEn, valorDesde,
        valorAnterior: anterior?.valor,
      });
      candidatos.set(campo, lista);
    }

    const procedencias = new Map<string, Procedencia>(
      filasProc.map((p) => [
        p.campo,
        { origen: p.origen, fuenteId: p.fuente_id, registroId: p.registro_id, url: p.url, observadoEn: p.observado_en },
      ]),
    );
    const decisiones = decidirCampos(actual, procedencias, candidatos, nombres, ahora);

    // Escrituras: valores propios, columnas, procedencias.
    if (filasPropias.length > 0) {
      sinError(
        await this.db.from("valores_fuente").upsert(filasPropias, {
          onConflict: "registro_id,entidad_tipo,entidad_id,campo",
        }),
        "guardar valores_fuente",
      );
    }
    if (camposSinValor.length > 0) {
      sinError(
        await this.db
          .from("valores_fuente")
          .delete()
          .eq("registro_id", aporte.registroId)
          .eq("entidad_tipo", tipo)
          .eq("entidad_id", id)
          .in("campo", camposSinValor),
        "borrar valores_fuente",
      );
    }

    const escribir: Record<string, unknown> = {};
    const upsertProc: {
      entidad_tipo: EntidadConsolidable; entidad_id: string; campo: string; origen: Origen;
      fuente_id: string | null; registro_id: string | null; url: string | null; observado_en: string;
    }[] = [];
    const borrarProc: string[] = [];
    for (const [campo, d] of decisiones) {
      if (d.escribir) escribir[campo] = d.escribir.valor;
      if (d.procedencia === null) borrarProc.push(campo);
      else if (d.procedencia) {
        upsertProc.push({
          entidad_tipo: tipo, entidad_id: id, campo, origen: d.procedencia.origen,
          fuente_id: d.procedencia.fuenteId, registro_id: d.procedencia.registroId,
          url: d.procedencia.url, observado_en: d.procedencia.observadoEn,
        });
      }
    }
    if (Object.keys(escribir).length > 0) {
      sinError(
        await this.db.from(TABLA[tipo]).update(escribir as never).eq("id", id),
        `actualizar ${TABLA[tipo]}`,
      );
    }
    if (upsertProc.length > 0) {
      sinError(
        await this.db.from("procedencia_campos").upsert(upsertProc, { onConflict: "entidad_tipo,entidad_id,campo" }),
        "guardar procedencia",
      );
    }
    if (borrarProc.length > 0) {
      sinError(
        await this.db
          .from("procedencia_campos")
          .delete()
          .eq("entidad_tipo", tipo)
          .eq("entidad_id", id)
          .in("campo", borrarProc),
        "borrar procedencia",
      );
    }
    return { escritos: Object.keys(escribir) };
  }
}
