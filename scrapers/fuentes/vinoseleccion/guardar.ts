// Vinoselección: upsert idempotente de vino → añada → variedades → imagen y registro de fuente.
import type { BodegaCandidata, ResultadoEmparejamiento } from "../../emparejamiento/bodegas.ts";
import { EmparejadorVinos, type ResultadoVino } from "../../emparejamiento/vinos.ts";
import { Consolidador, type Aporte } from "../../lib/consolidacion/consolidar.ts";
import type { TipoFuente } from "../../lib/consolidacion/decidir.ts";
import { hechosDe, type Hecho } from "../../lib/consolidacion/hechos.ts";
import { PlantillasEsEn } from "../../lib/consolidacion/plantillas.ts";
import { Resumidor, type GeneradorResumen } from "../../lib/consolidacion/resumen.ts";
import { insertarConSlug } from "../../lib/consolidacion/slug.ts";
import {
  aSupresionBodega,
  aSupresionVino,
  cargarSupresiones,
  clavesAnadasSuprimidas,
  clavesImagenesSuprimidas,
} from "../../lib/consolidacion/supresiones.ts";
import { sinError, type ClienteDb } from "../../lib/db.ts";
import { igualesJson } from "../../lib/json.ts";
import type { Log } from "../../lib/log.ts";
import { claveNombreBodega, claveTexto, slugify } from "../../lib/texto.ts";
import type { Database } from "../../../src/lib/supabase/database.types.ts";
import { SLUG_DENOMINACION } from "../ribera/guardar.ts";
import { SLUG_FUENTE as SLUG_RIBERA } from "../ribera/index.ts";
import type { CamposAnada, DatosRegistroVs, Variedad, VinoNormalizado } from "./normalizar.ts";

export type Resultado = "nuevo" | "actualizado" | "sin_cambios" | "revision" | "descartado";

/** Prefijo de los candidatos que son bodegas borradas por el admin (no se emparejan con ellas). */
export const PREFIJO_SUPRIMIDA = "supresion:";

/** Resultado de guardar un vino emparejado con su bodega. */
export type ResultadoGuardado =
  | { tipo: "guardado"; anadaId: string; resultado: "nuevo" | "actualizado" | "sin_cambios" }
  | { tipo: "revision"; vino: ResultadoVino }
  | { tipo: "suprimido"; supresionId: string };

const EAN = /^(\d{8}|\d{12,14})$/;

/** Hechos atómicos de la ficha (materia prima del resumen propio; nunca descripción ni cata). */
export function hechosVinoseleccion(n: VinoNormalizado, fuenteId: string, observadoEn: string): Hecho[] {
  return hechosDe({ fuente_id: fuenteId, registro_id: null, url: n.url, origen: "tienda" }, observadoEn, [
    { clave: "vino.nombre", valor: n.vino.nombre },
    { clave: "vino.tipo", valor: n.vino.tipo },
    { clave: "vino.crianza", valor: n.vino.crianza },
    { clave: "vino.denominacion", valor: "Ribera del Duero" },
    { clave: "anada.anio", valor: n.anada.anio },
    { clave: "anada.barrica_meses", valor: n.anada.meses_crianza, unidad: "meses" },
    { clave: "anada.grado", valor: n.anada.grado, unidad: "%" },
    { clave: "anada.temperatura_min", valor: n.anada.temp_servicio_min, unidad: "ºC" },
    { clave: "anada.temperatura_max", valor: n.anada.temp_servicio_max, unidad: "ºC" },
    ...n.variedades.map((v) => ({ clave: "anada.variedad" as const, valor: v.porcentaje, sujeto: v.nombre, unidad: "%" })),
  ]);
}

// Nombres de tienda que no coinciden con el nombre ni los sinónimos oficiales.
const ALIAS_VARIEDAD: Record<string, string> = {
  garnacha: "garnacha-tinta",
  "garnacha negra": "garnacha-tinta",
  "tinta fina": "tempranillo",
  "tinto del pais": "tempranillo",
  cabernet: "cabernet-sauvignon",
  albillo: "albillo-mayor",
  carinena: "mazuela",
};

const CAMPOS_ANADA: (keyof CamposAnada)[] = ["temp_servicio_min", "temp_servicio_max", "meses_crianza", "grado"];

/** Lee una tabla entera en páginas de 1000 filas (límite de PostgREST). */
async function paginar<T>(
  que: string,
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await pagina(desde, desde + 999);
    if (r.error) throw new Error(`leer ${que}: ${r.error.message}`);
    todas.push(...(r.data ?? []));
    if ((r.data ?? []).length < 1000) return todas;
  }
}

