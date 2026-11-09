// Comprobador semanal de enlaces (§8): imágenes enlazadas, webs de bodegas,
// enlaces de reserva y de procedencia. Sincroniza comprobaciones_enlace con
// las URLs vigentes, comprueba las más antiguas primero y registra cada
// resultado; la BD oculta un enlace tras 2 fallos seguidos y lo reactiva con
// el siguiente OK (registrar_comprobacion_enlace + trigger).
//
// Contadores de la ejecución: nuevos = enlaces que pasan a ocultos,
// actualizados = enlaces reactivados, sinCambios = OK, descartados = fallos
// que aún no ocultan, omitidas = inconclusos (robots.txt, 401/403/429) y
// pendientes por presupuesto; errores = fallos al escribir en la BD.
import { readFile } from "node:fs/promises";
import { crearClienteDb, sinError, type ClienteDb } from "../lib/db.ts";
import type { Contexto } from "../lib/ejecucion.ts";
import { Comprobador, comprobarTodos, type Resultado } from "./comprobar.ts";

export const SLUG_FUENTE = "comprobador-enlaces";
const PRESUPUESTO_MIN = 150;
const PAGINA = 1000;

interface Enlace {
  id: string | null;
  url: string;
  oculto: boolean;
  fallos: number;
}

async function leerPendientes(db: ClienteDb, limite: number | null): Promise<Enlace[]> {
  const out: Enlace[] = [];
  for (let desde = 0; limite == null || out.length < limite; desde += PAGINA) {
    const hasta = desde + PAGINA - 1;
    const filas = sinError(
      await db
        .from("comprobaciones_enlace")
        .select("id, url, oculto, fallos_consecutivos")
        .neq("modo", "ignorado")
        .order("ultima_comprobacion", { ascending: true, nullsFirst: true })
        .order("id")
        .range(desde, hasta),
      "leer comprobaciones_enlace",
    );
    for (const f of filas) out.push({ id: f.id, url: f.url, oculto: f.oculto, fallos: f.fallos_consecutivos });
    if (filas.length < PAGINA) break;
  }
  return limite == null ? out : out.slice(0, limite);
}

/** --urls en dry-run: fichero (una URL por línea) o lista separada por comas. */
async function urlsDeOpcion(valor: string): Promise<string[]> {
  const texto = /^https?:\/\//i.test(valor) ? valor.replace(/,/g, "\n") : await readFile(valor, "utf8");
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));
}

export async function scraperComprobadorEnlaces(ctx: Contexto): Promise<void> {
  const { log, contadores: c } = ctx;
  const minutos = ctx.opciones.presupuestoMin ? Number(ctx.opciones.presupuestoMin) : PRESUPUESTO_MIN;
  if (!Number.isFinite(minutos) || minutos <= 0) throw new Error("--presupuesto-min debe ser un número positivo");
  const limiteTiempo = Date.now() + minutos * 60_000;

  let enlaces: Enlace[];
  if (ctx.db) {
    const [s] = sinError(await ctx.db.rpc("sincronizar_comprobaciones_enlace"), "sincronizar enlaces");
    log.info(`Sincronización: ${s?.total ?? 0} enlaces vigentes, ${s?.nuevos ?? 0} nuevos, ${s?.borrados ?? 0} retirados`);
    enlaces = await leerPendientes(ctx.db, ctx.limite);
  } else if (ctx.opciones.urls) {
    enlaces = (await urlsDeOpcion(ctx.opciones.urls)).map((url) => ({ id: null, url, oculto: false, fallos: 0 }));
    if (ctx.limite != null) enlaces = enlaces.slice(0, ctx.limite);
  } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // dry-run con credenciales: solo lectura (sin sincronizar ni registrar).
    enlaces = await leerPendientes(crearClienteDb(), ctx.limite);
  } else {
    throw new Error("En --dry-run hace falta --urls (fichero o lista) o las credenciales de Supabase para leer");
  }
  log.info(`${enlaces.length} enlaces a comprobar; presupuesto ${minutos} min`);

  const comprobador = new Comprobador({ log });
  const { comprobados, pendientes } = await comprobarTodos(
    comprobador,
    enlaces,
    async (e, r) => {
      if (!r) {
        c.omitidas++;
        return;
      }
      const ahoraOculto = await registrar(ctx, e, r);
      if (r.resultado === "ok") {
        if (e.oculto && ahoraOculto === false) c.actualizados++;
        else c.sinCambios++;
      } else if (r.resultado === "fallo") {
        if (!e.oculto && ahoraOculto === true) c.nuevos++;
        else c.descartados++;
        log.info(`Fallo: ${e.url} (${r.error ?? r.http})`);
      } else {
        c.omitidas++;
        log.debug(`Inconcluso: ${e.url} (${r.error ?? r.http})`);
      }
      ctx.salida.push({ url: e.url, ...r, oculto: ahoraOculto });
    },
    { seguir: () => Date.now() < limiteTiempo },
  );
  log.info(
    `${comprobados} comprobados, ${pendientes} pendientes (host pausado o presupuesto agotado); ` +
      `${comprobador.peticiones} peticiones del comprobador`,
  );
  if (Date.now() >= limiteTiempo && pendientes > 0) {
    log.warn(`Presupuesto de ${minutos} min agotado: ${pendientes} enlaces quedan para la próxima ejecución`);
  }
}

/** Guarda el resultado; devuelve si el enlace queda oculto (null en dry-run o si falla). */
async function registrar(ctx: Contexto, e: Enlace, r: Resultado): Promise<boolean | null> {
  if (!ctx.db || !e.id) {
    // dry-run: misma regla que la BD (2 fallos seguidos ocultan; OK reactiva).
    if (r.resultado === "ok") return false;
    if (r.resultado === "fallo") return e.fallos + 1 >= 2;
    return e.oculto;
  }
  const res = await ctx.db.rpc("registrar_comprobacion_enlace", {
    p_id: e.id,
    p_resultado: r.resultado,
    p_http: r.http ?? undefined,
    p_error: r.error ?? undefined,
    p_url_final: r.urlFinal ?? undefined,
    p_metodo: r.metodo,
  });
  if (res.error) {
    ctx.contadores.errores++;
    ctx.log.error(`No se pudo registrar ${e.url}: ${res.error.message}`);
    return null;
  }
  return res.data?.[0]?.oculto ?? null;
}
