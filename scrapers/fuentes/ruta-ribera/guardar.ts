// Ruta del Vino Ribera del Duero: fichas de bodega (contacto, historia, horario de visitas)
// y servicios de enoturismo, sobre el núcleo de consolidación. Nunca crea bodegas: lo que no
// empareja con seguridad va a la cola de revisión (o se descarta si no hay candidata).
// Con `db = null` (dry-run) empareja y normaliza igual, pero no escribe.
import {
  bodegaCatalogoDeFila,
  COLUMNAS_EMPAREJAR_BODEGA,
  EmparejadorBodegas,
  type BodegaCatalogo,
  type ResultadoBodega,
} from "../../emparejamiento/entidades.ts";
import { cargarMarcasCR } from "../../lib/marcas.ts";
import { Consolidador, type Aporte } from "../../lib/consolidacion/consolidar.ts";
import { origenDeFuente, type TipoFuente } from "../../lib/consolidacion/decidir.ts";
import { hechosDe, type Hecho } from "../../lib/consolidacion/hechos.ts";
import { PlantillasEsEn } from "../../lib/consolidacion/plantillas.ts";
import { Resumidor } from "../../lib/consolidacion/resumen.ts";
import { aSupresionBodega, cargarSupresiones, decisionAdmin, type FilaSupresion } from "../../lib/consolidacion/supresiones.ts";
import { sinError, type ClienteDb } from "../../lib/db.ts";
import { igualesJson } from "../../lib/json.ts";
import type { Log } from "../../lib/log.ts";
import { claveTexto } from "../../lib/texto.ts";
import {
  asignarBodega, type FichaNormalizada, type PrefijoBodega, type ServicioNormalizado,
} from "./normalizar.ts";

export type Resultado = "nuevo" | "actualizado" | "sin_cambios" | "revision" | "descartado";

export interface SalidaFicha {
  tipo: "ficha";
  resultado: Resultado;
  motivo?: string;
  ficha: FichaNormalizada;
  emparejamiento: ResultadoBodega | null;
  bodegaId: string | null;
}
export interface SalidaServicio {
  tipo: "servicio";
  resultado: Resultado;
  motivo?: string;
  servicio: ServicioNormalizado;
  bodegaId: string | null;
  titulo: string | null;
  candidatas?: string[];
}

const CAMPOS_FICHA = [
  "direccion", "codigo_postal", "municipio", "provincia", "comunidad", "web", "telefono", "email", "anio_fundacion",
] as const;

export function hechosFicha(n: FichaNormalizada, fuenteId: string, origen: Hecho["fuente"]["origen"], observadoEn: string): Hecho[] {
  return hechosDe({ fuente_id: fuenteId, registro_id: null, url: n.url, origen }, observadoEn, [
    { clave: "bodega.enoturismo", valor: true },
    { clave: "bodega.fundacion_anio", valor: n.campos.anio_fundacion ?? undefined },
    { clave: "bodega.horario_visitas", valor: n.horario_visitas ?? undefined },
  ]);
}

export function camposServicio(s: ServicioNormalizado, titulo: string) {
  return {
    titulo,
    precio_desde: s.precio_desde,
    duracion_minutos: s.duracion_minutos,
    idiomas: s.idiomas.length > 0 ? s.idiomas : null,
    horario: s.horario,
    url_reserva: s.url_reserva,
    activo: true,
  };
}

const claveServicio = (bodegaId: string, tipo: string, titulo: string) => `${bodegaId}|${tipo}|${claveTexto(titulo)}`;

export class GuardadoRuta {
  private db: ClienteDb | null;
  private fuenteId: string;
  private log: Log;
  private consolidador: Consolidador | null;
  private resumidor: Resumidor | null;
  private tipoFuente: TipoFuente = "guia";
  private bodegaIds = new Set<string>();
  private catalogo: BodegaCatalogo[] = [];
  private emparejador = new EmparejadorBodegas([]);
  // bodega → id externo de la ficha de esta fuente que la tiene.
  private vinculadas = new Map<string, string>();
  // ficha → nombre del directorio y bodega, para asignar productos por prefijo.
  private prefijos: PrefijoBodega[] = [];
  private servicios = new Map<string, string>(); // clave bodega|tipo|titulo → id
  private serviciosPorId = new Map<string, string>(); // id → bodega_id
  private suprimidosPorClave = new Map<string, string>();

