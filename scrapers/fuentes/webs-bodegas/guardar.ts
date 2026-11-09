// Webs de bodegas: escritura sobre el núcleo de consolidación. Cada sitio es
// una fila de `fuentes` (slug web-<dominio>, tipo «bodega» = web oficial, la de
// más rango tras el admin) con la puerta legal en `notas_robots`; la ejecución
// se registra en la fuente madre `webs-bodegas`. Registros por sitio:
//   «sitio»                       → bodega (hechos de historia, datos.puerta)
//   «vino:<ruta>[#<nombre>]»      → añada (vino creado o emparejado dentro de su bodega)
//   «servicio:<tipo>:<titulo>»    → servicio de enoturismo
import { EmparejadorVinos } from "../../emparejamiento/vinos.ts";
import { Consolidador, type Aporte } from "../../lib/consolidacion/consolidar.ts";
import type { Hecho } from "../../lib/consolidacion/hechos.ts";
import { PlantillasEsEn } from "../../lib/consolidacion/plantillas.ts";
import { Resumidor, type GeneradorResumen } from "../../lib/consolidacion/resumen.ts";
import { insertarConSlug } from "../../lib/consolidacion/slug.ts";
import {
  aSupresionVino,
  cargarSupresiones,
  clavesAnadasSuprimidas,
  clavesImagenesSuprimidas,
  decisionAdmin,
  type FilaSupresion,
} from "../../lib/consolidacion/supresiones.ts";
import { dominioWeb, normalizarWeb } from "../../lib/contacto.ts";
import { sinError, type ClienteDb } from "../../lib/db.ts";
import { igualesJson } from "../../lib/json.ts";
import type { Log } from "../../lib/log.ts";
import { claveTexto, slugify } from "../../lib/texto.ts";
import type { Database, Json } from "../../../src/lib/supabase/database.types.ts";
import { decidirDenominacion, ResolutorDenominaciones, type Denominacion } from "./denominacion.ts";
import { candidataPorEmail, type BodegaConWeb } from "./entrada.ts";
import type { ImagenElegida } from "./imagen.ts";
import { hechosBodega, hechosServicio, hechosVino } from "./normalizar.ts";
import { notaPuerta } from "./puerta.ts";
import { normalizarUrl, type EntradaSitio, type PaginaVista, type ResultadoSitio, type ServicioSitio, type VinoSitio } from "./sitio.ts";

export interface ResultadoGuardado {
  nuevos: number;
  actualizados: number;
  sinCambios: number;
  revision: number;
  errores: number;
}

interface FuenteSitio {
  id: string;
  slug: string;
  activa: boolean;
  url_base: string;
}

type Estado = Database["public"]["Enums"]["estado_emparejamiento"];
type Entidad = Database["public"]["Enums"]["entidad_catalogo"];

const PREFIJO_SLUG = "web-";
export const slugFuenteSitio = (dominio: string) => `${PREFIJO_SLUG}${slugify(dominio)}`.slice(0, 60).replace(/-+$/, "");
const json = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;

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

export class GuardadoWebs {
  private db: ClienteDb;
  private fuenteMadreId: string;
  private log: Log;
  private consolidador: Consolidador;
  private resumidor: Resumidor;
  private bodegas: (BodegaConWeb & { id: string; slug: string })[] = [];
  private fuentesPorSlug = new Map<string, FuenteSitio>();
  private fuentesPorId = new Map<string, FuenteSitio>();
  /** bodega → fuente del sitio que la tiene (registro «sitio»), para reutilizarla si cambia el dominio. */
  private fuenteDeBodega = new Map<string, string>();
  private vistoSitio = new Map<string, string>(); // fuente id → visto_por_ultima_vez
  private dosDe = new Map<string, Denominacion[]>(); // bodega → sus D.O.
  private resolutorDo = new ResolutorDenominaciones([]);
  private imagenesSuprimidas = new Set<string>(); // entidad_id|url
  private paginasPrevias = new Map<string, PaginaVista[]>(); // fuente id → páginas de la visita anterior
  /** Bodegas sin `web` (para descubrir su web por el dominio del email). */
  private sinWeb: { id: string; nombre: string; municipio: string | null; email: string | null; slug: string }[] = [];
  private websIntentadas = new Map<string, string>(); // bodega → visto del registro «web:<id>»
  private variedades = new Map<string, string>(); // clave → id
  private slugsVino = new Set<string>();
  private bodegaDeVino = new Map<string, string>();
  private vinos = new EmparejadorVinos([]);
  private anadasSuprimidas = new Map<string, string>();
  private serviciosSuprimidos: FilaSupresion[] = [];

