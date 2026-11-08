// Vinoselección: upsert idempotente de vino → añada → variedades → imagen y registro de fuente.
import type { BodegaCandidata, ResultadoEmparejamiento } from "../../emparejamiento/bodegas.ts";
import { sinError, type ClienteDb } from "../../lib/db.ts";
import { igualesJson } from "../../lib/json.ts";
import type { Log } from "../../lib/log.ts";
import { claveNombreBodega, claveTexto, slugify } from "../../lib/texto.ts";
import { SLUG_DENOMINACION } from "../ribera/guardar.ts";
import { SLUG_FUENTE as SLUG_RIBERA } from "../ribera/index.ts";
import type { CamposAnada, DatosRegistroVs, Variedad, VinoNormalizado } from "./normalizar.ts";

export type Resultado = "nuevo" | "actualizado" | "sin_cambios" | "revision" | "descartado";

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
  private vinos = new Map<string, string>(); // bodega_id|clave nombre → vino id
  private slugsVino = new Set<string>();

  constructor(db: ClienteDb, fuenteId: string, log: Log) {
    this.db = db;
    this.fuenteId = fuenteId;
    this.log = log;
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

    const vinos = await paginar("vinos", (d, h) =>
      this.db.from("vinos").select("id, bodega_id, nombre, slug").order("id").range(d, h),
    );
    for (const v of vinos) {
      this.vinos.set(`${v.bodega_id}|${claveTexto(v.nombre)}`, v.id);
      this.slugsVino.add(v.slug);
    }

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
    return bodegas.map((b) => {
      this.bodegaSlug.set(b.id, b.slug);
      return { id: b.id, nombre: b.nombre, clave: claveNombreBodega(b.nombre), marcas: marcas.get(b.id) ?? [] };
    });
  }

  /** Registro previo de esta ficha (si lo hay). */
  async registroPrevio(idExterno: string) {
    return sinError(
      await this.db
        .from("registros_fuente")
        .select("id, entidad_tipo, entidad_id, estado_emparejamiento, datos")
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
    emparejamiento: ResultadoEmparejamiento | { motivo: string } | null,
  ) {
    // Con añada se guardan también sus campos y su composición, para detectar cambios en la
    // próxima ejecución.
    const datos: DatosRegistroVs & { anada?: CamposAnada; variedades?: Variedad[] } = {
      ...n.datos,
      ...(anadaId ? { anada: n.anada, variedades: n.variedades } : {}),
      ...(emparejamiento ? { emparejamiento } : {}),
    };
    sinError(
      await this.db.from("registros_fuente").upsert(
        {
          fuente_id: this.fuenteId,
          id_externo: n.idExterno,
          url: n.url,
          datos: JSON.parse(JSON.stringify(datos)),
          entidad_tipo: anadaId ? "anada" : null,
          entidad_id: anadaId,
          confianza_emparejamiento:
            emparejamiento && "confianza" in emparejamiento ? emparejamiento.confianza : anadaId ? 1 : null,
          estado_emparejamiento: estado,
          visto_por_ultima_vez: new Date().toISOString(),
        },
        { onConflict: "fuente_id,id_externo" },
      ),
      "guardar registro",
    );
  }

  /** Crea (o reutiliza) vino y añada de una bodega emparejada. */
  async guardarVino(
    n: VinoNormalizado,
    bodegaId: string,
    previo: { vinoId: string; anadaId: string; datos: unknown } | null,
  ): Promise<{ anadaId: string; resultado: "nuevo" | "actualizado" | "sin_cambios" }> {
    if (!n.vino.tipo) throw new Error(`tipo de vino desconocido: ${n.datos.tipo_texto ?? n.datos.nombre}`);

    let vinoId = previo?.vinoId ?? this.vinos.get(`${bodegaId}|${claveTexto(n.vino.nombre)}`) ?? null;
    let nuevo = false;
    if (!vinoId) {
      vinoId = await this.crearVino(n, bodegaId);
      nuevo = true;
    }

    let anadaId = previo?.anadaId ?? null;
    let cambios = false;
    if (!anadaId) {
      const fila = sinError(
        await this.db
          .from("anadas")
          .upsert({ vino_id: vinoId, ...n.anada }, { onConflict: "vino_id,anio" })
          .select("id")
          .single(),
        "guardar añada",
      );
      anadaId = fila.id;
      nuevo = true;
    } else {
      // Solo se reescriben los campos que cambiaron en la fuente (no se pisan ediciones del admin).
      const antes = (previo?.datos as { anada?: CamposAnada } | null)?.anada ?? null;
      const cambiados = CAMPOS_ANADA.filter((k) => !antes || !igualesJson(antes[k], n.anada[k]));
      if (cambiados.length > 0) {
        const parcial: Partial<CamposAnada> = Object.fromEntries(cambiados.map((k) => [k, n.anada[k]]));
        sinError(await this.db.from("anadas").update(parcial).eq("id", anadaId), "actualizar añada");
        cambios = true;
      }
    }

    // Como con los campos de la añada: solo se escribe si la composición cambió en la fuente.
    const antes = nuevo ? null : variedadesAnteriores(previo?.datos);
    if (await this.guardarVariedades(anadaId, n.variedades, antes)) cambios = true;
    if (await this.guardarImagen(anadaId, n)) cambios = true;

    const datosCambiados = previo
      ? !igualesJson(sinEmparejamiento(previo.datos), { ...n.datos, anada: n.anada, variedades: n.variedades })
      : false;
    return {
      anadaId,
      resultado: nuevo ? "nuevo" : cambios || datosCambiados ? "actualizado" : "sin_cambios",
    };
  }

  private async crearVino(n: VinoNormalizado, bodegaId: string): Promise<string> {
    const base = slugify(n.vino.nombre) || "vino";
    const bodega = this.bodegaSlug.get(bodegaId) ?? "bodega";
    const candidatos = [base, `${bodega}-${base}`, ...Array.from({ length: 49 }, (_, i) => `${bodega}-${base}-${i + 2}`)];
    for (const slug of candidatos) {
      if (this.slugsVino.has(slug)) continue;
      const r = await this.db
        .from("vinos")
        .insert({
          bodega_id: bodegaId,
          nombre: n.vino.nombre,
          slug,
          tipo: n.vino.tipo!,
          crianza: n.vino.crianza,
          denominacion_id: this.denominacionId,
          fuente_id: this.fuenteId,
        })
        .select("id")
        .single();
      if (r.error?.code === "23505") {
        this.slugsVino.add(slug);
        continue;
      }
      const fila = sinError(r, "crear vino");
      this.slugsVino.add(slug);
      this.vinos.set(`${bodegaId}|${claveTexto(n.vino.nombre)}`, fila.id);
      return fila.id;
    }
    throw new Error(`Sin slug libre para el vino ${n.vino.nombre}`);
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
