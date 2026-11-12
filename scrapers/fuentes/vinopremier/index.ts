// Scraper de Vinopremier (tienda Magento), categorías D.O. Ribera del Duero y Rioja.
// extraer (listado ?p=N + fichas) → normalizar → emparejar (EAN primero, luego bodega + nombre) → guardar.
// Una tienda no crea bodegas: si la bodega no existe, la ficha va a la cola de revisión.
import { registrosConocidos } from "../../lib/db.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ClienteHttp, ParadaFuente } from "../../lib/http.ts";
import { LimitadorPorHost } from "../../lib/rate-limit.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { GuardadoVinopremier } from "./guardar.ts";
import { normalizarVino } from "./normalizar.ts";
import { CATEGORIAS, parsearFicha, parsearListado, urlListado, type Categoria, type TarjetaVp } from "./parsear.ts";
import { prepararCatalogo, procesarVino } from "./procesar.ts";

export { catalogoDesdeDryRun, resolverBodega, type SnapshotCatalogo } from "./procesar.ts";

export const SLUG_FUENTE = "vinopremier";

// Ribera tiene 369 productos (24 por página → 16 páginas); el tope protege de un paginador anómalo.
const MAX_PAGINAS = 40;
/** Tope de peticiones por ejecución (listados + fichas + robots): ~387 productos hoy. */
export const MAX_PETICIONES = 450;
/** Pausa entre peticiones: ≥10 s tras el incidente de bloqueo de IP del 2026-11-08. */
export const PAUSA_MS = { minMs: 10_000, maxMs: 14_000 };

interface TarjetaCat extends TarjetaVp {
  categoria: Categoria;
}

async function listar(ctx: Contexto): Promise<TarjetaCat[]> {
  const tarjetas: TarjetaCat[] = [];
  const vistas = new Set<string>();
  for (const categoria of CATEGORIAS) {
    let maxPagina = 1;
    for (let pagina = 1; pagina <= Math.min(maxPagina, MAX_PAGINAS); pagina++) {
      const listado = parsearListado((await ctx.http.get(urlListado(categoria, pagina))).texto, categoria);
      maxPagina = Math.max(maxPagina, listado.maxPagina ?? 0);
      const nuevas = listado.tarjetas.filter((t) => !vistas.has(t.url));
      if (nuevas.length === 0) {
        ctx.log.info(`${categoria.nombre}: página ${pagina} sin productos nuevos; fin del listado`);
        break;
      }
      for (const t of nuevas) {
        vistas.add(t.url);
        tarjetas.push({ ...t, categoria });
      }
      if (ctx.limite != null && tarjetas.length >= ctx.limite) return tarjetas.slice(0, ctx.limite);
    }
    if (maxPagina > MAX_PAGINAS) ctx.marcarParcial(`Paginador anómalo en ${categoria.nombre}: ${maxPagina} páginas`);
    ctx.log.info(`${categoria.nombre}: ${tarjetas.filter((t) => t.categoria === categoria).length} productos`);
  }
  return tarjetas;
}

export async function scraperVinopremier(ctx: Contexto): Promise<void> {
  // Ritmo propio, más lento que el de las demás fuentes (salvo que ya venga uno inyectado).
  if (ctx.http.peticiones === 0 && ctx.http instanceof ClienteHttp) {
    ctx.http = new ClienteHttp({ log: ctx.log, limitador: new LimitadorPorHost(PAUSA_MS) });
  }
  // robots.txt: cada categoría y su paginación ?p=N deben seguir permitidas.
  for (const c of CATEGORIAS) {
    await ctx.http.comprobarRobots(urlListado(c, 1));
    await ctx.http.comprobarRobots(urlListado(c, 2));
  }

  const inicio = new Date();
  const catalogo = await prepararCatalogo(ctx, (db, fuenteId, log) => new GuardadoVinopremier(db, fuenteId, log));

  const tarjetas = await listar(ctx);

  if (ctx.db && ctx.limite == null) {
    const conocidos = await registrosConocidos(ctx.db, ctx.fuenteId!);
    if (conocidos > 0 && tarjetas.length < conocidos * 0.5) {
      ctx.marcarParcial(`Volumen anómalo: ${tarjetas.length} productos frente a ${conocidos} conocidos`);
    }
  }

  for (const tarjeta of tarjetas) {
    if (ctx.http.peticiones >= MAX_PETICIONES) {
      ctx.marcarParcial(`Tope de ${MAX_PETICIONES} peticiones alcanzado; se detiene la ejecución`, { esperado: true });
      break;
    }
    try {
      const res = await ctx.http.get(tarjeta.url);
      const n = normalizarVino(parsearFicha(res.texto, tarjeta.url), tarjeta.categoria);

      await procesarVino(ctx, catalogo, n);
    } catch (e) {
      // Las URLs de entrada ya se comprobaron al empezar: una ficha suelta que
      // robots.txt no permite se salta (respetándolo) sin detener la fuente.
      if (e instanceof RobotsDenegado) {
        ctx.contadores.omitidas++;
        ctx.log.warn(`Omitida por robots.txt: ${tarjeta.url}`);
        continue;
      }
      if (e instanceof ParadaFuente) throw e;
      ctx.contadores.errores++;
      ctx.log.error(`${tarjeta.url}: ${(e as Error).message}`);
    }
  }

  // Solo una ejecución completa puede dar ofertas por no vistas.
  await catalogo.ofertas?.cerrar(inicio, { completa: ctx.limite == null && ctx.contadores.errores === 0 && !ctx.esParcial() });
}
