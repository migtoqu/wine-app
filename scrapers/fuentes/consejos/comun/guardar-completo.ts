// Consejos con bodegas, vinos y experiencias (Rioja, Navarra): guardado sobre el núcleo de consolidación
// (emparejamiento entre fuentes, prioridad por campo, supresiones, decisiones del admin y resumen propio).
// Extraído de fuentes/rioja/guardar.ts (mismo comportamiento) con la D.O. como parámetro.
import type { Database } from "../../../../src/lib/supabase/database.types.ts";
import {
  bodegaCatalogoDeFila,
  COLUMNAS_EMPAREJAR_BODEGA,
  EmparejadorBodegas,
  type BodegaCatalogo,
  type ResultadoBodega,
} from "../../../emparejamiento/entidades.ts";
import { coordenadas } from "../../../emparejamiento/lugar.ts";
import { EmparejadorVinos, type ResultadoVino } from "../../../emparejamiento/vinos.ts";
import { Consolidador, type Aporte } from "../../../lib/consolidacion/consolidar.ts";
import type { TipoFuente } from "../../../lib/consolidacion/decidir.ts";
import { hechosDe, type Hecho } from "../../../lib/consolidacion/hechos.ts";
import { PlantillasEsEn } from "../../../lib/consolidacion/plantillas.ts";
import { Resumidor, type GeneradorResumen } from "../../../lib/consolidacion/resumen.ts";
import { insertarConSlug } from "../../../lib/consolidacion/slug.ts";
import {
  aSupresionBodega,
  aSupresionVino,
  cargarSupresiones,
  clavesAnadasSuprimidas,
  decisionAdmin,
} from "../../../lib/consolidacion/supresiones.ts";
import { sinError, type ClienteDb } from "../../../lib/db.ts";
import { igualesJson } from "../../../lib/json.ts";
import type { Log } from "../../../lib/log.ts";
import { claveTexto, slugify } from "../../../lib/texto.ts";
import type { Denominacion } from "./tipos.ts";

// Formas mínimas que necesita el guardado; las cumplen los normalizados de Rioja y de Navarra.
type ValorHecho = string | number | boolean | null;

export interface BodegaCompleta {
  idExterno: string;
  url: string;
  campos: {
    nombre: string; direccion: string | null; codigo_postal: string | null; municipio: string | null;
    provincia: string | null; comunidad: string | null; ubicacion: string | null; web: string | null;
    telefono: string | null; email: string | null; anio_fundacion: number | null;
  };
  hechos: Parameters<typeof hechosDe>[2];
  /** `slug_fuente`, si existe, es el respaldo del slug (Rioja); si no, el id externo. */
  datos: object & { slug_fuente?: string };
  /** Marcas registradas, si la fuente las da (para el emparejador). */
  marcas?: string[];
}

export interface VinoCompleto {
  idExterno: string;
  url: string;
  vino: { nombre: string; tipo: string | null; crianza: string | null };
  anada: { anio: number | null };
  variedades: { nombre: string; porcentaje: number | null }[];
  bodega_texto: string | null;
  hechos: { clave: Parameters<typeof hechosDe>[2][number]["clave"]; valor: ValorHecho; sujeto?: string; unidad?: string }[];
  datos: object & { tipo_texto?: string | null };
}

export interface ServicioCompleto {
  idExterno: string;
  url: string;
  titulo: string;
  tipo: Database["public"]["Enums"]["tipo_servicio"];
  campos: { precio_desde: number | null; duracion_minutos: number | null; idiomas: string[]; horario: string | null; url_reserva: string | null };
  datos: object;
}

/** Cómo se resolvió la bodega de un vino (enlace, nombre, hermanos…). */
export interface ResolucionBodega {
  idExterno: string | null;
  motivo: string;
  candidatos: string[];
}

export type Resultado = "nuevo" | "actualizado" | "sin_cambios" | "revision" | "descartado";

const CAMPOS_BODEGA = [
  "nombre", "direccion", "codigo_postal", "municipio", "provincia", "comunidad",
  "ubicacion", "web", "telefono", "email", "anio_fundacion",
] as const;