/**
 * Composición que esta fuente escribió la vez anterior (`datos.variedades`). undefined si el
 * registro es anterior a este campo: entonces no se sabe qué escribió la fuente y solo se rellena
 * una añada sin uvas, para no pisar lo que haya corregido el admin.
 */
export function variedadesAnteriores(datos: unknown): Variedad[] | undefined {
  const v = (datos as { variedades?: unknown } | null)?.variedades;
  return Array.isArray(v) ? (v as Variedad[]) : undefined;
}

function sinEmparejamiento(datos: unknown): unknown {
  if (!datos || typeof datos !== "object") return datos;
  return Object.fromEntries(Object.entries(datos).filter(([k]) => k !== "emparejamiento"));
}

export class GuardadoVinoseleccion {
  private db: ClienteDb;
  private fuenteId: string;
  private log: Log;
  private denominacionId = "";
  private variedades = new Map<string, string>(); // clave nombre/sinónimo → id
  private slugsVariedad = new Map<string, string>(); // slug → id
  private bodegaSlug = new Map<string, string>(); // id → slug
  private slugsVino = new Set<string>();
  private bodegaDeVino = new Map<string, string>(); // vino id → bodega id
  private vinos = new EmparejadorVinos([]);
  private anadasSuprimidas = new Map<string, string>(); // vino_id|año → supresión
  private imagenesSuprimidas = new Set<string>(); // anada_id|url
  private consolidador: Consolidador;
  private resumidor: Resumidor;
  private tipoFuente: TipoFuente = "tienda";

  constructor(db: ClienteDb, fuenteId: string, log: Log, generador: GeneradorResumen = new PlantillasEsEn()) {
    this.db = db;
    this.fuenteId = fuenteId;
    this.log = log;
    this.consolidador = new Consolidador(db);
    this.resumidor = new Resumidor(db, generador);
  }

  /** Bodega de un vino (para decisiones del admin que asocian a un vino). */
  bodegaDelVino(vinoId: string): string | null {
    return this.bodegaDeVino.get(vinoId) ?? null;
  }

  /** Carga una vez por ejecución D.O., variedades, vinos y las bodegas candidatas. */
  async preparar(): Promise<BodegaCandidata[]> {
    const den = sinError(
      await this.db.from("denominaciones").select("id").eq("slug", SLUG_DENOMINACION).maybeSingle(),
      "leer denominación",
    );
    if (!den) throw new Error(`No existe la denominación '${SLUG_DENOMINACION}' (¿semillas?)`);
    this.denominacionId = den.id;

    for (const v of sinError(await this.db.from("variedades_uva").select("id, nombre, slug, sinonimos"), "leer variedades")) {
      this.slugsVariedad.set(v.slug, v.id);
      for (const n of [v.nombre, ...v.sinonimos]) this.variedades.set(claveTexto(n), v.id);
    }

    const fuente = sinError(await this.db.from("fuentes").select("tipo").eq("id", this.fuenteId).single(), "leer fuente");
    this.tipoFuente = fuente.tipo;

    const vinos = await paginar("vinos", (d, h) =>
      this.db.from("vinos").select("id, bodega_id, nombre, slug, tipo, crianza").order("id").range(d, h),
    );
    for (const v of vinos) {
      this.slugsVino.add(v.slug);
      this.bodegaDeVino.set(v.id, v.bodega_id);
    }
    const eans = await paginar("EAN", (d, h) => this.db.from("codigos_ean").select("ean, vino_id").order("ean").range(d, h));
    const supVinos = (await cargarSupresiones(this.db, "vino")).map(aSupresionVino).filter((x) => x !== null);
    this.vinos = new EmparejadorVinos(
      vinos.map((v) => ({ id: v.id, bodegaId: v.bodega_id, nombre: v.nombre, tipo: v.tipo, crianza: v.crianza })),
      eans.map((e) => ({ ean: e.ean, vinoId: e.vino_id })),
      supVinos,
    );
    this.anadasSuprimidas = clavesAnadasSuprimidas(await cargarSupresiones(this.db, "anada"));
    this.imagenesSuprimidas = clavesImagenesSuprimidas(await cargarSupresiones(this.db, "imagen"));

    // Marcas de cada bodega según el registro del Consejo Regulador.
    const ribera = sinError(
      await this.db.from("fuentes").select("id").eq("slug", SLUG_RIBERA).maybeSingle(),
      "leer fuente Ribera",
    );
    const marcas = new Map<string, string[]>();
    if (ribera) {
      const registros = await paginar("registros de Ribera", (d, h) =>
        this.db
          .from("registros_fuente")
          .select("entidad_id, datos")
          .eq("fuente_id", ribera.id)
          .eq("entidad_tipo", "bodega")
          .order("id")
          .range(d, h),
      );
      for (const r of registros) {
        const datos = r.datos as { claves_marcas?: string[] } | null;
        if (r.entidad_id) marcas.set(r.entidad_id, datos?.claves_marcas ?? []);
      }
    }

    const bodegas = await paginar("bodegas", (d, h) =>
      this.db.from("bodegas").select("id, nombre, slug").order("id").range(d, h),
    );
    const vivas: BodegaCandidata[] = bodegas.map((b) => {
      this.bodegaSlug.set(b.id, b.slug);
      return { id: b.id, nombre: b.nombre, clave: claveNombreBodega(b.nombre), marcas: marcas.get(b.id) ?? [] };
    });
    // Supresiones del admin: una bodega fusionada es alias del superviviente (con sus marcas);
    // una borrada se ofrece como candidata «suprimida» para no colgar sus vinos de otra.
    const ids = new Set(bodegas.map((b) => b.id));
    const alias: BodegaCandidata[] = [];
    for (const s of (await cargarSupresiones(this.db, "bodega")).map(aSupresionBodega)) {
      if (!s) continue;
      if (s.motivo === "fusion" && s.destinoId && ids.has(s.destinoId)) {
        alias.push({ id: s.destinoId, nombre: s.nombre, clave: claveNombreBodega(s.nombre), marcas: marcas.get(s.destinoId) ?? [] });
      } else if (s.motivo === "borrado") {
        alias.push({ id: `${PREFIJO_SUPRIMIDA}${s.supresionId}`, nombre: s.nombre, clave: claveNombreBodega(s.nombre), marcas: [] });
      }
    }
    return [...vivas, ...alias];
  }

