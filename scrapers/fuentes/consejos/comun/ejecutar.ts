// Runner común de los consejos: robots → listado → fichas → normalizar → guardar (o salida del dry-run).
import { registrosConocidos } from "../../../lib/db.ts";
import type { Contexto, Scraper } from "../../../lib/ejecucion.ts";
import { ErrorHttp, ParadaFuente } from "../../../lib/http.ts";
import { RobotsDenegado } from "../../../lib/robots.ts";
import { GuardadoConsejo } from "./guardar.ts";
import { normalizarBodega } from "./normalizar.ts";
import type { DefinicionConsejo, EntradaListado, FichaConsejo } from "./tipos.ts";

/** Ficha completa a partir de lo que dio el listado (Rueda: la tabla ya lo es todo). */
export function fichaDesdeListado(e: EntradaListado): FichaConsejo {
  const d = e.datos;
  if (!d.nombre || !d.id_externo) throw new Error(`Entrada de listado incompleta: ${e.url}`);
  return {
    url: e.url,
    id_externo: d.id_externo,
    nombre: d.nombre,
    direccion: d.direccion ?? null,
    codigo_postal: d.codigo_postal ?? null,
    municipio: d.municipio ?? null,
    provincia_texto: d.provincia_texto ?? null,
    ubicacion: d.ubicacion ?? null,
    web: d.web ?? null,
    telefono: d.telefono ?? null,
    email: d.email ?? null,
    marcas: d.marcas ?? [],
    enoturismo: d.enoturismo ?? null,
    extra: d.extra ?? {},
  };
}

export function crearScraperConsejo(def: DefinicionConsejo): Scraper {
  return async (ctx: Contexto) => {
    // robots.txt: si deja de permitir el listado o las fichas, se aborta aquí.
    for (const url of def.urlsRobots) await ctx.http.comprobarRobots(url);

    const guardado = ctx.db ? new GuardadoConsejo(ctx.db, ctx.fuenteId!, ctx.log, def.denominacion) : null;
    await guardado?.preparar();

    let entradas = await def.listar(ctx);
    if (entradas.length === 0) throw new Error("El listado no trae ninguna bodega: ¿cambió la web?");
    ctx.log.info(`${entradas.length} bodegas en el listado`);
    if (ctx.limite != null) entradas = entradas.slice(0, ctx.limite);

    if (ctx.db && ctx.limite == null) {
      const conocidos = await registrosConocidos(ctx.db, ctx.fuenteId!);
      if (conocidos > 0 && entradas.length < conocidos * 0.5) {
        ctx.marcarParcial(`Volumen anómalo: ${entradas.length} bodegas frente a ${conocidos} conocidas`);
      }
    }

    for (const entrada of entradas) {
      try {
        const ficha = def.parsearFicha
          ? def.parsearFicha((await ctx.http.get(entrada.url)).texto, entrada)
          : fichaDesdeListado(entrada);
        if (!ficha) {
          ctx.contadores.descartados++;
          ctx.log.info(`Descartada (no es bodega de la D.O.): ${entrada.datos.nombre ?? entrada.url}`);
          continue;
        }
        const n = normalizarBodega(ficha, def);
        if (!n.campos.provincia) ctx.log.warn(`Sin provincia: ${n.campos.nombre} (${n.campos.municipio ?? "sin municipio"})`);
        if (guardado) {
          const r = await guardado.guardar(n);
          if (r === "nuevo") ctx.contadores.nuevos++;
          else if (r === "actualizado") ctx.contadores.actualizados++;
          else if (r === "revision") ctx.contadores.revision++;
          else if (r === "descartado") ctx.contadores.descartados++;
          else ctx.contadores.sinCambios++;
          ctx.log.debug(`${r}: ${n.campos.nombre}`);
        } else {
          ctx.salida.push(n);
          ctx.log.info(`normalizada: ${n.campos.nombre} · ${n.campos.municipio ?? "?"} (${n.campos.provincia ?? "?"})`);
        }
      } catch (e) {
        // Una ficha suelta que robots.txt no permite se salta (respetándolo) sin detener la fuente.
        if (e instanceof RobotsDenegado) {
          ctx.contadores.omitidas++;
          ctx.log.warn(`Omitida por robots.txt: ${entrada.url}`);
          continue;
        }
        if (e instanceof ParadaFuente) throw e;
        // Una ficha que ya no existe (sitemap o listado desfasado) no es un fallo de la fuente.
        if (e instanceof ErrorHttp && (e.status === 404 || e.status === 410)) {
          ctx.contadores.descartados++;
          ctx.log.warn(`Ficha retirada (${e.status}): ${entrada.url}`);
          continue;
        }
        ctx.contadores.errores++;
        ctx.log.error(`${entrada.url}: ${(e as Error).message}`);
      }
    }
  };
}
