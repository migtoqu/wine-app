// Concours Mondial de Bruxelles: medallas de vinos españoles por edición.
// 1. Recorre el listado /es/resultados/<edición>?search[country]=Spain siguiendo rel="next".
// 2. Empareja cada tarjeta con un vino del catálogo (bodega por productor + nombre del vino).
// 3. Guarda el premio (medalla, distinción y trofeo, añada, edición y enlace) y su registro.
// Solo el listado: nunca las fichas (notas de cata) ni las imágenes. Crawl-delay de 10 s.
import { readFile } from "node:fs/promises";
import { bodegaCatalogoDeFila, COLUMNAS_EMPAREJAR_BODEGA, type BodegaCatalogo } from "../../emparejamiento/entidades.ts";
import { aSupresionBodega, aSupresionVino, cargarSupresiones } from "../../lib/consolidacion/supresiones.ts";
import { sinError, type ClienteDb } from "../../lib/db.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ClienteHttp } from "../../lib/http.ts";
import { cargarMarcasCR } from "../../lib/marcas.ts";
import {
  EmparejadorPremios, GuardadoPremios, separarAnada, tipoDeNombre, type PremioLeido, type ResultadoPremio, type VinoPremiable,
} from "../../lib/premios.ts";
import { LimitadorPorHost } from "../../lib/rate-limit.ts";
import { parsearListado, urlListado, type TarjetaCmb } from "./parsear.ts";

export const SLUG_FUENTE = "concours-mondial-bruxelles";
export const SLUG_CERTAMEN = "concours-mondial-bruxelles";

/** Primera edición con resultados publicados en results.concoursmondial.com. */
export const PRIMERA_EDICION = 2019;
/** Tope de páginas por edición (hoy ~37 para España). */
const MAX_PAGINAS = 120;

/** `--ediciones 2019-2026` o `2025,2026`; por defecto, la del año y la anterior (las que cambian). */
export function edicionesDe(opcion: string | undefined, hoy = new Date()): number[] {
  const actual = hoy.getUTCFullYear();
  if (!opcion) return [actual - 1, actual];
  if (opcion === "todas") opcion = `${PRIMERA_EDICION}-${actual}`;
  const out = new Set<number>();
  for (const parte of opcion.split(",")) {
    const m = parte.trim().match(/^(\d{4})(?:-(\d{4}))?$/);
    if (!m) throw new Error(`--ediciones: «${parte}» no es un año ni un rango (2019-2026)`);
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
    for (let y = Math.min(a, b); y <= Math.max(a, b); y++) out.add(y);
  }
  return [...out].sort();
}

export function premioDeTarjeta(t: TarjetaCmb, edicion: number): PremioLeido {
  const { nombre, anio } = separarAnada(t.titulo);
  return {
    idExterno: `${edicion}-${t.id}`,
    url: t.url,
    nombre,
    anio,
    edicion,
    medalla: t.medalla,
    puntos: null,
    distincion: t.distincion || null,
    mencion: t.mencion,
    productor: t.productor,
    denominacion: t.denominacion,
    tipo: tipoDeNombre(nombre, t.categoria),
    crudo: { ...t },
  };
}