  constructor(db: ClienteDb, fuenteMadreId: string, log: Log, generador: GeneradorResumen = new PlantillasEsEn()) {
    this.db = db;
    this.fuenteMadreId = fuenteMadreId;
    this.log = log;
    this.consolidador = new Consolidador(db);
    this.resumidor = new Resumidor(db, generador);
  }

  async preparar(): Promise<void> {
    const bodegas = await paginar("bodegas", (d, h) =>
      this.db.from("bodegas").select("id, nombre, slug, municipio, web").not("web", "is", null).order("id").range(d, h),
    );
    this.bodegas = bodegas.filter((b) => b.web).map((b) => ({ id: b.id, nombre: b.nombre, slug: b.slug, municipio: b.municipio, web: b.web! }));
    this.sinWeb = await paginar("bodegas sin web", (d, h) =>
      this.db.from("bodegas").select("id, nombre, slug, municipio, email").is("web", null).order("id").range(d, h),
    );
    for (const r of await paginar("candidatas de web", (d, h) =>
      this.db.from("registros_fuente").select("id_externo, visto_por_ultima_vez").eq("fuente_id", this.fuenteMadreId).like("id_externo", "web:%").order("id").range(d, h),
    )) {
      this.websIntentadas.set(r.id_externo.slice(4), r.visto_por_ultima_vez);
    }

    const fuentes = await paginar("fuentes", (d, h) =>
      this.db.from("fuentes").select("id, slug, activa, url_base").eq("tipo", "bodega").like("slug", `${PREFIJO_SLUG}%`).order("id").range(d, h),
    );
    for (const f of fuentes) {
      this.fuentesPorSlug.set(f.slug, f);
      this.fuentesPorId.set(f.id, f);
    }
    const ids = [...this.fuentesPorId.keys()];
    for (let i = 0; i < ids.length; i += 200) {
      const regs = sinError(
        await this.db
          .from("registros_fuente")
          .select("fuente_id, entidad_id, visto_por_ultima_vez, paginas:datos->paginas")
          .in("fuente_id", ids.slice(i, i + 200))
          .eq("id_externo", "sitio"),
        "leer registros de sitio",
      );
      for (const r of regs) {
        this.vistoSitio.set(r.fuente_id, r.visto_por_ultima_vez);
        if (Array.isArray(r.paginas)) this.paginasPrevias.set(r.fuente_id, r.paginas as unknown as PaginaVista[]);
        if (r.entidad_id) this.fuenteDeBodega.set(r.entidad_id, r.fuente_id);
      }
    }

    const denominaciones = sinError(await this.db.from("denominaciones").select("id, nombre, slug, tipo"), "leer denominaciones");
    this.resolutorDo = new ResolutorDenominaciones(denominaciones);
    const porId = new Map(denominaciones.map((d) => [d.id, d]));
    const dos = await paginar("D.O. de bodegas", (d, h) =>
      this.db.from("bodega_denominaciones").select("bodega_id, denominacion_id").order("bodega_id").range(d, h),
    );
    for (const x of dos) {
      const den = porId.get(x.denominacion_id);
      if (den) this.dosDe.set(x.bodega_id, [...(this.dosDe.get(x.bodega_id) ?? []), den]);
    }
    this.imagenesSuprimidas = clavesImagenesSuprimidas(await cargarSupresiones(this.db, "imagen"));

    for (const v of sinError(await this.db.from("variedades_uva").select("id, nombre, sinonimos"), "leer variedades")) {
      for (const n of [v.nombre, ...v.sinonimos]) this.variedades.set(claveTexto(n), v.id);
    }
    const vinos = await paginar("vinos", (d, h) => this.db.from("vinos").select("id, bodega_id, nombre, slug, tipo, crianza").order("id").range(d, h));
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
    this.serviciosSuprimidos = (await cargarSupresiones(this.db, "servicio_bodega")).filter((s) => s.motivo === "borrado");
    this.log.info(`${this.bodegas.length} bodegas con web; ${fuentes.length} sitios ya conocidos`);
  }

  bodegasConWeb(): BodegaConWeb[] {
    return this.bodegas;
  }

  resolutor(): ResolutorDenominaciones {
    return this.resolutorDo;
  }

  /** Páginas vistas la visita anterior (URL normalizada → modificada), para el rastreo incremental. */
  previas(dominio: string): Map<string, string> {
    const f = this.fuentesPorSlug.get(slugFuenteSitio(dominio));
    const out = new Map<string, string>();
    for (const p of (f ? this.paginasPrevias.get(f.id) : null) ?? []) if (p.modificada) out.set(normalizarUrl(p.url), p.modificada);
    return out;
  }

