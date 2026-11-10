// Consejos reguladores: bodegas, su D.O. y el registro de fuente, sobre el núcleo de
// consolidación (lib/consolidacion). Es el guardado de Ribera parametrizado por D.O.:
// registro → decisión del admin → EmparejadorBodegas → consolidación por campo → resumen.
import {
  bodegaCatalogoDeFila,
  COLUMNAS_EMPAREJAR_BODEGA,
  EmparejadorBodegas,
  type BodegaCatalogo,
  type ResultadoBodega,
} from "../../../emparejamiento/entidades.ts";
import { coordenadas } from "../../../emparejamiento/lugar.ts";
import { Consolidador, type Aporte } from "../../../lib/consolidacion/consolidar.ts";
import type { TipoFuente } from "../../../lib/consolidacion/decidir.ts";
import { hechosDe, type Hecho } from "../../../lib/consolidacion/hechos.ts";
import { PlantillasEsEn } from "../../../lib/consolidacion/plantillas.ts";
import { Resumidor, type GeneradorResumen } from "../../../lib/consolidacion/resumen.ts";
import { insertarConSlug } from "../../../lib/consolidacion/slug.ts";
import { aSupresionBodega, cargarSupresiones, decisionAdmin } from "../../../lib/consolidacion/supresiones.ts";
import { sinError, type ClienteDb } from "../../../lib/db.ts";
import { igualesJson } from "../../../lib/json.ts";
import type { Log } from "../../../lib/log.ts";
import { claveNombreBodega, slugify } from "../../../lib/texto.ts";
import { similitud } from "../../../lib/trigram.ts";
import type { BodegaNormalizada, CamposBodega } from "./normalizar.ts";
import type { Denominacion } from "./tipos.ts";

export type Resultado = "nuevo" | "actualizado" | "sin_cambios" | "revision" | "descartado";

/** Slugs candidatos, del más corto al más específico. */
export function candidatosSlug(campos: CamposBodega, respaldo: string): string[] {
  const base = slugify(campos.nombre) || slugify(respaldo);
  const lista = [base];
  if (campos.municipio) lista.push(`${base}-${slugify(campos.municipio)}`);
  for (let i = 2; i <= 50; i++) lista.push(`${base}-${i}`);
  return [...new Set(lista)];
}

/** Por debajo de esta similitud de nombre, un vínculo solo por dominio va a revisión. */
export const SIMILITUD_MINIMA_DOMINIO = 0.2;

/**
 * Los grupos reúnen varias bodegas bajo una web (sierracantabria.com: Teso la Monja y Viñedos de
 * Paganos; bodegasriojanas.com: Torreduero y Viore). Si el emparejador vincula solo por dominio y los
 * nombres no se parecen en nada, es más seguro mandarlo a revisión que fusionar dos bodegas.
 */
export function vinculoDudosoPorDominio(emp: ResultadoBodega, nombre: string): boolean {
  const c = emp.candidatos[0];
  if (emp.estado !== "vinculada" || !c || (c.motivo !== "dominio" && c.motivo !== "dominio_compartido")) return false;
  const a = claveNombreBodega(nombre);
  const b = claveNombreBodega(c.nombre);
  const palabras = (x: string) => new Set(x.split(" ").filter(Boolean));
  const [pa, pb] = [palabras(a), palabras(b)];
  const comparten = [...pa].some((p) => p.length >= 4 && pb.has(p));
  return !comparten && similitud(a, b) < SIMILITUD_MINIMA_DOMINIO;
}

/** Hechos atómicos de la ficha (materia prima del resumen propio). */
export function hechosConsejo(n: BodegaNormalizada, fuenteId: string, observadoEn: string): Hecho[] {
  return hechosDe({ fuente_id: fuenteId, registro_id: null, url: n.url, origen: "consejo_regulador" }, observadoEn, n.hechos);
}

export class GuardadoConsejo {
  private db: ClienteDb;
  private fuenteId: string;
  private log: Log;
  private denominacion: Denominacion;
  private consolidador: Consolidador;
  private resumidor: Resumidor;
  private tipoFuente: TipoFuente = "consejo_regulador";
  private denominacionId = "";
  private bodegaIds = new Set<string>();
  private slugs = new Set<string>();
  private catalogo: BodegaCatalogo[] = [];
  private emparejador = new EmparejadorBodegas([]);
  // bodega → id externo del registro de esta fuente que la tiene.
  private vinculadas = new Map<string, string>();