  constructor(db: ClienteDb | null, fuenteId: string | null, log: Log) {
    this.db = db;
    this.fuenteId = fuenteId ?? "dry-run";
    this.log = log;
    this.consolidador = db ? new Consolidador(db) : null;
    this.resumidor = db ? new Resumidor(db, new PlantillasEsEn()) : null;
  }

  /** Carga una vez por ejecución las bodegas (de la BD o de un dry-run de Ribera), los vínculos y las supresiones. */
  async preparar(catalogoDryRun: BodegaCatalogo[] = []): Promise<void> {
    let supresiones: FilaSupresion[] = [];
    if (this.db) {
      const fuente = sinError(await this.db.from("fuentes").select("tipo").eq("id", this.fuenteId).single(), "leer fuente");
      this.tipoFuente = fuente.tipo;
      for (let desde = 0; ; desde += 1000) {
        const filas = sinError(
          await this.db.from("bodegas").select(COLUMNAS_EMPAREJAR_BODEGA).order("id").range(desde, desde + 999),
          "leer bodegas",
        );
        for (const b of filas) {
          this.catalogo.push(bodegaCatalogoDeFila(b));
        }
        if (filas.length < 1000) break;
      }
      for (let desde = 0; ; desde += 1000) {
        const filas = sinError(
          await this.db.from("registros_fuente").select("id_externo, entidad_id").eq("fuente_id", this.fuenteId)
            .eq("entidad_tipo", "bodega").order("id").range(desde, desde + 999),
          "leer registros",
        );
        for (const r of filas) if (r.entidad_id) this.vinculadas.set(r.entidad_id, r.id_externo);
        if (filas.length < 1000) break;
      }
      for (let desde = 0; ; desde += 1000) {
        const filas = sinError(
          await this.db.from("servicios_bodega").select("id, bodega_id, tipo, titulo").order("id").range(desde, desde + 999),
          "leer servicios",
        );
        for (const s of filas) {
          this.servicios.set(claveServicio(s.bodega_id, s.tipo, s.titulo), s.id);
          this.serviciosPorId.set(s.id, s.bodega_id);
        }
        if (filas.length < 1000) break;
      }
      supresiones = await cargarSupresiones(this.db, "servicio_bodega");
      for (const f of supresiones) {
        const c = f.claves;
        if (f.motivo === "borrado" && typeof c.bodega_id === "string" && typeof c.tipo === "string" && typeof c.titulo === "string") {
          this.suprimidosPorClave.set(claveServicio(c.bodega_id, c.tipo, c.titulo), f.id);
        }
      }
    } else {
      this.catalogo = catalogoDryRun;
    }
    if (this.db) {
      // Razón social ≠ marca: las marcas del C.R. llevan a la bodega («Bodegas Durón» → Grupo Solar de Samaniego).
      const marcas = await cargarMarcasCR(this.db);
      this.catalogo = this.catalogo.map((b) => ({ ...b, marcas: marcas.get(b.id) ?? b.marcas ?? [] }));
    }
    for (const b of this.catalogo) this.bodegaIds.add(b.id);
    this.prefijos = this.catalogo.map((b) => ({ nombre: b.nombre, bodegaId: b.id }));
    const supresionesBodega = this.db
      ? (await cargarSupresiones(this.db, "bodega")).map(aSupresionBodega).filter((s) => s !== null)
      : [];
    this.emparejador = new EmparejadorBodegas(this.catalogo, supresionesBodega);
  }

  get totalBodegas(): number {
    return this.catalogo.length;
  }

  private excluir(idExterno: string): Set<string> {
    return new Set([...this.vinculadas].filter(([, ext]) => ext !== idExterno).map(([id]) => id));
  }

  // ------------------------------------------------------------ fichas

