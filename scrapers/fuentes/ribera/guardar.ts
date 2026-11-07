// Ribera del Duero: upsert idempotente de bodegas, su D.O. y el registro de fuente.
import { sinError, type ClienteDb } from "../../lib/db.ts";
import { igualesJson } from "../../lib/json.ts";
import type { Log } from "../../lib/log.ts";
import { claveNombreBodega, slugify } from "../../lib/texto.ts";
import { normalizarCampos, type BodegaNormalizada, type CamposBodega } from "./normalizar.ts";
import type { FichaRibera } from "./parsear.ts";

export const SLUG_DENOMINACION = "ribera-del-duero";

export type Resultado = "nuevo" | "actualizado" | "sin_cambios";

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

/** Campos cuyo valor en la fuente cambió desde la ejecución anterior. */
export function camposCambiados(antes: CamposBodega | null, ahora: CamposBodega): (keyof CamposBodega)[] {
  if (!antes) return CAMPOS;
  return CAMPOS.filter((k) => !igualesJson(antes[k], ahora[k]));
}

export class GuardadoRibera {
  private db: ClienteDb;
  private fuenteId: string;
  private log: Log;
  private denominacionId = "";
  private bodegaIds = new Set<string>();
  private slugs = new Set<string>();
  // clave de nombre → ids de bodega (para vincular bodegas creadas a mano).
  private porClave = new Map<string, string[]>();

  constructor(db: ClienteDb, fuenteId: string, log: Log) {
    this.db = db;
    this.fuenteId = fuenteId;
    this.log = log;
  }

  /** Carga una vez por ejecución la D.O. y las bodegas existentes (~cientos). */
  async preparar(): Promise<void> {
    const denominacion = sinError(
      await this.db.from("denominaciones").select("id").eq("slug", SLUG_DENOMINACION).maybeSingle(),
      "leer denominación",
    );
    if (!denominacion) throw new Error(`No existe la denominación '${SLUG_DENOMINACION}' (¿semillas?)`);
    this.denominacionId = denominacion.id;

    for (let desde = 0; ; desde += 1000) {
      const filas = sinError(
        await this.db.from("bodegas").select("id, nombre, slug").order("id").range(desde, desde + 999),
        "leer bodegas",
      );
      for (const b of filas) this.recordar(b.id, b.nombre, b.slug);
      if (filas.length < 1000) break;
    }
  }

  /** Nº de registros de esta fuente ya conocidos (para detectar volumen anómalo). */
  async registrosConocidos(): Promise<number> {
    const r = await this.db
      .from("registros_fuente")
      .select("id", { count: "exact", head: true })
      .eq("fuente_id", this.fuenteId)
      .neq("estado_emparejamiento", "descartado");
    if (r.error) throw new Error(`contar registros: ${r.error.message}`);
    return r.count ?? 0;
  }

  private recordar(id: string, nombre: string, slug: string) {
    this.bodegaIds.add(id);
    this.slugs.add(slug);
    const clave = claveNombreBodega(nombre);
    this.porClave.set(clave, [...(this.porClave.get(clave) ?? []), id]);
  }

  async guardar(n: BodegaNormalizada): Promise<Resultado> {
    const reg = sinError(
      await this.db
        .from("registros_fuente")
        .select("id, entidad_tipo, entidad_id, datos")
        .eq("fuente_id", this.fuenteId)
        .eq("id_externo", n.idExterno)
        .maybeSingle(),
      "leer registro",
    );

    let bodegaId =
      reg?.entidad_tipo === "bodega" && reg.entidad_id && this.bodegaIds.has(reg.entidad_id)
        ? reg.entidad_id
        : null;
    let resultado: Resultado;

    if (bodegaId) {
      // Solo se escribe lo que cambió en la fuente: así no se pisan las
      // correcciones del admin (prioridad admin > consejo regulador).
      const cambios = camposCambiados(this.camposAnteriores(reg!.datos), n.campos);
      if (cambios.length > 0) {
        await this.actualizar(bodegaId, Object.fromEntries(cambios.map((k) => [k, n.campos[k]])));
      }
      resultado = cambios.length > 0 || !igualesJson(reg!.datos, n.datos) ? "actualizado" : "sin_cambios";
    } else {
      const coincidencias = this.porClave.get(n.datos.clave_nombre) ?? [];
      if (coincidencias.length === 1) {
        bodegaId = coincidencias[0]!;
        resultado = (await this.completarHuecos(bodegaId, n.campos)) ? "actualizado" : "sin_cambios";
        this.log.info(`Vinculada a bodega existente por nombre: ${n.campos.nombre}`);
      } else {
        bodegaId = await this.crear(n);
        resultado = "nuevo";
      }
    }

    await this.asegurarDenominacion(bodegaId);

    sinError(
      await this.db.from("registros_fuente").upsert(
        {
          fuente_id: this.fuenteId,
          id_externo: n.idExterno,
          url: n.url,
          datos: JSON.parse(JSON.stringify(n.datos)),
          entidad_tipo: "bodega",
          entidad_id: bodegaId,
          confianza_emparejamiento: 1,
          estado_emparejamiento: "emparejado",
          visto_por_ultima_vez: new Date().toISOString(),
        },
        { onConflict: "fuente_id,id_externo" },
      ),
      "guardar registro",
    );
    return resultado;
  }

  private camposAnteriores(datos: unknown): CamposBodega | null {
    try {
      return normalizarCampos(datos as FichaRibera);
    } catch {
      return null; // formato antiguo: se reescriben todos los campos
    }
  }

  private async actualizar(id: string, cambios: Partial<CamposBodega>) {
    sinError(
      await this.db.from("bodegas").update({ ...cambios, fuente_id: this.fuenteId }).eq("id", id),
      "actualizar bodega",
    );
  }

  /** Bodega existente sin registro de esta fuente: solo se rellenan los campos vacíos. */
  private async completarHuecos(id: string, campos: CamposBodega): Promise<boolean> {
    const actual = sinError(
      await this.db.from("bodegas").select(CAMPOS.join(", ")).eq("id", id).single(),
      "leer bodega",
    ) as unknown as Record<keyof CamposBodega, unknown>;
    const huecos = CAMPOS.filter((k) => actual[k] == null && campos[k] != null);
    if (huecos.length === 0) return false;
    const relleno: Partial<CamposBodega> = Object.fromEntries(huecos.map((k) => [k, campos[k]]));
    sinError(
      await this.db.from("bodegas").update(relleno).eq("id", id),
      "completar bodega",
    );
    return true;
  }

  private async crear(n: BodegaNormalizada): Promise<string> {
    for (const slug of candidatosSlug(n.campos, n.datos.slug_fuente)) {
      if (this.slugs.has(slug)) continue;
      const r = await this.db
        .from("bodegas")
        .insert({ ...n.campos, slug, fuente_id: this.fuenteId })
        .select("id")
        .single();
      if (r.error?.code === "23505") {
        this.slugs.add(slug); // otra fila lo tomó entretanto
        continue;
      }
      const fila = sinError(r, "crear bodega");
      this.recordar(fila.id, n.campos.nombre, slug);
      return fila.id;
    }
    throw new Error(`Sin slug libre para ${n.campos.nombre}`);
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