  /**
   * Webs candidatas para bodegas sin `web`: el dominio de su email, si no es un proveedor de correo
   * ni un dominio genérico. Una candidata ya probada no se repite hasta pasados 30 días.
   */
  candidatasWeb(): EntradaSitio[] {
    const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const usados = new Set(this.bodegas.map((b) => dominioWeb(b.web)).filter(Boolean));
    const out: EntradaSitio[] = [];
    for (const b of this.sinWeb) {
      const visto = this.websIntentadas.get(b.id);
      if (visto && visto > hace30) continue;
      const c = candidataPorEmail(b.email);
      if (!c || usados.has(c.dominio)) continue;
      out.push({ dominio: c.dominio, url: c.url, bodegas: [{ id: b.id, nombre: b.nombre, municipio: b.municipio }], candidata: { origen: "email", detalle: b.email! } });
    }
    return out;
  }

  municipios(): string[] {
    return [...new Set(this.bodegas.map((b) => b.municipio).filter((m): m is string => !!m))];
  }

  /** Fuente existente del sitio: por la bodega (aunque haya cambiado de dominio) o por el slug. */
  private fuenteExistente(sitio: EntradaSitio, dominioFinal?: string | null): FuenteSitio | null {
    for (const b of sitio.bodegas) {
      const id = b.id ? this.fuenteDeBodega.get(b.id) : undefined;
      if (id && this.fuentesPorId.has(id)) return this.fuentesPorId.get(id)!;
    }
    return this.fuentesPorSlug.get(slugFuenteSitio(sitio.dominio)) ?? (dominioFinal ? this.fuentesPorSlug.get(slugFuenteSitio(dominioFinal)) ?? null : null);
  }

  /** El admin desactivó el sitio (`fuentes.activa = false`): no se rastrea ni se reactiva. */
  async desactivada(sitio: EntradaSitio): Promise<boolean> {
    return this.fuenteExistente(sitio)?.activa === false;
  }

  /** Los nunca vistos primero; después, del visto hace más tiempo al más reciente. */
  ordenar(sitios: EntradaSitio[]): EntradaSitio[] {
    const visto = (s: EntradaSitio) => {
      const f = this.fuenteExistente(s);
      return f ? this.vistoSitio.get(f.id) ?? "" : "";
    };
    return [...sitios].sort((a, b) => visto(a).localeCompare(visto(b)) || a.dominio.localeCompare(b.dominio));
  }

  /** Crea o actualiza la fila de `fuentes` del sitio (nunca toca `activa`). */
  private async fuenteSitio(r: ResultadoSitio): Promise<FuenteSitio> {
    const dominioFinal = r.puerta.redirigida_desde ? r.puerta.host.replace(/^www\./, "") : null;
    const existente = this.fuenteExistente(r.entrada, dominioFinal);
    const urlBase = new URL(r.paginas[0]?.url ?? r.entrada.url).origin;
    const nombre = r.entrada.bodegas.length === 1 ? `Web oficial de ${r.entrada.bodegas[0]!.nombre}` : `Web oficial (${r.entrada.dominio})`;
    const campos = { nombre, url_base: urlBase, notas_robots: notaPuerta(r.puerta), frecuencia: "semanal" };
    if (existente) {
      sinError(await this.db.from("fuentes").update(campos).eq("id", existente.id), "actualizar fuente del sitio");
      existente.url_base = urlBase;
      return existente;
    }
    const slug = slugFuenteSitio(r.entrada.dominio);
    const creada = sinError(
      await this.db.from("fuentes").upsert({ ...campos, slug, tipo: "bodega" }, { onConflict: "slug" }).select("id, slug, activa, url_base").single(),
      "crear fuente del sitio",
    );
    this.fuentesPorSlug.set(slug, creada);
    this.fuentesPorId.set(creada.id, creada);
    return creada;
  }

  private async registroPrevio(fuenteId: string, idExterno: string) {
    return sinError(
      await this.db
        .from("registros_fuente")
        .select("id, entidad_tipo, entidad_id, datos, supresion_id, decision, decision_tipo, decision_id")
        .eq("fuente_id", fuenteId)
        .eq("id_externo", idExterno)
        .maybeSingle(),
      "leer registro",
    );
  }