  constructor(
    db: ClienteDb,
    fuenteId: string,
    log: Log,
    denominacion: Denominacion,
    generador: GeneradorResumen = new PlantillasEsEn(),
  ) {
    this.db = db;
    this.fuenteId = fuenteId;
    this.log = log;
    this.denominacion = denominacion;
    this.consolidador = new Consolidador(db);
    this.resumidor = new Resumidor(db, generador);
  }

  /** Carga una vez por ejecución la D.O., las bodegas, los vínculos de esta fuente y las supresiones. */
  async preparar(): Promise<void> {
    const denominacion = sinError(
      await this.db.from("denominaciones").select("id").eq("slug", this.denominacion.slug).maybeSingle(),
      "leer denominación",
    );
    if (!denominacion) throw new Error(`No existe la denominación '${this.denominacion.slug}' (¿semillas?)`);
    this.denominacionId = denominacion.id;

    const fuente = sinError(await this.db.from("fuentes").select("tipo").eq("id", this.fuenteId).single(), "leer fuente");
    this.tipoFuente = fuente.tipo;

    for (let desde = 0; ; desde += 1000) {
      const filas = sinError(
        await this.db
          .from("bodegas")
          .select(`slug, ${COLUMNAS_EMPAREJAR_BODEGA}`)
          .order("id")
          .range(desde, desde + 999),
        "leer bodegas",
      );
      for (const b of filas) {
        this.bodegaIds.add(b.id);
        this.slugs.add(b.slug);
        this.catalogo.push(bodegaCatalogoDeFila(b));
      }
      if (filas.length < 1000) break;
    }

    for (let desde = 0; ; desde += 1000) {
      const filas = sinError(
        await this.db
          .from("registros_fuente")
          .select("id_externo, entidad_id")
          .eq("fuente_id", this.fuenteId)
          .eq("entidad_tipo", "bodega")
          .order("id")
          .range(desde, desde + 999),
        "leer registros",
      );
      for (const r of filas) if (r.entidad_id) this.vinculadas.set(r.entidad_id, r.id_externo);
      if (filas.length < 1000) break;
    }

    const supresiones = (await cargarSupresiones(this.db, "bodega"))
      .map(aSupresionBodega)
      .filter((s) => s !== null);
    this.emparejador = new EmparejadorBodegas(this.catalogo, supresiones);
  }

  /** Bodegas vinculadas a otro registro de esta fuente: no pueden ser esta. */
  private excluir(idExterno: string): Set<string> {
    return new Set([...this.vinculadas].filter(([, ext]) => ext !== idExterno).map(([id]) => id));
  }

  async guardar(n: BodegaNormalizada): Promise<Resultado> {
    const reg = sinError(
      await this.db
        .from("registros_fuente")
        .select("id, entidad_tipo, entidad_id, datos, supresion_id, decision, decision_tipo, decision_id")
        .eq("fuente_id", this.fuenteId)
        .eq("id_externo", n.idExterno)
        .maybeSingle(),
      "leer registro",
    );
    const ahora = new Date().toISOString();
    const decision = decisionAdmin(reg);

    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar") {
      await this.guardarRegistro(n, "descartado", null, null, ahora);
      return "descartado";
    }

    let bodegaId =
      reg?.entidad_tipo === "bodega" && reg.entidad_id && this.bodegaIds.has(reg.entidad_id) ? reg.entidad_id : null;
    const primeraVez = bodegaId === null;
    let nuevo = false;

    if (!bodegaId) {
      if (decision?.tipo === "asociar" && decision.entidad === "bodega" && this.bodegaIds.has(decision.id)) {
        bodegaId = decision.id;
      } else if (decision?.tipo === "crear") {
        bodegaId = await this.crear(n);
        nuevo = true;
      } else {
        const emp = this.emparejador.emparejar(
          {
            nombre: n.campos.nombre, municipio: n.campos.municipio, web: n.campos.web, provincia: n.campos.provincia,
            codigoPostal: n.campos.codigo_postal, telefono: n.campos.telefono, ubicacion: coordenadas(n.campos.ubicacion),
            direccion: n.campos.direccion, marcas: n.marcas,
          },
          { excluir: this.excluir(n.idExterno) },
        );
        if (emp.estado === "suprimida") {
          await this.guardarRegistro(n, "descartado", null, emp, ahora, emp.supresionId);
          this.log.info(`Descartada (la borró el admin): ${n.campos.nombre}`);
          return "descartado";
        }
        if (vinculoDudosoPorDominio(emp, n.campos.nombre)) {
          const enRevision: ResultadoBodega = { ...emp, estado: "revision", bodegaId: null };
          await this.guardarRegistro(n, "revision", null, enRevision, ahora);
          this.log.info(`Revisión (mismo dominio, otro nombre): ${n.campos.nombre} ~ ${emp.candidatos[0]?.nombre ?? "?"}`);
          return "revision";
        }
        if (emp.estado === "revision") {
          await this.guardarRegistro(n, "revision", null, emp, ahora);
          this.log.info(`Revisión (${emp.confianza}): ${n.campos.nombre} ~ ${emp.candidatos[0]?.nombre ?? "?"}`);
          return "revision";
        }
        if (emp.estado === "vinculada") {
          bodegaId = emp.bodegaId!;
          this.log.info(`Vinculada a bodega existente (${emp.candidatos[0]?.motivo}): ${n.campos.nombre}`);
        } else {
          bodegaId = await this.crear(n);
          nuevo = true;
        }
      }
    }