const CAMPOS_SERVICIO = ["precio_desde", "duracion_minutos", "idiomas", "horario", "url_reserva"] as const;

// Nombres de uva de la web que no coinciden con el nombre ni los sinónimos oficiales.
const ALIAS_VARIEDAD: Record<string, string> = {
  mazuelo: "mazuela",
  carinena: "mazuela",
  "tempranillo tinto": "tempranillo",
  garnacha: "garnacha-tinta",
  viura: "macabeo",
};

const jsonLimpio = (v: unknown) => JSON.parse(JSON.stringify(v));

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

/** Slugs candidatos de una bodega, del más corto al más específico. */
export function candidatosSlug(nombre: string, municipio: string | null, respaldo: string): string[] {
  const base = slugify(nombre) || slugify(respaldo);
  const lista = [base];
  if (municipio) lista.push(`${base}-${slugify(municipio)}`);
  for (let i = 2; i <= 50; i++) lista.push(`${base}-${i}`);
  return [...new Set(lista)];
}

function sinEmparejamiento(datos: unknown): unknown {
  if (!datos || typeof datos !== "object") return datos;
  return Object.fromEntries(Object.entries(datos).filter(([k]) => k !== "emparejamiento"));
}

export type Emparejamiento = ResultadoBodega | ResultadoVino | { motivo: string; candidatos?: unknown[]; confianza?: number };

export class GuardadoConsejoCompleto {
  private db: ClienteDb;
  private fuenteId: string;
  private log: Log;
  private consolidador: Consolidador;
  private resumidor: Resumidor;
  private tipoFuente: TipoFuente = "consejo_regulador";
  private denominacion: Denominacion;
  private denominacionId = "";
  private observadoEn = new Date().toISOString();

  // Bodegas
  private bodegaIds = new Set<string>();
  private bodegaSlug = new Map<string, string>(); // id → slug
  private slugs = new Set<string>();
  private catalogo: BodegaCatalogo[] = [];
  private emparejador = new EmparejadorBodegas([]);
  private supresionesBodega: ReturnType<typeof aSupresionBodega>[] = [];
  private vinculadas = new Map<string, string>(); // bodega → id externo del registro de esta fuente

  // Vinos
  private variedades = new Map<string, string>(); // clave nombre/sinónimo → id
  private slugsVariedad = new Map<string, string>();
  private slugsVino = new Set<string>();
  private bodegaDeVino = new Map<string, string>();
  private vinos = new EmparejadorVinos([]);
  private anadasSuprimidas = new Map<string, string>();
  private sinVariedad = new Set<string>();

  // Servicios
  private serviciosSuprimidos = new Map<string, string>(); // bodega|tipo|clave → supresión

  constructor(
    db: ClienteDb,
    fuenteId: string,
    log: Log,
    denominacion: Denominacion,
    generador: GeneradorResumen = new PlantillasEsEn(),
  ) {
    this.db = db;
    this.denominacion = denominacion;
    this.fuenteId = fuenteId;
    this.log = log;
    this.consolidador = new Consolidador(db);
    this.resumidor = new Resumidor(db, generador);
  }