  private async guardarRegistro(fila: {
    fuenteId: string; idExterno: string; url: string | null; datos: unknown; hechos: Hecho[];
    entidadTipo: Entidad | null; entidadId: string | null; estado: Estado; confianza?: number | null; supresionId?: string | null;
  }): Promise<string> {
    const ahora = new Date().toISOString();
    const r = sinError(
      await this.db
        .from("registros_fuente")
        .upsert(
          {
            fuente_id: fila.fuenteId,
            id_externo: fila.idExterno,
            url: fila.url,
            datos: json(fila.datos),
            hechos: json(fila.hechos),
            entidad_tipo: fila.entidadTipo,
            entidad_id: fila.entidadId,
            confianza_emparejamiento: fila.confianza ?? (fila.entidadId ? 1 : null),
            estado_emparejamiento: fila.estado,
            visto_por_ultima_vez: ahora,
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

  async guardar(r: ResultadoSitio): Promise<ResultadoGuardado> {
    const out: ResultadoGuardado = { nuevos: 0, actualizados: 0, sinCambios: 0, revision: 0, errores: 0 };
    // Web candidata de una bodega sin `web`: solo se usa si su portada la nombra.
    if (r.entrada.candidata) {
      const bodegaId = r.entrada.bodegas[0]?.id ?? null;
      const verificada = r.puerta.apta && r.verificacion?.estado === "verificada";
      await this.guardarRegistro({
        fuenteId: this.fuenteMadreId, idExterno: `web:${bodegaId}`, url: r.entrada.url,
        datos: { candidata: r.entrada.candidata, verificacion: r.verificacion, puerta: r.puerta },
        hechos: [], entidadTipo: verificada && bodegaId ? "bodega" : null, entidadId: verificada ? bodegaId : null,
        estado: verificada ? "emparejado" : r.verificacion?.estado === "dudosa" && r.puerta.apta ? "revision" : "descartado",
        confianza: r.verificacion?.puntuacion ?? null,
      });
      if (!verificada || !bodegaId) {
        if (r.verificacion?.estado === "dudosa") out.revision++;
        return out;
      }
      this.websIntentadas.set(bodegaId, new Date().toISOString());
      this.bodegas.push({ id: bodegaId, nombre: r.entrada.bodegas[0]!.nombre, slug: this.sinWeb.find((b) => b.id === bodegaId)?.slug ?? "bodega", municipio: r.entrada.bodegas[0]!.municipio, web: r.entrada.url });
    }
    const fuente = await this.fuenteSitio(r);
    this.vistoSitio.set(fuente.id, new Date().toISOString());
    const ahora = new Date().toISOString();
    // Las páginas no pedidas por no haber cambiado conservan su fecha para la próxima vez.
    const sinCambios = new Set(r.sinCambios.map(normalizarUrl));
    const paginas = [...r.paginas, ...(this.paginasPrevias.get(fuente.id) ?? []).filter((p) => sinCambios.has(normalizarUrl(p.url)))];
    this.paginasPrevias.set(fuente.id, paginas);
    const datosSitio = {
      dominio: r.entrada.dominio, puerta: r.puerta, huella: r.huella, extractor: r.extractor, paginas, hosts: r.hosts,
      sin_cambios: r.sinCambios.length, avisos: r.avisos, bodega: r.bodega, peticiones: r.peticiones,
      imagen: r.imagen ? { ...r.imagen, senales_ia: r.puerta.senales_ia } : null,
      bodegas: r.entrada.bodegas.map((b) => ({ id: b.id, nombre: b.nombre })),
      ...(r.entrada.candidata ? { candidata: r.entrada.candidata, verificacion: r.verificacion } : {}),
    };
    const bodegasIds = r.entrada.bodegas.map((b) => b.id).filter((x): x is string => !!x);
    const previo = await this.registroPrevio(fuente.id, "sitio");
    const decision = decisionAdmin(previo);
    let bodegaId: string | null = bodegasIds.length === 1 ? bodegasIds[0]! : null;
    if (decision?.tipo === "asociar" && decision.entidad === "bodega") bodegaId = decision.id;

    if (!r.puerta.apta || decision?.tipo === "suprimido" || decision?.tipo === "descartar") {
      await this.guardarRegistro({
        fuenteId: fuente.id, idExterno: "sitio", url: r.entrada.url, datos: datosSitio, hechos: [],
        entidadTipo: bodegaId ? "bodega" : null, entidadId: bodegaId, estado: "descartado",
      });
      return out;
    }
    if (!bodegaId) {
      // Dominio compartido por varias bodegas: el admin decide a cuál pertenece.
      await this.guardarRegistro({
        fuenteId: fuente.id, idExterno: "sitio", url: r.entrada.url, datos: { ...datosSitio, motivo: "dominio_compartido" },
        hechos: [], entidadTipo: null, entidadId: null, estado: "revision", confianza: 0.5,
      });
      out.revision++;
      return out;
    }

    const bodega = this.bodegas.find((b) => b.id === bodegaId);
    const b = r.bodega!;
    const hechos = hechosBodega(b, fuente.id, r.entrada.url, ahora, bodega?.nombre);
    const registroId = await this.guardarRegistro({
      fuenteId: fuente.id, idExterno: "sitio", url: r.entrada.url, datos: datosSitio, hechos,
      entidadTipo: "bodega", entidadId: bodegaId, estado: "emparejado",
    });
    this.fuenteDeBodega.set(bodegaId, fuente.id);
    const aporte = (url: string | null): Aporte => ({ registroId, fuenteId: fuente.id, tipoFuente: "bodega", url: url ?? r.entrada.url, observadoEn: ahora });
    // Cada campo con la URL de la página de la que sale (atribución por campo).
    const grupos: [Record<string, unknown>, string | null | undefined][] = [
      ...(r.entrada.candidata ? [[{ web: normalizarWeb(r.entrada.url) }, r.entrada.url] as [Record<string, unknown>, string]] : []),
      [{ anio_fundacion: b.fundacion_anio }, b.urls.fundacion_anio],
      [{ hectareas: b.hectareas }, b.urls.hectareas],
      [{ enoturismo_web: b.enoturismo_web, enoturismo_email: b.enoturismo_email, enoturismo_telefono: b.enoturismo_telefono }, b.enoturismo_web],
      [{ redes: Object.keys(b.redes).length ? b.redes : null }, r.entrada.url],
    ];
    let cambios = false;
    for (const [campos, url] of grupos) {
      const { escritos } = await this.consolidador.consolidar("bodega", bodegaId, campos, aporte(url ?? null));
      if (escritos.length) cambios = true;
    }
    for (const campo of ["historia", "descripcion"] as const) {
      if (await this.resumidor.resumir("bodega", bodegaId, campo)) cambios = true;
    }
    if (r.imagen && (await this.guardarImagen({ bodega_id: bodegaId }, r.imagen, fuente.id, bodega?.nombre ?? r.entrada.dominio))) cambios = true;
    // Registros de páginas sin cambios: siguen vistos (sin volver a pedirlas).
    if (r.sinCambios.length) {
      for (let i = 0; i < r.sinCambios.length; i += 100) {
        sinError(
          await this.db.from("registros_fuente").update({ visto_por_ultima_vez: ahora }).eq("fuente_id", fuente.id).in("url", r.sinCambios.slice(i, i + 100)),
          "marcar registros sin cambios",
        );
      }
    }
    if (previo) {
      if (cambios || !igualesJson((previo.datos as { bodega?: unknown } | null)?.bodega, json(b))) out.actualizados++;
      else out.sinCambios++;
    } else out.nuevos++;

    for (const v of r.vinos) {
      try {
        const res = await this.guardarVino(v, fuente.id, bodegaId, r.vinos.filter((x) => x.url === v.url).length > 1);
        out[res === "nuevo" ? "nuevos" : res === "actualizado" ? "actualizados" : res === "revision" ? "revision" : "sinCambios"]++;
      } catch (e) {
        out.errores++;
        this.log.error(`${r.entrada.dominio} · vino «${v.nombre}»: ${(e as Error).message}`);
      }
    }
    const vistos = new Set<string>();
    for (const s of r.servicios) {
      try {
        const res = await this.guardarServicio(s, fuente.id, bodegaId, vistos);
        out[res === "nuevo" ? "nuevos" : res === "actualizado" ? "actualizados" : "sinCambios"]++;
      } catch (e) {
        out.errores++;
        this.log.error(`${r.entrada.dominio} · servicio «${s.titulo}»: ${(e as Error).message}`);
      }
    }
    // Un servicio de esta web que ya no aparece pasa a inactivo (nunca se borra). No se hace si el
    // rastreo se quedó corto de presupuesto o la página del servicio no se pidió por no cambiar.
    const completo = !r.avisos.some((a) => a.startsWith("Presupuesto"));
    if (completo) await this.desactivarServicios(fuente.id, bodegaId, vistos, sinCambios, ahora);
    return out;
  }

  private async desactivarServicios(fuenteId: string, bodegaId: string, vistos: Set<string>, sinCambios: Set<string>, ahora: string) {
    const regs = sinError(
      await this.db
        .from("registros_fuente")
        .select("id, entidad_id, url, datos")
        .eq("fuente_id", fuenteId)
        .eq("entidad_tipo", "servicio_bodega")
        .like("id_externo", "servicio:%"),
      "leer registros de servicios",
    );
    for (const reg of regs) {
      if (!reg.entidad_id || vistos.has(reg.entidad_id) || (reg.url && sinCambios.has(normalizarUrl(reg.url)))) continue;
      await this.consolidador.consolidar("servicio_bodega", reg.entidad_id, { activo: false }, {
        registroId: reg.id, fuenteId, tipoFuente: "bodega", url: reg.url, observadoEn: ahora,
      });
    }
    void bodegaId;
  }

  /** Imagen enlazada (nunca descargada), una por entidad y fuente; respeta las supresiones del admin. */
  private async guardarImagen(
    entidad: { bodega_id: string } | { anada_id: string },
    img: ImagenElegida,
    fuenteId: string,
    atribucion: string,
  ): Promise<boolean> {
    const [col, id] = "bodega_id" in entidad ? (["bodega_id", entidad.bodega_id] as const) : (["anada_id", entidad.anada_id] as const);
    if (this.imagenesSuprimidas.has(`${id}|${img.url}`)) return false;
    const actuales = sinError(await this.db.from("imagenes").select("id, url, fuente_id, principal").eq(col, id), "leer imágenes");
    const propia = actuales.find((i) => i.fuente_id === fuenteId);
    if (propia) {
      if (propia.url === img.url) return false;
      sinError(await this.db.from("imagenes").update({ url: img.url, tipo: img.tipo, alt: img.alt }).eq("id", propia.id), "actualizar imagen");
      return true;
    }
    sinError(
      await this.db.from("imagenes").insert({
        [col]: id, url: img.url, tipo: img.tipo, fuente_id: fuenteId, atribucion: `Web oficial de ${atribucion}`,
        alt: img.alt, principal: !actuales.some((i) => i.principal),
      } as Database["public"]["Tables"]["imagenes"]["Insert"]),
      "guardar imagen",
    );
    return true;
  }

  private idVariedad(nombre: string): string | null {
    return this.variedades.get(claveTexto(nombre)) ?? null;
  }

  /** Vino dentro de su bodega (EAN, nombre normalizado; parecido → revisión) → añada → uvas → EAN. */
  private async guardarVino(v: VinoSitio, fuenteId: string, bodegaId: string, varios: boolean): Promise<"nuevo" | "actualizado" | "sin_cambios" | "revision" | "descartado"> {
    const ruta = new URL(v.url).pathname.replace(/\/$/, "") || "/";
    const idExterno = `vino:${ruta}${varios ? `#${slugify(v.nombre)}` : ""}`;
    const ahora = new Date().toISOString();
    const decisionDo = decidirDenominacion(
      v.denominacion?.denominacion ? { ...v.denominacion, denominacion: this.resolutorDo.porSlugDe(v.denominacion.denominacion.slug) } : v.denominacion,
      this.dosDe.get(bodegaId) ?? [],
    );
    const den = decisionDo.estado === "asignada" ? decisionDo.denominacion : null;
    const textoDo = den?.nombre ?? decisionDo.deteccion?.texto ?? null;
    const hechos = hechosVino(v, fuenteId, ahora, textoDo);
    const previo = await this.registroPrevio(fuenteId, idExterno);
    const decision = decisionAdmin(previo);
    const base = { fuenteId, idExterno, url: v.url, hechos };
    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar") {
      await this.guardarRegistro({ ...base, datos: { vino: v }, hechos: [], entidadTipo: null, entidadId: null, estado: "descartado" });
      return "descartado";
    }

    let anadaId: string | null = null;
    let vinoId: string | null = null;
    if (previo?.entidad_tipo === "anada" && previo.entidad_id) {
      const a = sinError(await this.db.from("anadas").select("id, vino_id").eq("id", previo.entidad_id).maybeSingle(), "leer añada");
      if (a) [anadaId, vinoId] = [a.id, a.vino_id];
    } else if (decision?.tipo === "asociar" && decision.entidad === "vino") {
      vinoId = decision.id;
    } else if (decision?.tipo === "asociar" && decision.entidad === "anada") {
      const a = sinError(await this.db.from("anadas").select("id, vino_id").eq("id", decision.id).maybeSingle(), "leer añada");
      if (a) [anadaId, vinoId] = [a.id, a.vino_id];
    }

    let creado = false;
    if (!vinoId) {
      // Vino de otra D.O. que no está en la tabla, o de una bodega con varias D.O. sin pista: a revisión.
      if (decisionDo.estado === "revision") {
        await this.guardarRegistro({ ...base, datos: { vino: v, emparejamiento: { motivo: decisionDo.motivo, denominacion: decisionDo.deteccion } }, entidadTipo: null, entidadId: null, estado: "revision", confianza: 0 });
        return "revision";
      }
      if (!v.tipo) {
        await this.guardarRegistro({ ...base, datos: { vino: v, emparejamiento: { motivo: "tipo_desconocido" } }, entidadTipo: null, entidadId: null, estado: "revision", confianza: 0 });
        return "revision";
      }
      const m = this.vinos.emparejar(
        { bodegaId, nombre: v.nombre, tipo: v.tipo, crianza: v.crianza, ean: v.ean },
        { sinParecidos: decision?.tipo === "crear" },
      );
      if (m.estado === "suprimido") {
        await this.guardarRegistro({ ...base, datos: { vino: v }, hechos: [], entidadTipo: null, entidadId: null, estado: "descartado", supresionId: m.supresionId });
        return "descartado";
      }
      if (m.estado === "revision") {
        await this.guardarRegistro({ ...base, datos: { vino: v, emparejamiento: m }, entidadTipo: null, entidadId: null, estado: "revision", confianza: m.candidatos[0]?.puntuacion ?? null });
        return "revision";
      }
      vinoId = m.vinoId;
      if (!vinoId) {
        vinoId = await this.crearVino(v, bodegaId, fuenteId, den?.id ?? null);
        creado = true;
      }
    }

    let anadaNueva = false;
    if (!anadaId) {
      const suprimida = this.anadasSuprimidas.get(`${vinoId}|${v.anio ?? "null"}`);
      if (suprimida) {
        await this.guardarRegistro({ ...base, datos: { vino: v }, hechos: [], entidadTipo: null, entidadId: null, estado: "descartado", supresionId: suprimida });
        return "descartado";
      }
      const existe = sinError(
        await this.db.from("anadas").select("id").eq("vino_id", vinoId).filter("anio", v.anio == null ? "is" : "eq", v.anio == null ? null : v.anio).maybeSingle(),
        "buscar añada",
      );
      if (existe) anadaId = existe.id;
      else {
        anadaId = sinError(await this.db.from("anadas").insert({ vino_id: vinoId, anio: v.anio }).select("id").single(), "crear añada").id;
        anadaNueva = true;
      }
    }

    const registroId = await this.guardarRegistro({ ...base, datos: { vino: v }, entidadTipo: "anada", entidadId: anadaId, estado: "emparejado" });
    const aporte: Aporte = { registroId, fuenteId, tipoFuente: "bodega", url: v.url, observadoEn: ahora };
    let cambios = false;
    // La web oficial es la fuente de más rango para tipo y crianza; el nombre solo se fija al crear.
    const camposVino: Record<string, unknown> = { tipo: v.tipo, crianza: v.crianza };
    // La D.O. se consolida en cada pasada (corrige la principal de la bodega puesta en la fase A);
    // si la decisión es dudosa, esta fuente no opina sobre ella.
    if (decisionDo.estado !== "revision") camposVino.denominacion_id = den?.id ?? null;
    if (creado) camposVino.nombre = v.nombre;
    if ((await this.consolidador.consolidar("vino", vinoId, camposVino, aporte)).escritos.length) cambios = true;
    const camposAnada = { grado: v.grado, meses_crianza: v.barrica_meses, temp_servicio_min: v.temp_min, temp_servicio_max: v.temp_max };
    if ((await this.consolidador.consolidar("anada", anadaId, camposAnada, aporte)).escritos.length) cambios = true;
    const antes = (previo?.datos as { vino?: VinoSitio } | null)?.vino?.variedades;
    if (await this.guardarVariedades(anadaId, v, anadaNueva ? null : antes)) cambios = true;
    if (v.ean) {
      sinError(
        await this.db.from("codigos_ean").upsert({ ean: v.ean, vino_id: vinoId, anada_id: anadaId, fuente_id: fuenteId }, { onConflict: "ean", ignoreDuplicates: true }),
        "guardar EAN",
      );
      this.vinos.anadirEan(v.ean, vinoId, bodegaId);
    }
    for (const campo of ["elaboracion", "cata"] as const) {
      if (await this.resumidor.resumir("anada", anadaId, campo)) cambios = true;
    }
    const nombreBodega = this.bodegas.find((b) => b.id === bodegaId)?.nombre ?? "la bodega";
    if (v.imagen && (await this.guardarImagen({ anada_id: anadaId }, v.imagen, fuenteId, nombreBodega))) cambios = true;
    if (creado || anadaNueva) return "nuevo";
    return cambios || !igualesJson((previo?.datos as { vino?: unknown } | null)?.vino, json(v)) ? "actualizado" : "sin_cambios";
  }

  private async crearVino(v: VinoSitio, bodegaId: string, fuenteId: string, denominacionId: string | null): Promise<string> {
    const base = slugify(v.nombre) || "vino";
    const bodega = this.bodegas.find((b) => b.id === bodegaId)?.slug ?? "bodega";
    const candidatos = [base, `${bodega}-${base}`, ...Array.from({ length: 49 }, (_, i) => `${bodega}-${base}-${i + 2}`)];
    const { id } = await insertarConSlug(
      this.db,
      "vinos",
      { bodega_id: bodegaId, nombre: v.nombre, tipo: v.tipo, crianza: v.crianza, denominacion_id: denominacionId, fuente_id: fuenteId },
      candidatos,
      this.slugsVino,
    );
    this.vinos.anadir({ id, bodegaId, nombre: v.nombre, tipo: v.tipo, crianza: v.crianza });
    this.bodegaDeVino.set(id, bodegaId);
    return id;
  }

  /**
   * Composición de la web: solo se escribe si cambió respecto a lo que esta fuente dio la vez
   * anterior (o la añada es nueva). Sin porcentaje no se pisa uno que ya exista.
   */
  private async guardarVariedades(anadaId: string, v: VinoSitio, antes: VinoSitio["variedades"] | null | undefined): Promise<boolean> {
    if (antes && igualesJson(antes, v.variedades)) return false;
    const actuales = sinError(await this.db.from("anada_variedades").select("variedad_id, porcentaje").eq("anada_id", anadaId), "leer variedades de la añada");
    const filas: { anada_id: string; variedad_id: string; porcentaje: number | null }[] = [];
    for (const x of v.variedades) {
      const id = this.idVariedad(x.nombre);
      if (!id) {
        this.log.warn(`Variedad desconocida «${x.nombre}» (se omite)`);
        continue;
      }
      const actual = actuales.find((a) => a.variedad_id === id);
      if (x.porcentaje == null && actual) continue;
      if (actual && Number(actual.porcentaje) === x.porcentaje) continue;
      filas.push({ anada_id: anadaId, variedad_id: id, porcentaje: x.porcentaje });
    }
    if (filas.length === 0) return false;
    sinError(await this.db.from("anada_variedades").upsert(filas, { onConflict: "anada_id,variedad_id" }), "guardar variedades de la añada");
    return true;
  }

  private async guardarServicio(s: ServicioSitio, fuenteId: string, bodegaId: string, vistos: Set<string>): Promise<"nuevo" | "actualizado" | "sin_cambios" | "descartado"> {
    const clave = claveTexto(s.titulo);
    const idExterno = `servicio:${s.tipo}:${slugify(s.titulo)}`;
    const ahora = new Date().toISOString();
    const hechos = hechosServicio(s, fuenteId, ahora);
    const previo = await this.registroPrevio(fuenteId, idExterno);
    const decision = decisionAdmin(previo);
    const suprimido = this.serviciosSuprimidos.find(
      (x) => x.claves.bodega_id === bodegaId && x.claves.tipo === s.tipo && typeof x.claves.titulo === "string" && claveTexto(x.claves.titulo) === clave,
    );
    if (decision?.tipo === "suprimido" || decision?.tipo === "descartar" || suprimido) {
      await this.guardarRegistro({
        fuenteId, idExterno, url: s.url, datos: { servicio: s }, hechos: [], entidadTipo: null, entidadId: null,
        estado: "descartado", supresionId: suprimido?.id ?? null,
      });
      return "descartado";
    }
    let servicioId = previo?.entidad_tipo === "servicio_bodega" ? previo.entidad_id : null;
    let nuevo = false;
    if (!servicioId) {
      const existentes = sinError(await this.db.from("servicios_bodega").select("id, tipo, titulo").eq("bodega_id", bodegaId), "leer servicios");
      servicioId = existentes.find((x) => x.tipo === s.tipo && claveTexto(x.titulo) === clave)?.id ?? null;
      if (!servicioId) {
        servicioId = sinError(
          await this.db.from("servicios_bodega").insert({ bodega_id: bodegaId, tipo: s.tipo, titulo: s.titulo, fuente_id: fuenteId }).select("id").single(),
          "crear servicio",
        ).id;
        nuevo = true;
      }
    }
    vistos.add(servicioId);
    const registroId = await this.guardarRegistro({
      fuenteId, idExterno, url: s.url, datos: { servicio: s }, hechos, entidadTipo: "servicio_bodega", entidadId: servicioId, estado: "emparejado",
    });
    const { escritos } = await this.consolidador.consolidar(
      "servicio_bodega",
      servicioId,
      {
        precio_desde: s.precio_desde, duracion_minutos: s.duracion_minutos, idiomas: s.idiomas, url_reserva: s.url_reserva,
        descripcion: s.descripcion, horario: [s.horario, s.temporada].filter(Boolean).join(" · ") || null, activo: true,
      },
      { registroId, fuenteId, tipoFuente: "bodega", url: s.url, observadoEn: ahora },
    );
    if (nuevo) return "nuevo";
    return escritos.length || !igualesJson((previo?.datos as { servicio?: unknown } | null)?.servicio, json(s)) ? "actualizado" : "sin_cambios";
  }
}