  async guardarFicha(n: FichaNormalizada): Promise<SalidaFicha> {
    const base = { tipo: "ficha" as const, ficha: n };
    const reg = this.db
      ? sinError(
          await this.db.from("registros_fuente")
            .select("id, entidad_tipo, entidad_id, datos, supresion_id, decision, decision_tipo, decision_id")
            .eq("fuente_id", this.fuenteId).eq("id_externo", n.idExterno).maybeSingle(),
          "leer registro",
        )
      : null;
    const ahora = new Date().toISOString();
    const decision = decisionAdmin(reg);
    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar") {
      await this.guardarRegistro(n.idExterno, n.url, n.datos, [], "descartado", null, null, null, ahora);
      return { ...base, resultado: "descartado", motivo: "decision_admin", emparejamiento: null, bodegaId: null };
    }

    let bodegaId = reg?.entidad_tipo === "bodega" && reg.entidad_id && this.bodegaIds.has(reg.entidad_id) ? reg.entidad_id : null;
    const primeraVez = bodegaId === null;
    let emp: ResultadoBodega | null = null;
    if (!bodegaId) {
      if (decision?.tipo === "asociar" && decision.entidad === "bodega" && this.bodegaIds.has(decision.id)) {
        bodegaId = decision.id;
      } else {
        emp = this.emparejador.emparejar(
          {
            nombre: n.nombre, municipio: n.campos.municipio, web: n.campos.web, provincia: n.campos.provincia,
            codigoPostal: n.campos.codigo_postal, telefono: n.campos.telefono, direccion: n.campos.direccion,
          },
          { excluir: this.excluir(n.idExterno) },
        );
        if (emp.estado === "vinculada") bodegaId = emp.bodegaId;
      }
    }
    if (!bodegaId) {
      // Nunca se crea una bodega desde esta fuente.
      // Una ficha dudosa pero con un único candidato casi seguro (mismo nombre, solo difiere la web)
      // sirve para asignar bodega a sus productos; la ficha sigue en la cola de revisión.
      const [mejor, segundo] = emp?.candidatos ?? [];
      if (emp?.estado === "revision" && mejor && mejor.puntuacion >= 0.85 && (segundo?.puntuacion ?? 0) <= mejor.puntuacion - 0.2) {
        this.prefijos.push({ nombre: n.nombre, bodegaId: mejor.id });
      }
      const estado = emp?.estado === "revision" || decision?.tipo === "crear" ? "revision" : "descartado";
      const motivo = estado === "revision" ? "emparejamiento_dudoso" : emp?.estado === "suprimida" ? "suprimida_por_admin" : "sin_bodega_en_catalogo";
      await this.guardarRegistro(
        n.idExterno, n.url, n.datos, [], estado, null, emp, emp?.estado === "suprimida" ? emp.supresionId : null, ahora,
      );
      this.log.info(`${estado === "revision" ? "Revisión" : "Sin bodega"} (${emp?.confianza ?? 0}): ${n.nombre} ~ ${emp?.candidatos[0]?.nombre ?? "—"}`);
      return { ...base, resultado: estado, motivo, emparejamiento: emp, bodegaId: null };
    }

