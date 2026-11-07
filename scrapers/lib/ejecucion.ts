// Ciclo de vida de una ejecución: registro en ejecuciones_scraper, contadores,
// estado final y salida JSON en --dry-run.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { crearClienteDb, sinError, type ClienteDb } from "./db.ts";
import { ClienteHttp, ParadaFuente } from "./http.ts";
import { Log } from "./log.ts";
import { RobotsDenegado } from "./robots.ts";

export interface Contadores {
  nuevos: number;
  actualizados: number;
  sinCambios: number;
  descartados: number;
  /** Fichas que no superan el umbral de emparejamiento (cola de revisión del admin). */
  revision: number;
  errores: number;
}

export interface Contexto {
  fuenteSlug: string;
  dryRun: boolean;
  /** Máximo de fichas a procesar (null = todas). */
  limite: number | null;
  http: ClienteHttp;
  log: Log;
  /** null en --dry-run. */
  db: ClienteDb | null;
  /** id de la fila de `fuentes` (null en --dry-run). */
  fuenteId: string | null;
  contadores: Contadores;
  /** JSON de un dry-run de Ribera con las bodegas para emparejar en --dry-run. */
  rutaBodegas: string | null;
  /** Resultado normalizado de cada ficha, para el JSON de --dry-run. */
  salida: unknown[];
  /** La ejecución terminará como 'parcial' aunque no haya errores de ficha. */
  marcarParcial(motivo: string): void;
}

export type Scraper = (ctx: Contexto) => Promise<void>;

export interface OpcionesEjecucion {
  dryRun: boolean;
  limite: number | null;
  rutaSalida?: string;
  rutaBodegas?: string;
  verbose?: boolean;
  /** Para tests: cliente HTTP ya construido. */
  http?: ClienteHttp;
}

type Estado = "ok" | "parcial" | "error";

/** URL de la ejecución de GitHub Actions, si estamos en Actions. */
export function urlEjecucionActions(env: NodeJS.ProcessEnv = process.env): string | null {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return null;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

/** Ejecuta un scraper y devuelve el código de salida del proceso. */
export async function ejecutar(
  fuenteSlug: string,
  scraper: Scraper,
  opciones: OpcionesEjecucion,
): Promise<number> {
  const log = new Log({ verbose: opciones.verbose });
  const inicio = new Date();
  const motivosParcial: string[] = [];
  const ctx: Contexto = {
    fuenteSlug,
    dryRun: opciones.dryRun,
    limite: opciones.limite,
    http: opciones.http ?? new ClienteHttp({ log }),
    log,
    db: null,
    fuenteId: null,
    contadores: { nuevos: 0, actualizados: 0, sinCambios: 0, descartados: 0, revision: 0, errores: 0 },
    rutaBodegas: opciones.rutaBodegas ?? null,
    salida: [],
    marcarParcial(motivo) {
      log.warn(motivo);
      motivosParcial.push(motivo);
    },
  };

  log.info(
    `Fuente ${fuenteSlug}${opciones.dryRun ? " (dry-run: no se toca la BD)" : ""}` +
      (opciones.limite != null ? `, límite ${opciones.limite}` : ""),
  );

  let ejecucionId: string | null = null;
  if (!opciones.dryRun) {
    ctx.db = crearClienteDb();
    const fuente = sinError(
      await ctx.db.from("fuentes").select("id, activa").eq("slug", fuenteSlug).maybeSingle(),
      "leer fuente",
    );
    if (!fuente) throw new Error(`No existe la fuente '${fuenteSlug}' (¿falta la migración de semillas?)`);
    if (!fuente.activa) {
      log.warn(`La fuente '${fuenteSlug}' está desactivada; no se ejecuta.`);
      return 0;
    }
    ctx.fuenteId = fuente.id;
    const ejecucion = sinError(
      await ctx.db
        .from("ejecuciones_scraper")
        .insert({ fuente_id: fuente.id, inicio: inicio.toISOString(), run_url: urlEjecucionActions() })
        .select("id")
        .single(),
      "crear ejecución",
    );
    ejecucionId = ejecucion.id;
  }

  let estado: Estado;
  try {
    await scraper(ctx);
    estado = ctx.contadores.errores > 0 || motivosParcial.length > 0 ? "parcial" : "ok";
  } catch (e) {
    estado = "error";
    if (e instanceof ParadaFuente || e instanceof RobotsDenegado) {
      log.error(`Fuente detenida: ${e.message}`);
    } else {
      log.error(`Error inesperado: ${(e as Error).stack ?? String(e)}`);
    }
  }

  const fin = new Date();
  const c = ctx.contadores;
  log.info(
    `Fin (${estado}): ${c.nuevos} nuevos, ${c.actualizados} actualizados, ${c.sinCambios} sin cambios, ` +
      `${c.descartados} descartados, ${c.revision} a revisión, ${c.errores} errores; ${ctx.http.peticiones} peticiones en ` +
      `${Math.round((fin.getTime() - inicio.getTime()) / 1000)} s`,
  );

  if (ctx.db && ejecucionId) {
    const r = await ctx.db
      .from("ejecuciones_scraper")
      .update({
        fin: fin.toISOString(),
        estado,
        nuevos: c.nuevos,
        actualizados: c.actualizados,
        errores: c.errores,
        log: log.texto(),
      })
      .eq("id", ejecucionId);
    if (r.error) {
      log.error(`No se pudo cerrar la ejecución: ${r.error.message}`);
      estado = "error";
    }
  }

  if (opciones.dryRun) {
    const ruta = resolve(
      opciones.rutaSalida ??
        `scrapers/out/${fuenteSlug}-${inicio.toISOString().replace(/[:.]/g, "-")}.json`,
    );
    await mkdir(dirname(ruta), { recursive: true });
    const json = {
      fuente: fuenteSlug,
      dry_run: true,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      estado,
      motivos_parcial: motivosParcial,
      contadores: c,
      peticiones: ctx.http.peticiones,
      registros: ctx.salida,
    };
    await writeFile(ruta, JSON.stringify(json, null, 2) + "\n");
    log.info(`Salida del dry-run: ${ruta}`);
  }

  // parcial también sale con código ≠ 0 para que Actions avise.
  return estado === "ok" ? 0 : estado === "parcial" ? 2 : 1;
}
