// Scraper del Consejo Regulador D.O. Ribera del Duero: listado paginado → fichas → bodegas.
// extraer (http + parsear) → normalizar → emparejar (registro, decisión del admin o EmparejadorBodegas) → consolidar.
import { registrosConocidos } from "../../lib/db.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ParadaFuente } from "../../lib/http.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { GuardadoRibera } from "./guardar.ts";
import { normalizarFicha } from "./normalizar.ts";
import { BASE, parsearFicha, parsearListado, urlListado } from "./parsear.ts";

export const SLUG_FUENTE = "cr-ribera-del-duero";

// Hoy son 26 páginas; un valor muy superior indicaría un cambio en la web.
const MAX_PAGINAS = 100;

/** Recorre el listado y devuelve las URLs de fichas (cortando en `limite`). */
async function listarFichas(ctx: Contexto): Promise<string[]> {
  const fichas: string[] = [];
  let ultima = 0;
  for (let pagina = 0; pagina <= ultima; pagina++) {
    const res = await ctx.http.get(urlListado(pagina));
    const listado = parsearListado(res.texto);
    if (pagina === 0) {
      if (listado.ultimaPagina == null) ctx.log.warn("No se encontró el enlace «Última» del paginador");
      ultima = listado.ultimaPagina ?? 0;
      if (ultima > MAX_PAGINAS) throw new Error(`Paginador anómalo: ${ultima} páginas`);
      ctx.log.info(`Listado: ${ultima + 1} páginas`);
    }
    if (listado.fichas.length === 0) {
      ctx.log.warn(`Página ${pagina} sin bodegas; se deja de paginar`);
      break;
    }
    for (const f of listado.fichas) if (!fichas.includes(f)) fichas.push(f);
    if (ctx.limite != null && fichas.length >= ctx.limite) return fichas.slice(0, ctx.limite);
  }
  return fichas;
}

export async function scraperRibera(ctx: Contexto): Promise<void> {
  // robots.txt: si deja de permitir el listado o las fichas, se aborta aquí.
  await ctx.http.comprobarRobots(urlListado(0));
  await ctx.http.comprobarRobots(`${BASE}/bodegas/aalto-bodegas-y-vinedos`);

  const guardado = ctx.db ? new GuardadoRibera(ctx.db, ctx.fuenteId!, ctx.log) : null;
  await guardado?.preparar();

  const fichas = await listarFichas(ctx);
  ctx.log.info(`${fichas.length} fichas de bodega a procesar`);

  if (ctx.db && ctx.limite == null) {
    const conocidos = await registrosConocidos(ctx.db, ctx.fuenteId!);
    if (conocidos > 0 && fichas.length < conocidos * 0.5) {
      ctx.marcarParcial(`Volumen anómalo: ${fichas.length} fichas frente a ${conocidos} conocidas`);
    }
  }

  for (const url of fichas) {
    try {
      const res = await ctx.http.get(url);
      const normalizada = normalizarFicha(parsearFicha(res.texto, url));
      if (guardado) {
        const r = await guardado.guardar(normalizada);
        if (r === "nuevo") ctx.contadores.nuevos++;
        else if (r === "actualizado") ctx.contadores.actualizados++;
        else if (r === "revision") ctx.contadores.revision++;
        else if (r === "descartado") ctx.contadores.descartados++;
        else ctx.contadores.sinCambios++;
        ctx.log.debug(`${r}: ${normalizada.campos.nombre}`);
      } else {
        ctx.salida.push(normalizada);
        ctx.log.info(`normalizada: ${normalizada.campos.nombre}`);
      }
    } catch (e) {
      // Las URLs de entrada ya se comprobaron al empezar: una ficha suelta que
      // robots.txt no permite se salta (respetándolo) sin detener la fuente.
      if (e instanceof RobotsDenegado) {
        ctx.contadores.omitidas++;
        ctx.log.warn(`Omitida por robots.txt: ${url}`);
        continue;
      }
      if (e instanceof ParadaFuente) throw e;
      ctx.contadores.errores++;
      ctx.log.error(`${url}: ${(e as Error).message}`);
    }
  }
}