    this.vinculadas.set(bodegaId, n.idExterno);
    this.prefijos.push({ nombre: n.nombre, bodegaId });
    const hechos = hechosFicha(n, this.fuenteId, origenDeFuente(this.tipoFuente), ahora);
    const registroId = await this.guardarRegistro(n.idExterno, n.url, n.datos, hechos, "emparejado", bodegaId, null, null, ahora);
    let escritos: string[] = [];
    if (this.db && registroId) {
      const aporte: Aporte = { registroId, fuenteId: this.fuenteId, tipoFuente: this.tipoFuente, url: n.url, observadoEn: ahora };
      escritos = (await this.consolidador!.consolidar("bodega", bodegaId, { ...n.campos }, aporte)).escritos;
      await this.resumidor!.resumir("bodega", bodegaId, "descripcion");
    }
    const igual = igualesJson(reg?.datos ?? null, JSON.parse(JSON.stringify(n.datos)));
    const resultado: Resultado = escritos.length > 0 || primeraVez || !igual ? "actualizado" : "sin_cambios";
    return { ...base, resultado, emparejamiento: emp, bodegaId };
  }

  // ---------------------------------------------------------- servicios

  async guardarServicio(s: ServicioNormalizado): Promise<SalidaServicio> {
    const base = { tipo: "servicio" as const, servicio: s };
    const reg = this.db
      ? sinError(
          await this.db.from("registros_fuente")
            .select("id, entidad_tipo, entidad_id, datos, supresion_id, decision, decision_tipo, decision_id")
            .eq("fuente_id", this.fuenteId).eq("id_externo", s.idExterno).maybeSingle(),
          "leer registro",
        )
      : null;
    const ahora = new Date().toISOString();
    const datos = { ...s, nombre_producto: s.nombre };
    const decision = decisionAdmin(reg);
    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar") {
      await this.guardarRegistro(s.idExterno, s.url, datos, [], "descartado", null, null, null, ahora, "servicio_bodega");
      return { ...base, resultado: "descartado", motivo: "decision_admin", bodegaId: null, titulo: null };
    }
    if (s.paquete) {
      await this.guardarRegistro(s.idExterno, s.url, datos, [], "descartado", null, null, null, ahora, "servicio_bodega");
      return { ...base, resultado: "descartado", motivo: "paquete_multibodega", bodegaId: null, titulo: null };
    }

    // Servicio ya vinculado por una ejecución anterior: se reutiliza (el tipo y la bodega no bailan).
    const servicioPrevio = reg?.entidad_tipo === "servicio_bodega" && reg.entidad_id && this.serviciosPorId.has(reg.entidad_id) ? reg.entidad_id : null;
    let bodegaId: string | null = servicioPrevio ? this.serviciosPorId.get(servicioPrevio)! : null;
    let titulo = s.nombre;
    let candidatas: string[] | undefined;
    if (!bodegaId) {
      if (decision?.tipo === "asociar" && decision.entidad === "bodega" && this.bodegaIds.has(decision.id)) {
        bodegaId = decision.id;
      } else {
        // Spa y bienestar solo son de bodega si el nombre lo dice («Bodega Finca Villacreces Picnic…»).
        const a = s.noBodega && !/\bbodegas?\b/i.test(s.nombre) ? ({ estado: "ninguna" } as const) : asignarBodega(s.nombre, this.prefijos);
        if (a.estado === "bodega") { bodegaId = a.bodegaId; titulo = a.titulo; }
        else if (a.estado === "ambigua") candidatas = a.bodegaIds;
      }
    }
    if (!bodegaId) {
      // Sin bodega segura: no hay servicio. Spa/bienestar sin bodega no es enoturismo de bodega.
      const descartar = s.noBodega && !candidatas;
      await this.guardarRegistro(
        s.idExterno, s.url, { ...datos, candidatas: candidatas ?? [] }, [], descartar ? "descartado" : "revision",
        null, null, null, ahora, "servicio_bodega",
      );
      return {
        ...base, resultado: descartar ? "descartado" : "revision", bodegaId: null, titulo: null, candidatas,
        motivo: descartar ? "no_es_de_bodega" : candidatas ? "bodega_ambigua" : "sin_bodega",
      };
    }

    const tituloFinal = servicioPrevio ? await this.tituloActual(servicioPrevio, titulo) : titulo;
    const clave = claveServicio(bodegaId, s.tipo, tituloFinal);
    const supresionId = this.suprimidosPorClave.get(clave);
    if (supresionId && !servicioPrevio) {
      await this.guardarRegistro(s.idExterno, s.url, datos, [], "descartado", null, null, supresionId, ahora, "servicio_bodega");
      return { ...base, resultado: "descartado", motivo: "suprimido_por_admin", bodegaId, titulo: tituloFinal };
    }

    let servicioId = servicioPrevio ?? this.servicios.get(clave) ?? null;
    const nuevo = servicioId === null;
    if (this.db) {
      if (!servicioId) servicioId = await this.crearServicio(bodegaId, s, tituloFinal, clave);
      const registroId = await this.guardarRegistro(
        s.idExterno, s.url, datos, [], "emparejado", bodegaId, null, null, ahora, "servicio_bodega", servicioId,
      );
      const aporte: Aporte = { registroId: registroId!, fuenteId: this.fuenteId, tipoFuente: this.tipoFuente, url: s.url, observadoEn: ahora };
      const { escritos } = await this.consolidador!.consolidar("servicio_bodega", servicioId, camposServicio(s, tituloFinal), aporte);
      const igual = igualesJson(reg?.datos ?? null, JSON.parse(JSON.stringify(datos)));
      const resultado: Resultado = nuevo ? "nuevo" : escritos.length > 0 || !igual ? "actualizado" : "sin_cambios";
      return { ...base, resultado, bodegaId, titulo: tituloFinal };
    }
    return { ...base, resultado: "nuevo", bodegaId, titulo: tituloFinal };
  }

  /** Si el admin cambió el título del servicio ya vinculado, no se vuelve a proponer el nuestro. */
  private async tituloActual(servicioId: string, propuesto: string): Promise<string> {
    const fila = sinError(await this.db!.from("servicios_bodega").select("titulo").eq("id", servicioId).maybeSingle(), "leer servicio");
    return fila?.titulo ?? propuesto;
  }

  private async crearServicio(bodegaId: string, s: ServicioNormalizado, titulo: string, clave: string): Promise<string> {
    const r = await this.db!.from("servicios_bodega")
      .insert({ bodega_id: bodegaId, tipo: s.tipo, titulo, fuente_id: this.fuenteId }).select("id").single();
    let id = r.data?.id ?? null;
    if (r.error) {
      // Otra ejecución (o el admin) lo creó entretanto: se busca por clave.
      const filas = sinError(
        await this.db!.from("servicios_bodega").select("id, titulo").eq("bodega_id", bodegaId).eq("tipo", s.tipo),
        "leer servicios",
      );
      id = filas.find((f) => claveTexto(f.titulo) === claveTexto(titulo))?.id ?? null;
      if (!id) throw new Error(`crear servicio: ${r.error.message}`);
    }
    this.servicios.set(clave, id!);
    this.serviciosPorId.set(id!, bodegaId);
    return id!;
  }

  /** Servicios cuyo producto ya no aparece en la Ruta: se desactivan (no se borran). */
  async desactivarAusentes(inicio: string): Promise<number> {
    if (!this.db) return 0;
    const ausentes = sinError(
      await this.db.from("registros_fuente").select("entidad_id").eq("fuente_id", this.fuenteId)
        .eq("entidad_tipo", "servicio_bodega").eq("estado_emparejamiento", "emparejado").lt("visto_por_ultima_vez", inicio),
      "leer registros ausentes",
    ).map((r) => r.entidad_id).filter((x): x is string => !!x);
    if (ausentes.length === 0) return 0;
    sinError(await this.db.from("servicios_bodega").update({ activo: false }).in("id", ausentes), "desactivar servicios");
    return ausentes.length;
  }

  // ------------------------------------------------------------ común

  private async guardarRegistro(
    idExterno: string, url: string, datos: unknown, hechos: Hecho[],
    estado: "emparejado" | "revision" | "descartado",
    bodegaId: string | null, emparejamiento: ResultadoBodega | null, supresionId: string | null, ahora: string,
    entidad: "bodega" | "servicio_bodega" = "bodega", entidadId: string | null = null,
  ): Promise<string | null> {
    if (!this.db) return null;
    const vinculo = entidad === "bodega" ? bodegaId : entidadId;
    const cuerpo = emparejamiento ? { ...(datos as object), emparejamiento } : datos;
    const fila = sinError(
      await this.db.from("registros_fuente").upsert(
        {
          fuente_id: this.fuenteId,
          id_externo: idExterno,
          url,
          datos: JSON.parse(JSON.stringify(cuerpo)),
          hechos: JSON.parse(JSON.stringify(hechos)),
          entidad_tipo: vinculo ? entidad : null,
          entidad_id: vinculo,
          confianza_emparejamiento: vinculo ? 1 : (emparejamiento?.confianza ?? null),
          estado_emparejamiento: estado,
          visto_por_ultima_vez: ahora,
          ...(supresionId ? { supresion_id: supresionId } : {}),
        },
        { onConflict: "fuente_id,id_externo" },
      ).select("id").single(),
      "guardar registro",
    );
    return fila.id;
  }
}