  /** Registro previo de esta ficha (si lo hay). */
  async registroPrevio(idExterno: string) {
    return sinError(
      await this.db
        .from("registros_fuente")
        .select("id, entidad_tipo, entidad_id, estado_emparejamiento, datos, supresion_id, decision, decision_tipo, decision_id")
        .eq("fuente_id", this.fuenteId)
        .eq("id_externo", idExterno)
        .maybeSingle(),
      "leer registro",
    );
  }

  /** Añada ya vinculada por una ejecución anterior o por el admin. */
  async anadaVinculada(anadaId: string): Promise<{ id: string; vino_id: string } | null> {
    return sinError(
      await this.db.from("anadas").select("id, vino_id").eq("id", anadaId).maybeSingle(),
      "leer añada",
    );
  }

  async guardarRegistro(
    n: VinoNormalizado,
    estado: "emparejado" | "revision" | "descartado",
    anadaId: string | null,
    /** Detalle del emparejamiento o motivo, para la cola de revisión (`datos.emparejamiento`). */
    emparejamiento: ResultadoEmparejamiento | ({ motivo: string } & Record<string, unknown>) | null,
    supresionId?: string | null,
  ): Promise<string> {
    // Con añada se guardan también sus campos y su composición, para detectar cambios en la
    // próxima ejecución.
    const datos: DatosRegistroVs & { anada?: CamposAnada; variedades?: Variedad[] } = {
      ...n.datos,
      ...(anadaId ? { anada: n.anada, variedades: n.variedades } : {}),
      ...(emparejamiento ? { emparejamiento } : {}),
    };
    const ahora = new Date().toISOString();
    const fila = sinError(
      await this.db
        .from("registros_fuente")
        .upsert(
          {
            fuente_id: this.fuenteId,
            id_externo: n.idExterno,
            url: n.url,
            datos: JSON.parse(JSON.stringify(datos)),
            hechos: estado === "descartado" ? [] : JSON.parse(JSON.stringify(hechosVinoseleccion(n, this.fuenteId, ahora))),
            entidad_tipo: anadaId ? "anada" : null,
            entidad_id: anadaId,
            confianza_emparejamiento:
              emparejamiento && typeof emparejamiento.confianza === "number" ? emparejamiento.confianza : anadaId ? 1 : null,
            estado_emparejamiento: estado,
            visto_por_ultima_vez: ahora,
            ...(supresionId ? { supresion_id: supresionId } : {}),
          },
          { onConflict: "fuente_id,id_externo" },
        )
        .select("id")
        .single(),
      "guardar registro",
    );
    return fila.id;
  }

