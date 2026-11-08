// Ribera del Duero: bodegas, su D.O. y el registro de fuente, sobre el núcleo
// de consolidación (lib/consolidacion): emparejamiento entre fuentes,
// prioridad por campo, supresiones y decisiones del admin, y resumen propio.
import { EmparejadorBodegas, type BodegaCatalogo, type ResultadoBodega } from "../../emparejamiento/entidades.ts";
import { Consolidador, type Aporte } from "../../lib/consolidacion/consolidar.ts";
import type { TipoFuente } from "../../lib/consolidacion/decidir.ts";
import { hechosDe, type Hecho } from "../../lib/consolidacion/hechos.ts";
import { PlantillasEsEn } from "../../lib/consolidacion/plantillas.ts";
import { Resumidor, type GeneradorResumen } from "../../lib/consolidacion/resumen.ts";
import { insertarConSlug } from "../../lib/consolidacion/slug.ts";
import { aSupresionBodega, cargarSupresiones, decisionAdmin } from "../../lib/consolidacion/supresiones.ts";
import { sinError, type ClienteDb } from "../../lib/db.ts";
import { igualesJson } from "../../lib/json.ts";
import type { Log } from "../../lib/log.ts";
import { slugify } from "../../lib/texto.ts";
import type { BodegaNormalizada, CamposBodega } from "./normalizar.ts";

export const SLUG_DENOMINACION = "ribera-del-duero";
const NOMBRE_DENOMINACION = "Ribera del Duero";

export type Resultado = "nuevo" | "actualizado" | "sin_cambios" | "revision" | "descartado";

const CAMPOS: (keyof CamposBodega)[] = [
  "nombre", "direccion", "codigo_postal", "municipio", "provincia", "comunidad",
  "ubicacion", "web", "telefono", "email",
];

/** Slugs candidatos, del más corto al más específico. */
export function candidatosSlug(campos: CamposBodega, respaldo: string): string[] {
  const base = slugify(campos.nombre) || slugify(respaldo);
  const lista = [base];
  if (campos.municipio) lista.push(`${base}-${slugify(campos.municipio)}`);
  for (let i = 2; i <= 50; i++) lista.push(`${base}-${i}`);
  return [...new Set(lista)];
}

/** Campos cuyo valor en la fuente cambió desde la ejecución anterior (`datos.campos`). */
export function camposCambiados(antes: CamposBodega | null, ahora: CamposBodega): (keyof CamposBodega)[] {
  if (!antes) return CAMPOS;
  return CAMPOS.filter((k) => !igualesJson(antes[k], ahora[k]));
}

/** Lo que esta fuente escribió la vez anterior (`datos.campos`); null en registros antiguos. */
export function camposAnteriores(datos: unknown): CamposBodega | null {
  const campos = (datos as { campos?: CamposBodega } | null)?.campos;
  return campos && typeof campos === "object" ? campos : null;
}

/** Hechos atómicos de la ficha (materia prima del resumen propio). */
export function hechosRibera(n: BodegaNormalizada, fuenteId: string, observadoEn: string): Hecho[] {
  return hechosDe({ fuente_id: fuenteId, registro_id: null, url: n.url, origen: "consejo_regulador" }, observadoEn, [
    { clave: "bodega.nombre", valor: n.campos.nombre },
    { clave: "bodega.municipio", valor: n.campos.municipio },
    { clave: "bodega.provincia", valor: n.campos.provincia },
    { clave: "bodega.denominacion", valor: NOMBRE_DENOMINACION },
  ]);
}

export class GuardadoRibera {
  private db: ClienteDb;
  private fuenteId: string;
  private log: Log;
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

  constructor(db: ClienteDb, fuenteId: string, log: Log, generador: GeneradorResumen = new PlantillasEsEn()) {
    this.db = db;
    this.fuenteId = fuenteId;
    this.log = log;
    this.consolidador = new Consolidador(db);
    this.resumidor = new Resumidor(db, generador);
  }

  /** Carga una vez por ejecución la D.O., las bodegas, los vínculos de esta fuente y las supresiones. */
  async preparar(): Promise<void> {
    const denominacion = sinError(
      await this.db.from("denominaciones").select("id").eq("slug", SLUG_DENOMINACION).maybeSingle(),
      "leer denominación",
    );
    if (!denominacion) throw new Error(`No existe la denominación '${SLUG_DENOMINACION}' (¿semillas?)`);
    this.denominacionId = denominacion.id;

    const fuente = sinError(await this.db.from("fuentes").select("tipo").eq("id", this.fuenteId).single(), "leer fuente");
    this.tipoFuente = fuente.tipo;

    for (let desde = 0; ; desde += 1000) {
      const filas = sinError(
        await this.db
          .from("bodegas")
          .select("id, nombre, slug, municipio, web, nif, registro_embotellador")
          .order("id")
          .range(desde, desde + 999),
        "leer bodegas",
      );
      for (const b of filas) {
        this.bodegaIds.add(b.id);
        this.slugs.add(b.slug);
        this.catalogo.push({
          id: b.id, nombre: b.nombre, municipio: b.municipio, web: b.web, nif: b.nif,
          registroEmbotellador: b.registro_embotellador,
        });
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
          { nombre: n.campos.nombre, municipio: n.campos.municipio, web: n.campos.web },
          { excluir: this.excluir(n.idExterno) },
        );
        if (emp.estado === "suprimida") {
          await this.guardarRegistro(n, "descartado", null, emp, ahora, emp.supresionId);
          this.log.info(`Descartada (la borró el admin): ${n.campos.nombre}`);
          return "descartado";
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
            hechos: JSON.parse(JSON.stringify(hechosRibera(n, this.fuenteId, ahora))),
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
      candidatosSlug(n.campos, n.datos.slug_fuente),
      this.slugs,
    );
    this.bodegaIds.add(id);
    this.catalogo.push({ id, nombre: n.campos.nombre, municipio: n.campos.municipio, web: n.campos.web });
    return id;
  }

  /** Ribera como D.O. de la bodega; principal solo si no tiene ya otra principal. */
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
