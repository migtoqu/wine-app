// Ruta del Vino Ribera del Duero: extraer (sitemaps + HTML de productos y fichas; robots.txt prohíbe /wp-json/) → normalizar → emparejar con las bodegas existentes → consolidar. Dos salidas:
//   · fichas de bodega → contacto, año de fundación y horario de visitas de bodegas ya cargadas;
//   · productos → `servicios_bodega` (visitas, catas, experiencias con precio y URL de reserva).
// Los eventos fechados (tribe_events) quedan fuera del MVP: caducan y no son catálogo estable.
import { readFile } from "node:fs/promises";
import type { BodegaCatalogo } from "../../emparejamiento/entidades.ts";
import { registrosConocidos } from "../../lib/db.ts";
import type { Contadores, Contexto } from "../../lib/ejecucion.ts";
import { ErrorHttp, ParadaFuente } from "../../lib/http.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { GuardadoRuta, type Resultado } from "./guardar.ts";
import { normalizarFicha, normalizarProducto } from "./normalizar.ts";
import {
  esBodega, parsearFichaDirectorio, parsearProducto, urlsSitemap, URL_SITEMAP_DIRECTORIO, URL_SITEMAP_PRODUCTOS,
} from "./parsear.ts";

export const SLUG_FUENTE = "ruta-vino-ribera";

/** Bodegas para --dry-run desde el JSON de un dry-run de Ribera (nunca de la BD). */
export async function bodegasDesdeDryRun(ruta: string): Promise<BodegaCatalogo[]> {
  const json = JSON.parse(await readFile(ruta, "utf8")) as {
    registros?: { idExterno: string; campos: { nombre: string; municipio: string | null; web: string | null } }[];
  };
  return (json.registros ?? []).map((r) => ({
    id: r.idExterno, nombre: r.campos.nombre, municipio: r.campos.municipio, web: r.campos.web,
  }));
}

/** URLs de un sitemap (robots.txt lo anuncia y lo permite). */
async function urlsDe(ctx: Contexto, sitemap: string, ruta: "producto" | "directories"): Promise<string[]> {
  const res = await ctx.http.get(sitemap);
  const urls = urlsSitemap(res.texto, ruta);
  if (urls.length === 0) throw new Error(`${sitemap} no lista ningún /${ruta}/: la web ha cambiado`);
  return urls;
}

function contar(c: Contadores, r: Resultado) {
  if (r === "nuevo") c.nuevos++;
  else if (r === "actualizado") c.actualizados++;
  else if (r === "revision") c.revision++;
  else if (r === "descartado") c.descartados++;
  else c.sinCambios++;
}

export async function scraperRutaRibera(ctx: Contexto): Promise<void> {
  const inicio = new Date().toISOString();
  // robots.txt prohíbe /wp-json/: solo sitemaps y HTML público.
  await ctx.http.comprobarRobots(URL_SITEMAP_PRODUCTOS);
  await ctx.http.comprobarRobots(URL_SITEMAP_DIRECTORIO);

  const guardado = new GuardadoRuta(ctx.db, ctx.fuenteId, ctx.log);
  let catalogo: BodegaCatalogo[] = [];
  if (!ctx.db) {
    if (ctx.rutaBodegas) catalogo = await bodegasDesdeDryRun(ctx.rutaBodegas);
    else ctx.log.warn("Dry-run sin --bodegas: no hay bodegas con las que emparejar (todo irá a revisión o se descartará)");
  }
  await guardado.preparar(catalogo);
  ctx.log.info(`${guardado.totalBodegas} bodegas candidatas para emparejar`);

  // 1. Extraer: URLs de los sitemaps.
  const urlsFichas = await urlsDe(ctx, URL_SITEMAP_DIRECTORIO, "directories");
  const urlsProductos = await urlsDe(ctx, URL_SITEMAP_PRODUCTOS, "producto");
  ctx.log.info(`${urlsFichas.length} fichas de directorio y ${urlsProductos.length} productos en español`);

  if (ctx.db && ctx.limite == null) {
    const conocidos = await registrosConocidos(ctx.db, ctx.fuenteId!);
    // Las fichas que no son bodega no dejan registro: se compara solo con los productos y un mínimo razonable.
    if (conocidos > 0 && urlsProductos.length + urlsFichas.length * 0.19 < conocidos * 0.5) {
      ctx.marcarParcial(`Volumen anómalo: ${urlsProductos.length} productos frente a ${conocidos} registros conocidos`);
    }
  }

  // 2. Fichas del directorio: solo las de categoría bodega (la categoría se lee en la propia ficha).
  let bodegas = 0;
  for (const url of urlsFichas) {
    if (ctx.limite != null && bodegas >= ctx.limite) break;
    try {
      const res = await ctx.http.get(url);
      const ficha = parsearFichaDirectorio(res.texto, url);
      if (!ficha) { ctx.log.warn(`Ficha sin el formato esperado (se salta): ${url}`); continue; }
      if (!esBodega(ficha)) continue;
      bodegas++;
      const salida = await guardado.guardarFicha(normalizarFicha(ficha));
      contar(ctx.contadores, salida.resultado);
      if (!ctx.db) ctx.salida.push(salida);
      ctx.log.debug(`ficha ${salida.resultado}: ${ficha.nombre}`);
    } catch (e) {
      if (!manejar(ctx, e, url)) throw e;
    }
  }
  ctx.log.info(`${bodegas} fichas de bodega`);

  // 3. Servicios (después de las fichas: sus nombres ayudan a asignar la bodega).
  let leidos = 0;
  for (const url of urlsProductos) {
    if (ctx.limite != null && leidos >= ctx.limite) break;
    try {
      const res = await ctx.http.get(url);
      const p = parsearProducto(res.texto, url);
      if (!p) { ctx.log.warn(`Producto ilegible: ${url}`); ctx.contadores.errores++; continue; }
      leidos++;
      const salida = await guardado.guardarServicio(normalizarProducto(p));
      contar(ctx.contadores, salida.resultado);
      if (!ctx.db) ctx.salida.push(salida);
      ctx.log.debug(`servicio ${salida.resultado}: ${p.nombre}`);
    } catch (e) {
      if (!manejar(ctx, e, url)) throw e;
    }
  }

  if (ctx.db && ctx.limite == null && ctx.contadores.errores === 0) {
    const n = await guardado.desactivarAusentes(inicio);
    if (n > 0) ctx.log.info(`${n} servicios desactivados (ya no aparecen en la Ruta)`);
  }
}

/** true si el error afecta solo a esa URL (se cuenta y se sigue). */
function manejar(ctx: Contexto, e: unknown, url: string): boolean {
  if (e instanceof ParadaFuente) return false;
  if (e instanceof RobotsDenegado) {
    ctx.contadores.omitidas++;
    ctx.log.warn(`Omitida por robots.txt: ${url}`);
    return true;
  }
  ctx.contadores.errores++;
  ctx.log.error(`${url}: ${e instanceof ErrorHttp ? e.message : (e as Error).message}`);
  return true;
}