  /**
   * Guarda vino → añada → variedades → imagen → EAN y el registro (emparejado), y consolida los
   * campos de la añada con prioridad de fuentes. Con `previo` (ficha ya vinculada) no se empareja.
   * Sin él, el vino se busca dentro de la bodega (EAN, nombre); uno muy parecido va a revisión.
   */
  async guardarVino(
    n: VinoNormalizado,
    bodegaId: string,
    previo: { vinoId: string; anadaId: string; datos: unknown } | null,
    emparejamiento: ResultadoEmparejamiento | null = null,
    opciones: { vinoId?: string; crear?: boolean } = {},
  ): Promise<ResultadoGuardado> {
    if (!n.vino.tipo) throw new Error(`tipo de vino desconocido: ${n.datos.tipo_texto ?? n.datos.nombre}`);
    const ean = n.datos.ean && EAN.test(n.datos.ean) ? n.datos.ean : null;

    let vinoId = previo?.vinoId ?? opciones.vinoId ?? null;
    let nuevo = false;
    let vinoCreado = false;
    if (!vinoId) {
      const r = this.vinos.emparejar(
        { bodegaId, nombre: n.vino.nombre, tipo: n.vino.tipo, crianza: n.vino.crianza, ean },
        { sinParecidos: opciones.crear },
      );
      if (r.estado === "suprimido") return { tipo: "suprimido", supresionId: r.supresionId! };
      if (r.estado === "revision") return { tipo: "revision", vino: r };
      vinoCreado = !r.vinoId;
      vinoId = r.vinoId ?? (await this.crearVino(n, bodegaId));
      nuevo = vinoCreado;
    }

    let anadaId = previo?.anadaId ?? null;
    if (!anadaId) {
      const suprimida = this.anadasSuprimidas.get(`${vinoId}|${n.anada.anio ?? "null"}`);
      if (suprimida) return { tipo: "suprimido", supresionId: suprimida };
      const fila = sinError(
        await this.db
          .from("anadas")
          .upsert({ vino_id: vinoId, anio: n.anada.anio }, { onConflict: "vino_id,anio" })
          .select("id")
          .single(),
        "guardar añada",
      );
      anadaId = fila.id;
      nuevo = true;
    }

    const registroId = await this.guardarRegistro(n, "emparejado", anadaId, emparejamiento);
    if (vinoCreado) await this.procedenciaVinoNuevo(vinoId, n, registroId);
    const aporte: Aporte = { registroId, fuenteId: this.fuenteId, tipoFuente: this.tipoFuente, url: n.url };
    const campos: Record<string, unknown> = Object.fromEntries(CAMPOS_ANADA.map((k) => [k, n.anada[k]]));
    const { escritos } = await this.consolidador.consolidar("anada", anadaId, campos, aporte);
    let cambios = escritos.length > 0;

    // Como con los campos de la añada: solo se escribe si la composición cambió en la fuente.
    const antes = nuevo ? null : variedadesAnteriores(previo?.datos);
    if (await this.guardarVariedades(anadaId, n.variedades, antes)) cambios = true;
    if (await this.guardarImagen(anadaId, n)) cambios = true;
    if (ean) await this.guardarEan(ean, vinoId, anadaId, n.datos.formato_ml);
    await this.resumidor.resumir("anada", anadaId, "elaboracion");

    const datosCambiados = previo
      ? !igualesJson(sinEmparejamiento(previo.datos), { ...n.datos, anada: n.anada, variedades: n.variedades })
      : false;
    return {
      tipo: "guardado",
      anadaId,
      resultado: nuevo ? "nuevo" : cambios || datosCambiados ? "actualizado" : "sin_cambios",
    };
  }

  private async crearVino(n: VinoNormalizado, bodegaId: string): Promise<string> {
    const base = slugify(n.vino.nombre) || "vino";
    const bodega = this.bodegaSlug.get(bodegaId) ?? "bodega";
    const candidatos = [base, `${bodega}-${base}`, ...Array.from({ length: 49 }, (_, i) => `${bodega}-${base}-${i + 2}`)];
    const campos = {
      nombre: n.vino.nombre,
      tipo: n.vino.tipo as Database["public"]["Enums"]["tipo_vino"],
      crianza: n.vino.crianza,
      denominacion_id: this.denominacionId,
    };
    const { id } = await insertarConSlug(
      this.db,
      "vinos",
      { bodega_id: bodegaId, ...campos, fuente_id: this.fuenteId },
      candidatos,
      this.slugsVino,
    );
    this.vinos.anadir({ id, bodegaId, nombre: n.vino.nombre, tipo: n.vino.tipo, crianza: n.vino.crianza });
    this.bodegaDeVino.set(id, bodegaId);
    return id;
  }

