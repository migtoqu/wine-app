// Scraper de tienda parametrizado por plataforma (Magento, WooCommerce, PrestaShop y Vinatis):
// listados de las categorías de D.O. → fichas (o el JSON del listado) → normalizar → emparejar
// (EAN primero, luego bodega + nombre) → guardar con el núcleo de Vinopremier y dejar la oferta.
// Una tienda no crea bodegas: si la bodega no existe, la ficha va a la cola de revisión.
import { registrosConocidos } from "../../lib/db.ts";
import type { Contexto, Scraper } from "../../lib/ejecucion.ts";
import { ClienteHttp, ParadaFuente } from "../../lib/http.ts";
import { LimitadorPorHost } from "../../lib/rate-limit.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { PlantillasEsEn } from "../../lib/consolidacion/plantillas.ts";
import { GuardadoVinopremier } from "../vinopremier/guardar.ts";
import { prepararCatalogo, procesarVino } from "../vinopremier/procesar.ts";
import { TIENDAS } from "./config.ts";
import { parsearFichaEstructurada } from "./estructurados.ts";
import { parsearListado, urlListado } from "./listados.ts";
import { DENOMINACIONES_FOCO, normalizarFichaTienda } from "./normalizar.ts";
import type { CategoriaTienda, ConfigTienda, FichaTienda, TarjetaTienda } from "./tipos.ts";
import { paginaVinatis } from "./vinatis.ts";

export type { ConfigTienda } from "./tipos.ts";

interface Entrada extends TarjetaTienda {
  categoria: CategoriaTienda;
  /** Ficha ya completa desde el listado (Vinatis). */
  ficha: FichaTienda | null;
}

/** ¿Queda presupuesto de peticiones? Si no, marca la ejecución como parcial. */
function quedaPresupuesto(ctx: Contexto, config: ConfigTienda): boolean {
  if (ctx.http.peticiones < config.maxPeticiones) return true;
  ctx.marcarParcial(`Tope de ${config.maxPeticiones} peticiones alcanzado; se detiene la ejecución`, { esperado: true });
  return false;
}

async function listar(ctx: Contexto, config: ConfigTienda): Promise<Entrada[]> {
  const entradas: Entrada[] = [];
  const vistas = new Set<string>();
  for (const categoria of config.categorias) {
    let maxPagina = 1;
    let enCategoria = 0;
    for (let pagina = 1; pagina <= Math.min(maxPagina, config.maxPaginas); pagina++) {
      if (!quedaPresupuesto(ctx, config)) return entradas;
      const res = await ctx.http.get(urlListado(config, categoria, pagina));
      // Vinatis pagina con `?page=N` en el servidor: si devuelve otra página, se para (no se adivina).
      if (config.plataforma === "vinatis" && pagina > 1 && paginaVinatis(res.texto) !== pagina) {
        ctx.marcarParcial(`${config.nombre}: ?page=${pagina} no pagina en ${categoria.nombre}`);
        break;
      }
      const pedida = urlListado(config, categoria, pagina);
      if (res.url !== pedida) ctx.log.warn(`${categoria.nombre}: ${pedida} redirige a ${res.url} (¿cambió la ruta?)`);
      const listado = parsearListado(res.texto, config, categoria);
      // Página 1 vacía en una categoría configurada: la web cambió o sirve otra cosa. Nunca es un
      // corte previsto, así que la ejecución sale en rojo (y no da ofertas por no vistas).
      if (pagina === 1 && listado.tarjetas.length === 0) {
        ctx.marcarParcial(`${config.nombre}: la página 1 de ${categoria.nombre} no tiene productos (¿cambió la web?)`);
        break;
      }
      maxPagina = Math.max(maxPagina, listado.maxPagina ?? 0);
      const fichas = new Map(listado.fichas.map((f) => [f.url, f]));
      const nuevas = listado.tarjetas.filter((t) => !vistas.has(t.url));
      if (nuevas.length === 0) {
        ctx.log.info(`${categoria.nombre}: página ${pagina} sin productos nuevos; fin del listado`);
        break;
      }
      for (const t of nuevas) {
        vistas.add(t.url);
        entradas.push({ ...t, categoria, ficha: fichas.get(t.url) ?? null });
        enCategoria++;
      }
      if (ctx.limite != null && entradas.length >= ctx.limite) return entradas.slice(0, ctx.limite);
    }
    if (maxPagina > config.maxPaginas) ctx.marcarParcial(`Paginador anómalo en ${categoria.nombre}: ${maxPagina} páginas`);
    ctx.log.info(`${categoria.nombre}: ${enCategoria} productos`);
  }
  return entradas;
}

export function crearScraperTienda(config: ConfigTienda): Scraper {
  return async (ctx) => {
    // Ritmo propio, lento (salvo que ya venga un cliente inyectado, p. ej. en tests).
    if (ctx.http.peticiones === 0 && ctx.http instanceof ClienteHttp) {
      ctx.http = new ClienteHttp({ log: ctx.log, limitador: new LimitadorPorHost(config.pausaMs) });
    }
    // robots.txt: cada categoría y su paginación deben seguir permitidas.
    for (const c of config.categorias) {
      await ctx.http.comprobarRobots(urlListado(config, c, 1));
      await ctx.http.comprobarRobots(urlListado(config, c, 2));
    }

    const inicio = new Date();
    const catalogo = await prepararCatalogo(
      ctx,
      (db, fuenteId, log) =>
        new GuardadoVinopremier(db, fuenteId, log, new PlantillasEsEn(), {
          denominaciones: DENOMINACIONES_FOCO,
          atribucion: config.nombre,
        }),
    );

    const entradas = await listar(ctx, config);

    if (ctx.db && ctx.limite == null) {
      const conocidos = await registrosConocidos(ctx.db, ctx.fuenteId!);
      if (conocidos > 0 && entradas.length < conocidos * 0.5) {
        ctx.marcarParcial(`Volumen anómalo: ${entradas.length} productos frente a ${conocidos} conocidos`);
      }
    }

    for (const e of entradas) {
      if (!e.ficha && !quedaPresupuesto(ctx, config)) break;
      try {
        const ficha = e.ficha ?? parsearFichaEstructurada((await ctx.http.get(e.url)).texto, e.url, config);
        await procesarVino(ctx, catalogo, normalizarFichaTienda(ficha, e.categoria));
      } catch (err) {
        // Una ficha suelta que robots.txt no permite se salta (respetándolo) sin detener la fuente.
        if (err instanceof RobotsDenegado) {
          ctx.contadores.omitidas++;
          ctx.log.warn(`Omitida por robots.txt: ${e.url}`);
          continue;
        }
        if (err instanceof ParadaFuente) throw err;
        ctx.contadores.errores++;
        ctx.log.error(`${e.url}: ${(err as Error).message}`);
      }
    }

    // Solo una ejecución completa puede dar ofertas por no vistas.
    await catalogo.ofertas?.cerrar(inicio, { completa: ctx.limite == null && ctx.contadores.errores === 0 && !ctx.esParcial() });
  };
}

/** Alias de la CLI (`tienda-<slug>`) → slug de `fuentes` + scraper. */
export const SCRAPERS_TIENDAS: Record<string, { slug: string; scraper: Scraper }> = Object.fromEntries(
  TIENDAS.map((t) => [`tienda-${t.slug}`, { slug: t.slug, scraper: crearScraperTienda(t) }]),
);