async function todas<T>(leer: (desde: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, que: string): Promise<T[]> {
  const out: T[] = [];
  for (let d = 0; ; d += 1000) {
    const filas = sinError(await leer(d), que) ?? [];
    out.push(...filas);
    if (filas.length < 1000) return out;
  }
}

/** Catálogo de la BD: bodegas (con marcas del C.R.), vinos con su D.O. y supresiones. */
async function catalogoDeBd(db: ClienteDb): Promise<{ emp: EmparejadorPremios; vinos: string[] }> {
  const [filasB, filasV, marcas, supB, supV] = await Promise.all([
    todas((d) => db.from("bodegas").select(COLUMNAS_EMPAREJAR_BODEGA).order("id").range(d, d + 999), "leer bodegas"),
    todas((d) => db.from("vinos").select("id, bodega_id, nombre, tipo, crianza, denominacion:denominaciones(nombre)").order("id").range(d, d + 999), "leer vinos"),
    cargarMarcasCR(db),
    cargarSupresiones(db, "bodega"),
    cargarSupresiones(db, "vino"),
  ]);
  const bodegas = filasB.map((b) => ({ ...bodegaCatalogoDeFila(b), marcas: marcas.get(b.id) ?? [] }));
  const vinos: VinoPremiable[] = filasV.map((v) => ({
    id: v.id, bodegaId: v.bodega_id, nombre: v.nombre, tipo: v.tipo, crianza: v.crianza,
    denominacion: (v.denominacion as { nombre: string } | null)?.nombre ?? null,
  }));
  const emp = new EmparejadorPremios(bodegas, vinos, {
    bodegas: supB.map(aSupresionBodega).filter((x) => x !== null),
    vinos: supV.map(aSupresionVino).filter((x) => x !== null),
  });
  return { emp, vinos: vinos.map((v) => v.id) };
}

/** `--bodegas`: instantánea `{ bodegas: BodegaCatalogo[], vinos: VinoPremiable[] }` (dry-run). */
async function catalogoDeJson(ruta: string): Promise<EmparejadorPremios> {
  const json = JSON.parse(await readFile(ruta, "utf8")) as { bodegas?: BodegaCatalogo[]; vinos?: VinoPremiable[] };
  return new EmparejadorPremios(json.bodegas ?? [], json.vinos ?? []);
}

export async function scraperConcoursMondial(ctx: Contexto): Promise<void> {
  // Crawl-delay: 10 en concoursmondial.com; se aplica también al subdominio de resultados.
  if (ctx.http.peticiones === 0 && ctx.http instanceof ClienteHttp) {
    ctx.http = new ClienteHttp({ log: ctx.log, limitador: new LimitadorPorHost({ minMs: 10_000, maxMs: 12_000 }) });
  }
  const ediciones = edicionesDe(ctx.opciones.ediciones);
  ctx.log.info(`Ediciones: ${ediciones.join(", ")}`);
  await ctx.http.comprobarRobots(urlListado(ediciones[0]!, 2));

  let emp: EmparejadorPremios;
  let guardado: GuardadoPremios | null = null;
  if (ctx.db) {
    guardado = new GuardadoPremios(ctx.db, ctx.fuenteId!, ctx.log, ctx.contadores);
    let vinos: string[] = [];
    emp = await guardado.preparar(SLUG_CERTAMEN, async (db) => {
      const c = await catalogoDeBd(db);
      vinos = c.vinos;
      return c.emp;
    });
    guardado.conocerVinos(vinos);
  } else {
    if (!ctx.rutaBodegas) ctx.log.warn("Dry-run sin --bodegas: no hay catálogo con el que emparejar (todo quedará pendiente)");
    emp = ctx.rutaBodegas ? await catalogoDeJson(ctx.rutaBodegas) : new EmparejadorPremios([], []);
  }

  let leidos = 0;
  const vistos = new Set<string>();
  for (const edicion of ediciones) {
    let url: string | null = urlListado(edicion);
    let paginas = 0;
    let enEdicion = 0;
    while (url && paginas < MAX_PAGINAS) {
      paginas++;
      const listado = parsearListado((await ctx.http.get(url)).texto);
      if (paginas === 1 && listado.tarjetas.length === 0) {
        ctx.log.warn(`Edición ${edicion}: sin resultados de España (¿aún no publicada?)`);
        break;
      }
      const lote: { p: PremioLeido; r: ResultadoPremio | { estado: "descartado"; motivo: string } }[] = [];
      for (const t of listado.tarjetas) {
        if (ctx.limite != null && leidos >= ctx.limite) break;
        const p = premioDeTarjeta(t, edicion);
        if (vistos.has(p.idExterno)) continue;
        vistos.add(p.idExterno);
        leidos++;
        enEdicion++;
        if (!t.medalla && !/merit/i.test(t.distincion)) ctx.log.warn(`Distinción desconocida: «${t.distincion}» (${t.url})`);
        const r = guardado ? guardado.resolver(p, emp) : emp.emparejar(p);
        lote.push({ p, r });
        if (!guardado) {
          ctx.salida.push({ premio: { ...p, crudo: undefined }, emparejamiento: r });
          if (r.estado === "emparejado") ctx.contadores.nuevos++;
          else if (r.estado === "revision") ctx.contadores.revision++;
        }
        ctx.log.debug(`${edicion} ${t.distincion}: ${t.titulo} (${t.productor ?? "?"}) → ${r.estado} (${r.motivo})`);
      }
      if (guardado) await guardado.guardarLote(lote);
      if (ctx.limite != null && leidos >= ctx.limite) return;
      url = listado.siguiente;
    }
    if (url) ctx.marcarParcial(`Edición ${edicion}: más de ${MAX_PAGINAS} páginas; se corta`);
    ctx.log.info(`Edición ${edicion}: ${enEdicion} premios en ${paginas} páginas`);
  }
  if (guardado) {
    ctx.log.info(`Resumen: ${leidos} premios leídos, ${guardado.resumen.emparejados} con vino del catálogo, ` +
      `${ctx.contadores.revision} a revisión, ${guardado.resumen.pendientes} pendientes (vino o bodega fuera del catálogo)`);
  } else {
    const emparejados = ctx.contadores.nuevos;
    ctx.log.info(`Resumen (dry-run): ${leidos} premios, ${emparejados} emparejados, ${ctx.contadores.revision} a revisión, ` +
      `${leidos - emparejados - ctx.contadores.revision} pendientes`);
  }
}