  /** Carga una vez por ejecución la D.O., bodegas, vinos, variedades, vínculos y supresiones. */
  async preparar(): Promise<void> {
    const den = sinError(
      await this.db.from("denominaciones").select("id").eq("slug", this.denominacion.slug).maybeSingle(),
      "leer denominación",
    );
    if (!den) throw new Error(`No existe la denominación '${this.denominacion.slug}' (¿semillas?)`);
    this.denominacionId = den.id;

    const fuente = sinError(await this.db.from("fuentes").select("tipo").eq("id", this.fuenteId).single(), "leer fuente");
    this.tipoFuente = fuente.tipo;

    const bodegas = await paginar("bodegas", (d, h) =>
      this.db.from("bodegas").select(`slug, ${COLUMNAS_EMPAREJAR_BODEGA}`).order("id").range(d, h),
    );
    for (const b of bodegas) {
      this.bodegaIds.add(b.id);
      this.bodegaSlug.set(b.id, b.slug);
      this.slugs.add(b.slug);
      this.catalogo.push(bodegaCatalogoDeFila(b));
    }
    const registros = await paginar("registros", (d, h) =>
      this.db
        .from("registros_fuente")
        .select("id_externo, entidad_id")
        .eq("fuente_id", this.fuenteId)
        .eq("entidad_tipo", "bodega")
        .order("id")
        .range(d, h),
    );
    for (const r of registros) if (r.entidad_id) this.vinculadas.set(r.entidad_id, r.id_externo);
    this.supresionesBodega = (await cargarSupresiones(this.db, "bodega")).map(aSupresionBodega);
    this.reconstruirEmparejador();

    for (const v of sinError(await this.db.from("variedades_uva").select("id, nombre, slug, sinonimos"), "leer variedades")) {
      this.slugsVariedad.set(v.slug, v.id);
      for (const n of [v.nombre, ...v.sinonimos]) this.variedades.set(claveTexto(n), v.id);
    }

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

    for (const s of await cargarSupresiones(this.db, "servicio_bodega")) {
      if (s.motivo !== "borrado") continue;
      const { bodega_id: b, tipo, titulo } = s.claves as Record<string, unknown>;
      if (typeof b === "string" && typeof tipo === "string" && typeof titulo === "string") {
        this.serviciosSuprimidos.set(`${b}|${tipo}|${claveTexto(titulo)}`, s.id);
      }
    }
  }

  private reconstruirEmparejador() {
    this.emparejador = new EmparejadorBodegas(this.catalogo, this.supresionesBodega.filter((s) => s !== null));
  }

  /** Bodegas vinculadas a otro registro de esta fuente: no pueden ser esta. */
  private excluir(idExterno: string): Set<string> {
    return new Set([...this.vinculadas].filter(([, ext]) => ext !== idExterno).map(([id]) => id));
  }

  private aporte(registroId: string, url: string): Aporte {
    return { registroId, fuenteId: this.fuenteId, tipoFuente: this.tipoFuente, url, observadoEn: this.observadoEn };
  }

  private hechos(url: string, lista: Parameters<typeof hechosDe>[2]): Hecho[] {
    return hechosDe(
      { fuente_id: this.fuenteId, registro_id: null, url, origen: "consejo_regulador" },
      this.observadoEn,
      lista,
    );
  }

  private async leerRegistro(idExterno: string) {
    return sinError(
      await this.db
        .from("registros_fuente")
        .select("id, entidad_tipo, entidad_id, datos, supresion_id, decision, decision_tipo, decision_id")
        .eq("fuente_id", this.fuenteId)
        .eq("id_externo", idExterno)
        .maybeSingle(),
      "leer registro",
    );
  }

  private async upsertRegistro(fila: {
    idExterno: string;
    url: string;
    datos: unknown;
    hechos: Hecho[];
    entidadTipo: "bodega" | "anada" | "servicio_bodega" | null;
    entidadId: string | null;
    estado: "emparejado" | "revision" | "descartado";
    emparejamiento?: Emparejamiento | null;
    supresionId?: string | null;
  }): Promise<string> {
    const datos = fila.emparejamiento ? { ...(fila.datos as object), emparejamiento: fila.emparejamiento } : fila.datos;
    const confianza = fila.entidadId ? 1 : (fila.emparejamiento as { confianza?: number } | null | undefined)?.confianza ?? null;
    const r = sinError(
      await this.db
        .from("registros_fuente")
        .upsert(
          {
            fuente_id: this.fuenteId,
            id_externo: fila.idExterno,
            url: fila.url,
            datos: jsonLimpio(datos),
            hechos: jsonLimpio(fila.estado === "descartado" ? [] : fila.hechos),
            entidad_tipo: fila.entidadId ? fila.entidadTipo : null,
            entidad_id: fila.entidadId,
            confianza_emparejamiento: confianza,
            estado_emparejamiento: fila.estado,
            visto_por_ultima_vez: this.observadoEn,
            ...(fila.supresionId ? { supresion_id: fila.supresionId } : {}),
          },
          { onConflict: "fuente_id,id_externo" },
        )
        .select("id")
        .single(),
      "guardar registro",
    );
    return r.id;
  }