  /** Procedencia de los campos de un vino recién creado (solo al crearlo, como hasta ahora). */
  private async procedenciaVinoNuevo(vinoId: string, n: VinoNormalizado, registroId: string) {
    await this.consolidador.consolidar(
      "vino",
      vinoId,
      { nombre: n.vino.nombre, tipo: n.vino.tipo, crianza: n.vino.crianza, denominacion_id: this.denominacionId },
      { registroId, fuenteId: this.fuenteId, tipoFuente: this.tipoFuente, url: n.url },
    );
  }

  private async guardarEan(ean: string, vinoId: string, anadaId: string, formatoMl: number | null) {
    sinError(
      await this.db
        .from("codigos_ean")
        .upsert(
          { ean, vino_id: vinoId, anada_id: anadaId, formato_ml: formatoMl, fuente_id: this.fuenteId },
          { onConflict: "ean", ignoreDuplicates: true },
        ),
      "guardar EAN",
    );
    this.vinos.anadirEan(ean, vinoId, this.bodegaDeVino.get(vinoId) ?? "");
  }

  idVariedad(nombre: string): string | null {
    const c = claveTexto(nombre);
    const alias = ALIAS_VARIEDAD[c];
    return this.variedades.get(c) ?? (alias ? this.slugsVariedad.get(alias) ?? null : null);
  }

  /**
   * Upsert de la composición; las variedades desconocidas se omiten y se registran.
   * `antes`: null = añada nueva (se escribe); array = lo escrito la vez anterior (solo se escribe si
   * cambió); undefined = registro antiguo sin ese dato (solo si la añada no tiene uvas).
   */
  private async guardarVariedades(
    anadaId: string,
    variedades: Variedad[],
    antes: Variedad[] | null | undefined,
  ): Promise<boolean> {
    if (antes && igualesJson(antes, variedades)) return false;
    const filas = new Map<string, number | null>();
    for (const v of variedades) {
      const id = this.idVariedad(v.nombre);
      if (!id) {
        this.log.warn(`Variedad desconocida «${v.nombre}» (se omite)`);
        continue;
      }
      if (!filas.has(id)) filas.set(id, v.porcentaje);
    }
    if (filas.size === 0) return false;
    const actuales = sinError(
      await this.db.from("anada_variedades").select("variedad_id, porcentaje").eq("anada_id", anadaId),
      "leer variedades de la añada",
    );
    const iguales =
      actuales.length === filas.size &&
      actuales.every((a) => filas.has(a.variedad_id) && Number(a.porcentaje ?? NaN) === Number(filas.get(a.variedad_id) ?? NaN));
    if (iguales || (antes === undefined && actuales.length > 0)) return false;
    sinError(
      await this.db.from("anada_variedades").upsert(
        [...filas].map(([variedad_id, porcentaje]) => ({ anada_id: anadaId, variedad_id, porcentaje })),
        { onConflict: "anada_id,variedad_id" },
      ),
      "guardar variedades de la añada",
    );
    return true;
  }

  /** Imagen de botella enlazada (nunca copiada), una por añada y fuente. */
  private async guardarImagen(anadaId: string, n: VinoNormalizado): Promise<boolean> {
    if (!n.imagen || !/^https?:\/\//i.test(n.imagen)) return false;
    // El admin borró esta imagen de esta añada: no se vuelve a enlazar.
    if (this.imagenesSuprimidas.has(`${anadaId}|${n.imagen}`)) return false;
    const actuales = sinError(
      await this.db.from("imagenes").select("id, url, fuente_id, principal").eq("anada_id", anadaId),
      "leer imágenes",
    );
    const propia = actuales.find((i) => i.fuente_id === this.fuenteId);
    if (propia) {
      if (propia.url === n.imagen) return false;
      sinError(await this.db.from("imagenes").update({ url: n.imagen }).eq("id", propia.id), "actualizar imagen");
      return true;
    }
    sinError(
      await this.db.from("imagenes").insert({
        anada_id: anadaId,
        url: n.imagen,
        tipo: "botella",
        fuente_id: this.fuenteId,
        atribucion: "Vinoselección",
        alt: n.datos.nombre,
        principal: !actuales.some((i) => i.principal),
      }),
      "guardar imagen",
    );
    return true;
  }
}