    const registroId = await this.guardarRegistro(n, "emparejado", bodegaId, null, ahora);
    this.vinculadas.set(bodegaId, n.idExterno);
    const aporte: Aporte = { registroId, fuenteId: this.fuenteId, tipoFuente: this.tipoFuente, url: n.url, observadoEn: ahora };
    const { escritos } = await this.consolidador.consolidar("bodega", bodegaId, { ...n.campos }, aporte);

    // Solo al vincular por primera vez: si después el admin le quita la D.O., no se vuelve a poner.
    if (primeraVez) await this.asegurarDenominacion(bodegaId);
    await this.resumidor.resumir("bodega", bodegaId, "descripcion");

    if (nuevo) return "nuevo";
    const datosAntes = reg?.datos ?? null;
    return escritos.length > 0 || primeraVez || !igualesJson(datosAntes, n.datos) ? "actualizado" : "sin_cambios";
  }

  private async guardarRegistro(
    n: BodegaNormalizada,
    estado: "emparejado" | "revision" | "descartado",
    bodegaId: string | null,
    emparejamiento: ResultadoBodega | null,
    ahora: string,
    supresionId?: string | null,
  ): Promise<string> {
    const datos = emparejamiento ? { ...n.datos, emparejamiento } : n.datos;
    const fila = sinError(
      await this.db
        .from("registros_fuente")
        .upsert(
          {
            fuente_id: this.fuenteId,
            id_externo: n.idExterno,
            url: n.url,
            datos: JSON.parse(JSON.stringify(datos)),
            hechos: JSON.parse(JSON.stringify(hechosConsejo(n, this.fuenteId, ahora))),
            entidad_tipo: bodegaId ? "bodega" : null,
            entidad_id: bodegaId,
            confianza_emparejamiento: bodegaId ? 1 : (emparejamiento?.confianza ?? null),
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

  /** Bodega nueva solo con nombre y slug: el resto lo escribe la consolidación (con procedencia). */
  private async crear(n: BodegaNormalizada): Promise<string> {
    const { id } = await insertarConSlug(
      this.db,
      "bodegas",
      { nombre: n.campos.nombre, fuente_id: this.fuenteId },
      candidatosSlug(n.campos, n.idExterno),
      this.slugs,
    );
    this.bodegaIds.add(id);
    // No hace falta rehacer el emparejador: una fuente no lista dos veces la misma bodega
    // (y las ya vinculadas a esta fuente se excluyen de todos modos).
    this.catalogo.push({
      id, nombre: n.campos.nombre, municipio: n.campos.municipio, web: n.campos.web, provincia: n.campos.provincia,
      codigoPostal: n.campos.codigo_postal, telefono: n.campos.telefono, ubicacion: coordenadas(n.campos.ubicacion),
      marcas: n.marcas,
    });
    return id;
  }

  /** La D.O. del consejo para la bodega; principal solo si no tiene ya otra principal. */
  private async asegurarDenominacion(bodegaId: string) {
    const actuales = sinError(
      await this.db
        .from("bodega_denominaciones")
        .select("denominacion_id, principal")
        .eq("bodega_id", bodegaId),
      "leer D.O. de la bodega",
    );
    if (actuales.some((d) => d.denominacion_id === this.denominacionId)) return;
    sinError(
      await this.db.from("bodega_denominaciones").upsert(
        {
          bodega_id: bodegaId,
          denominacion_id: this.denominacionId,
          principal: !actuales.some((d) => d.principal),
        },
        { onConflict: "bodega_id,denominacion_id", ignoreDuplicates: true },
      ),
      "guardar D.O. de la bodega",
    );
  }
}