  // -------------------------------------------------------------------------
  // Bodegas
  // -------------------------------------------------------------------------

  /** id de bodega ya vinculada a este registro (para resolver vinos y experiencias aunque la ficha no se procese). */
  bodegaDeRegistro(idExterno: string): string | null {
    for (const [id, ext] of this.vinculadas) if (ext === idExterno) return id;
    return null;
  }

  async guardarBodega(n: BodegaCompleta): Promise<{ resultado: Resultado; bodegaId: string | null }> {
    const reg = await this.leerRegistro(n.idExterno);
    const decision = decisionAdmin(reg);
    const hechos = this.hechos(n.url, n.hechos);
    const base = { idExterno: n.idExterno, url: n.url, datos: n.datos, hechos, entidadTipo: "bodega" as const };

    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar") {
      await this.upsertRegistro({ ...base, entidadId: null, estado: "descartado" });
      return { resultado: "descartado", bodegaId: null };
    }

    let bodegaId =
      reg?.entidad_tipo === "bodega" && reg.entidad_id && this.bodegaIds.has(reg.entidad_id) ? reg.entidad_id : null;
    const primeraVez = bodegaId === null;
    let nuevo = false;

    if (!bodegaId) {
      if (decision?.tipo === "asociar" && decision.entidad === "bodega" && this.bodegaIds.has(decision.id)) {
        bodegaId = decision.id;
      } else if (decision?.tipo === "crear") {
        bodegaId = await this.crearBodega(n);
        nuevo = true;
      } else {
        const emp = this.emparejador.emparejar(
          {
            nombre: n.campos.nombre, municipio: n.campos.municipio, web: n.campos.web, provincia: n.campos.provincia,
            codigoPostal: n.campos.codigo_postal, telefono: n.campos.telefono, ubicacion: coordenadas(n.campos.ubicacion),
            direccion: n.campos.direccion, ...(n.marcas?.length ? { marcas: n.marcas } : {}),
          },
          { excluir: this.excluir(n.idExterno) },
        );
        if (emp.estado === "suprimida") {
          await this.upsertRegistro({ ...base, entidadId: null, estado: "descartado", emparejamiento: emp, supresionId: emp.supresionId });
          this.log.info(`Descartada (la borró el admin): ${n.campos.nombre}`);
          return { resultado: "descartado", bodegaId: null };
        }
        if (emp.estado === "revision") {
          await this.upsertRegistro({ ...base, entidadId: null, estado: "revision", emparejamiento: emp });
          this.log.info(`Revisión (${emp.confianza}): ${n.campos.nombre} ~ ${emp.candidatos[0]?.nombre ?? "?"}`);
          return { resultado: "revision", bodegaId: null };
        }
        if (emp.estado === "vinculada") {
          bodegaId = emp.bodegaId!;
          this.log.info(`Vinculada a bodega existente (${emp.candidatos[0]?.motivo}): ${n.campos.nombre}`);
        } else {
          bodegaId = await this.crearBodega(n);
          nuevo = true;
        }
      }
    }

    const registroId = await this.upsertRegistro({ ...base, entidadId: bodegaId, estado: "emparejado" });
    this.vinculadas.set(bodegaId, n.idExterno);
    const { escritos } = await this.consolidador.consolidar(
      "bodega",
      bodegaId,
      Object.fromEntries(CAMPOS_BODEGA.map((k) => [k, n.campos[k]])),
      this.aporte(registroId, n.url),
    );
    // Solo al vincular por primera vez: si después el admin le quita la D.O., no se vuelve a poner.
    if (primeraVez) await this.asegurarDenominacion(bodegaId);
    await this.resumidor.resumir("bodega", bodegaId, "descripcion");

    if (nuevo) return { resultado: "nuevo", bodegaId };
    const cambiado = escritos.length > 0 || primeraVez || !igualesJson(sinEmparejamiento(reg?.datos), n.datos);
    return { resultado: cambiado ? "actualizado" : "sin_cambios", bodegaId };
  }

  /** Bodega nueva solo con nombre y slug: el resto lo escribe la consolidación (con procedencia). */
  private async crearBodega(n: BodegaCompleta): Promise<string> {
    const { id, slug } = await insertarConSlug(
      this.db,
      "bodegas",
      { nombre: n.campos.nombre, fuente_id: this.fuenteId },
      candidatosSlug(n.campos.nombre, n.campos.municipio, n.datos.slug_fuente ?? n.idExterno),
      this.slugs,
    );
    this.bodegaIds.add(id);
    this.bodegaSlug.set(id, slug);
    this.catalogo.push({
      id, nombre: n.campos.nombre, municipio: n.campos.municipio, web: n.campos.web, provincia: n.campos.provincia,
      codigoPostal: n.campos.codigo_postal, telefono: n.campos.telefono, ubicacion: coordenadas(n.campos.ubicacion),
      ...(n.marcas?.length ? { marcas: n.marcas } : {}),
    });
    this.reconstruirEmparejador();
    return id;
  }

  private async asegurarDenominacion(bodegaId: string) {
    const actuales = sinError(
      await this.db.from("bodega_denominaciones").select("denominacion_id, principal").eq("bodega_id", bodegaId),
      "leer D.O. de la bodega",
    );
    if (actuales.some((d) => d.denominacion_id === this.denominacionId)) return;
    sinError(
      await this.db.from("bodega_denominaciones").upsert(
        { bodega_id: bodegaId, denominacion_id: this.denominacionId, principal: !actuales.some((d) => d.principal) },
        { onConflict: "bodega_id,denominacion_id", ignoreDuplicates: true },
      ),
      "guardar D.O. de la bodega",
    );
  }

  // -------------------------------------------------------------------------
  // Vinos (el registro apunta a la añada, como en las tiendas, para el resumen de elaboración)
  // -------------------------------------------------------------------------

  idVariedad(nombre: string): string | null {
    const c = claveTexto(nombre);
    const alias = ALIAS_VARIEDAD[c];
    return this.variedades.get(c) ?? (alias ? this.slugsVariedad.get(alias) ?? null : null);
  }

  private hechosVino(n: VinoCompleto): Hecho[] {
    return this.hechos(
      n.url,
      n.hechos.map((h) => ({ clave: h.clave, valor: h.valor, ...(h.sujeto ? { sujeto: h.sujeto } : {}), ...(h.unidad ? { unidad: h.unidad } : {}) })),
    );
  }

  async guardarVino(n: VinoCompleto, resolucion: ResolucionBodega, bodegaId: string | null): Promise<Resultado> {
    const reg = await this.leerRegistro(n.idExterno);
    const decision = decisionAdmin(reg);
    const hechos = this.hechosVino(n);
    const datos = { ...n.datos, anada: n.anada, variedades: n.variedades, resolucion_bodega: resolucion };
    const base = { idExterno: n.idExterno, url: n.url, datos, hechos, entidadTipo: "anada" as const };

    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar") {
      await this.upsertRegistro({ ...base, entidadId: null, estado: "descartado" });
      return "descartado";
    }

    // Ficha ya vinculada por una ejecución anterior o por el admin: no se vuelve a emparejar.
    let anadaId: string | null = null;
    let vinoId: string | null = null;
    if (reg?.entidad_tipo === "anada" && reg.entidad_id) {
      const a = sinError(await this.db.from("anadas").select("id, vino_id").eq("id", reg.entidad_id).maybeSingle(), "leer añada");
      if (a) {
        anadaId = a.id;
        vinoId = a.vino_id;
      }
    }
    const previo = anadaId !== null;
    let forzarNuevo = false;
    if (!previo && decision?.tipo === "asociar" && decision.entidad === "vino" && this.bodegaDeVino.has(decision.id)) {
      vinoId = decision.id;
      bodegaId = this.bodegaDeVino.get(decision.id)!;
    } else if (!previo && decision?.tipo === "crear") {
      forzarNuevo = true;
    }

    if (!previo && !bodegaId) {
      await this.upsertRegistro({
        ...base, entidadId: null, estado: "revision",
        emparejamiento: { motivo: `bodega_${resolucion.motivo}`, candidatos: resolucion.candidatos, confianza: 0 },
      });
      this.log.info(`Revisión (bodega «${n.bodega_texto ?? "?"}» ${resolucion.motivo}): ${n.vino.nombre}`);
      return "revision";
    }
    if (!n.vino.tipo) {
      await this.upsertRegistro({ ...base, entidadId: null, estado: "revision", emparejamiento: { motivo: "tipo_desconocido", confianza: 0 } });
      this.log.warn(`Revisión (tipo «${n.datos.tipo_texto ?? "?"}»): ${n.vino.nombre}`);
      return "revision";
    }

    let nuevo = false;
    let vinoCreado = false;
    if (!vinoId) {
      const r = this.vinos.emparejar(
        { bodegaId: bodegaId!, nombre: n.vino.nombre, tipo: n.vino.tipo as never, crianza: n.vino.crianza as never, ean: null },
        { sinParecidos: forzarNuevo },
      );
      if (r.estado === "suprimido") {
        await this.upsertRegistro({ ...base, entidadId: null, estado: "descartado", emparejamiento: r, supresionId: r.supresionId });
        return "descartado";
      }
      if (r.estado === "revision") {
        await this.upsertRegistro({ ...base, entidadId: null, estado: "revision", emparejamiento: r });
        this.log.info(`Revisión (vino parecido): ${n.vino.nombre} ~ ${r.candidatos[0]?.nombre ?? "?"}`);
        return "revision";
      }
      vinoCreado = !r.vinoId;
      vinoId = r.vinoId ?? (await this.crearVino(n, bodegaId!));
      nuevo = vinoCreado;
    }

    if (!anadaId) {
      const suprimida = this.anadasSuprimidas.get(`${vinoId}|${n.anada.anio ?? "null"}`);
      if (suprimida) {
        await this.upsertRegistro({ ...base, entidadId: null, estado: "descartado", supresionId: suprimida });
        return "descartado";
      }
      const fila = sinError(
        await this.db.from("anadas").upsert({ vino_id: vinoId, anio: n.anada.anio }, { onConflict: "vino_id,anio" }).select("id").single(),
        "guardar añada",
      );
      anadaId = fila.id;
      nuevo = true;
    }

    const registroId = await this.upsertRegistro({ ...base, entidadId: anadaId, estado: "emparejado" });
    const campos: Record<string, unknown> = { tipo: n.vino.tipo, crianza: n.vino.crianza };
    if (vinoCreado) {
      campos.nombre = n.vino.nombre;
      campos.denominacion_id = this.denominacionId;
    }
    const { escritos } = await this.consolidador.consolidar("vino", vinoId, campos, this.aporte(registroId, n.url));
    let cambios = escritos.length > 0;

    const antes = nuevo ? null : variedadesAnteriores(reg?.datos);
    if (await this.guardarVariedades(anadaId, n.variedades, antes)) cambios = true;
    await this.resumidor.resumir("anada", anadaId, "elaboracion");

    const datosCambiados = previo ? !igualesJson(sinEmparejamiento(reg?.datos), sinEmparejamiento(datos)) : false;
    return nuevo ? "nuevo" : cambios || datosCambiados ? "actualizado" : "sin_cambios";
  }

  private async crearVino(n: VinoCompleto, bodegaId: string): Promise<string> {
    const base = slugify(n.vino.nombre) || "vino";
    const bodega = this.bodegaSlug.get(bodegaId) ?? "bodega";
    const candidatos = [base, `${bodega}-${base}`, ...Array.from({ length: 49 }, (_, i) => `${bodega}-${base}-${i + 2}`)];
    const { id } = await insertarConSlug(
      this.db,
      "vinos",
      {
        bodega_id: bodegaId,
        nombre: n.vino.nombre,
        tipo: n.vino.tipo as Database["public"]["Enums"]["tipo_vino"],
        crianza: n.vino.crianza as Database["public"]["Enums"]["crianza_vino"] | null,
        denominacion_id: this.denominacionId,
        fuente_id: this.fuenteId,
      },
      candidatos,
      this.slugsVino,
    );
    this.vinos.anadir({ id, bodegaId, nombre: n.vino.nombre, tipo: n.vino.tipo as never, crianza: n.vino.crianza as never });
    this.bodegaDeVino.set(id, bodegaId);
    return id;
  }

  /** Solo se escribe si la composición cambió en la fuente (o la añada no tiene uvas). */
  private async guardarVariedades(
    anadaId: string,
    variedades: { nombre: string; porcentaje: number | null }[],
    antes: unknown[] | null | undefined,
  ): Promise<boolean> {
    if (antes && igualesJson(antes, variedades)) return false;
    const filas = new Map<string, number | null>();
    for (const v of variedades) {
      const id = this.idVariedad(v.nombre);
      if (!id) {
        if (!this.sinVariedad.has(v.nombre)) this.log.warn(`Variedad desconocida «${v.nombre}» (se omite)`);
        this.sinVariedad.add(v.nombre);
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

  // -------------------------------------------------------------------------
  // Servicios de enoturismo
  // -------------------------------------------------------------------------

  async guardarServicio(n: ServicioCompleto, bodegaId: string | null, motivo: string): Promise<Resultado> {
    const reg = await this.leerRegistro(n.idExterno);
    const decision = decisionAdmin(reg);
    const base = { idExterno: n.idExterno, url: n.url, datos: n.datos, hechos: [] as Hecho[], entidadTipo: "servicio_bodega" as const };

    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar") {
      await this.upsertRegistro({ ...base, entidadId: null, estado: "descartado" });
      return "descartado";
    }

    let servicioId: string | null = null;
    if (reg?.entidad_tipo === "servicio_bodega" && reg.entidad_id) {
      const s = sinError(await this.db.from("servicios_bodega").select("id").eq("id", reg.entidad_id).maybeSingle(), "leer servicio");
      servicioId = s?.id ?? null;
    }
    const previo = servicioId !== null;
    if (!previo && !bodegaId) {
      await this.upsertRegistro({ ...base, entidadId: null, estado: "revision", emparejamiento: { motivo: `bodega_${motivo}`, confianza: 0 } });
      this.log.info(`Revisión (bodega ${motivo}): ${n.titulo}`);
      return "revision";
    }

    let nuevo = false;
    if (!servicioId) {
      const clave = claveTexto(n.titulo);
      const suprimido = this.serviciosSuprimidos.get(`${bodegaId}|${n.tipo}|${clave}`);
      if (suprimido) {
        await this.upsertRegistro({ ...base, entidadId: null, estado: "descartado", supresionId: suprimido });
        return "descartado";
      }
      // Otra ejecución u otra fuente pudo crear ya el mismo servicio (bodega + tipo + título).
      const existentes = sinError(
        await this.db.from("servicios_bodega").select("id, titulo").eq("bodega_id", bodegaId!).eq("tipo", n.tipo),
        "leer servicios",
      );
      servicioId = existentes.find((s) => claveTexto(s.titulo) === clave)?.id ?? null;
      if (!servicioId) {
        const fila = sinError(
          await this.db
            .from("servicios_bodega")
            .insert({ bodega_id: bodegaId!, tipo: n.tipo, titulo: n.titulo, fuente_id: this.fuenteId } as never)
            .select("id")
            .single(),
          "crear servicio",
        );
        servicioId = (fila as { id: string }).id;
        nuevo = true;
      }
    }

    const registroId = await this.upsertRegistro({ ...base, entidadId: servicioId, estado: "emparejado" });
    const { escritos } = await this.consolidador.consolidar(
      "servicio_bodega",
      servicioId,
      Object.fromEntries(CAMPOS_SERVICIO.map((k) => [k, n.campos[k]])),
      this.aporte(registroId, n.url),
    );
    if (nuevo) return "nuevo";
    const cambiado = escritos.length > 0 || !previo || !igualesJson(sinEmparejamiento(reg?.datos), n.datos);
    return cambiado ? "actualizado" : "sin_cambios";
  }
}

/** Composición que esta fuente escribió la vez anterior (`datos.variedades`); undefined en registros sin ese dato. */
export function variedadesAnteriores(datos: unknown): unknown[] | undefined {
  const v = (datos as { variedades?: unknown } | null)?.variedades;
  return Array.isArray(v) ? v : undefined;
}
