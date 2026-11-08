// Scraper del Consejo Regulador DOCa Rioja (riojawine.com): sitemap → bodegas → vinos → experiencias.
// extraer (http + parsear) → normalizar → emparejar/consolidar (guardar) por tipo de ficha.
// Idempotente: cada ficha se guarda con un id externo estable (bodega:/vino:/exp:<slug>), así que una
// ejecución cortada puede repetirse entera sin duplicar nada (solo rehace trabajo).
import { EmparejadorBodegas, type BodegaCatalogo } from "../../emparejamiento/entidades.ts";
import { registrosConocidos } from "../../lib/db.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ParadaFuente } from "../../lib/http.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { GuardadoRioja, type Resultado } from "./guardar.ts";
import {
  normalizarBodega,
  normalizarExperiencia,
  normalizarVino,
  type BodegaClave,
  type ResolucionBodega,
  type VinoNormalizado,
} from "./normalizar.ts";
import {
  parsearBodega,
  parsearExperiencia,
  parsearSitemap,
  parsearVino,
  URL_SITEMAP,
  urlFicha,
  type FichaVino,
  type TipoFicha,
} from "./parsear.ts";
import { resolverBodegas } from "./resolver.ts";

export const SLUG_FUENTE = "cr-rioja";

/** Cada cuántas fichas se escribe una línea de progreso en el log. */
const CADA = 25;

function contar(ctx: Contexto, r: Resultado) {
  const c = ctx.contadores;
  if (r === "nuevo") c.nuevos++;
  else if (r === "actualizado") c.actualizados++;
  else if (r === "revision") c.revision++;
  else if (r === "descartado") c.descartados++;
  else c.sinCambios++;
}

/** Descarga cada ficha, la procesa y gestiona errores (robots → omitir; parada → abortar; resto → contar). */
async function recorrer<T>(
  ctx: Contexto,
  tipo: TipoFicha,
  etiqueta: string,
  slugs: string[],
  procesar: (html: string, url: string, slug: string) => Promise<T | void>,
): Promise<void> {
  const total = slugs.length;
  ctx.log.info(`[${etiqueta}] ${total} fichas`);
  for (let i = 0; i < total; i++) {
    const slug = slugs[i]!;
    const url = urlFicha(tipo, slug);
    try {
      const res = await ctx.http.get(url);
      await procesar(res.texto, url, slug);
    } catch (e) {
      if (e instanceof RobotsDenegado) {
        ctx.contadores.omitidas++;
        ctx.log.warn(`Omitida por robots.txt: ${url}`);
      } else if (e instanceof ParadaFuente) {
        throw e;
      } else if (/HTTP 404/.test((e as Error).message)) {
        // El sitemap lista fichas ya retiradas: no es un fallo de la ejecución.
        ctx.contadores.omitidas++;
        ctx.log.warn(`Ficha retirada (404), omitida: ${url}`);
      } else {
        ctx.contadores.errores++;
        ctx.log.error(`${url}: ${(e as Error).message}`);
      }
    }
    if ((i + 1) % CADA === 0 || i + 1 === total) {
      const c = ctx.contadores;
      ctx.log.info(
        `[${etiqueta}] ${i + 1}/${total} · acumulado: ${c.nuevos} nuevos, ${c.actualizados} actualizados, ` +
          `${c.sinCambios} sin cambios, ${c.revision} a revisión, ${c.errores} errores`,
      );
    }
  }
}

export async function scraperRioja(ctx: Contexto): Promise<void> {
  // robots.txt: si deja de permitir el sitemap o las fichas, se aborta aquí.
  await ctx.http.comprobarRobots(URL_SITEMAP);
  await ctx.http.comprobarRobots(urlFicha("bodega", "bodegas-muga"));

  const mapa = parsearSitemap((await ctx.http.get(URL_SITEMAP)).texto);
  ctx.log.info(`Sitemap: ${mapa.bodegas.length} bodegas, ${mapa.vinos.length} vinos, ${mapa.experiencias.length} experiencias`);
  if (mapa.bodegas.length < 50 || mapa.vinos.length < 100 || mapa.experiencias.length < 50) {
    throw new Error("Sitemap anómalo: muy pocas fichas (¿cambió la estructura de la web?)");
  }
  const recorte = (l: string[]) => (ctx.limite != null ? l.slice(0, ctx.limite) : l);
  const bodegasSlugs = recorte(mapa.bodegas);
  const vinosSlugs = recorte(mapa.vinos);
  const expSlugs = recorte(mapa.experiencias);

  const guardado = ctx.db ? new GuardadoRioja(ctx.db, ctx.fuenteId!, ctx.log) : null;
  await guardado?.preparar();

  if (ctx.db && ctx.limite == null) {
    const conocidos = await registrosConocidos(ctx.db, ctx.fuenteId!);
    const esperados = mapa.bodegas.length + mapa.vinos.length + mapa.experiencias.length;
    if (conocidos > 0 && esperados < conocidos * 0.5) {
      ctx.marcarParcial(`Volumen anómalo: ${esperados} fichas en el sitemap frente a ${conocidos} conocidas`);
    }
  }

  // ---- 1. Bodegas -------------------------------------------------------------------------------
  const claves: BodegaClave[] = [];
  const idsBodega = new Map<string, string | null>(); // id externo → bodega del catálogo (o id externo en dry-run)
  const enlaces = new Map<string, string>(); // slug de vino → id externo de bodega (enlace explícito)
  const catalogoDry: BodegaCatalogo[] = [];

  await recorrer(ctx, "bodega", "bodegas", bodegasSlugs, async (html, url) => {
    const ficha = parsearBodega(html, url);
    const n = normalizarBodega(ficha);
    claves.push({ idExterno: n.idExterno, clave: n.clave_nombre });
    for (const v of ficha.vinos_enlazados) enlaces.set(v, n.idExterno);
    if (guardado) {
      const { resultado, bodegaId } = await guardado.guardarBodega(n);
      idsBodega.set(n.idExterno, bodegaId);
      contar(ctx, resultado);
      ctx.log.debug(`${resultado}: ${n.campos.nombre}`);
      return;
    }
    // Dry-run: se empareja contra las bodegas de esta misma ejecución para estimar duplicados y revisiones.
    const emp = new EmparejadorBodegas(catalogoDry).emparejar({
      nombre: n.campos.nombre, municipio: n.campos.municipio, web: n.campos.web,
    });
    if (emp.estado === "revision") ctx.contadores.revision++;
    else if (emp.estado === "vinculada") ctx.contadores.actualizados++;
    else {
      ctx.contadores.nuevos++;
      catalogoDry.push({ id: n.idExterno, nombre: n.campos.nombre, municipio: n.campos.municipio, web: n.campos.web });
    }
    idsBodega.set(n.idExterno, emp.estado === "nueva" ? n.idExterno : null);
    ctx.salida.push({ entidad: "bodega", ...n, emparejamiento: { estado: emp.estado, confianza: emp.confianza, candidatos: emp.candidatos } });
  });

  // ---- 2. Vinos ---------------------------------------------------------------------------------
  // La ficha del vino no enlaza a su bodega: primero se descargan todos y luego se resuelve la bodega
  // (enlace explícito → nombre → vinos hermanos).
  const vinos: VinoNormalizado[] = [];
  await recorrer(ctx, "vino", "vinos (descarga)", vinosSlugs, async (html, url) => {
    vinos.push(normalizarVino(parsearVino(html, url) as FichaVino));
  });
  const resoluciones = resolverBodegas(
    vinos.map((v) => ({ slug: v.datos.slug_fuente, clave_bodega: v.clave_bodega, hermanos: v.datos.vinos_hermanos })),
    claves,
    enlaces,
  );
  ctx.log.info(`[vinos] ${vinos.length} descargados; resolución de bodega: ${resumenResolucion(resoluciones)}`);
  const bodegaDe = (r: ResolucionBodega): string | null => {
    if (!r.idExterno) return null;
    return idsBodega.get(r.idExterno) ?? guardado?.bodegaDeRegistro(r.idExterno) ?? null;
  };
  let hechos = 0;
  for (const v of vinos) {
    const r = resoluciones.get(v.datos.slug_fuente)!;
    const bodegaId = bodegaDe(r);
    try {
      if (guardado) {
        contar(ctx, await guardado.guardarVino(v, r, bodegaId));
      } else {
        if (bodegaId && v.vino.tipo) ctx.contadores.nuevos++;
        else ctx.contadores.revision++;
        ctx.salida.push({ entidad: "vino", ...v, resolucion_bodega: r, a_revision: !bodegaId || !v.vino.tipo });
      }
    } catch (e) {
      ctx.contadores.errores++;
      ctx.log.error(`${v.url}: ${(e as Error).message}`);
    }
    if (++hechos % CADA === 0 || hechos === vinos.length) ctx.log.info(`[vinos] ${hechos}/${vinos.length} guardados`);
  }

  // ---- 3. Experiencias --------------------------------------------------------------------------
  await recorrer(ctx, "experiencia", "experiencias", expSlugs, async (html, url) => {
    const n = normalizarExperiencia(parsearExperiencia(html, url));
    const idExterno = n.bodega_slug ? `bodega:${n.bodega_slug}` : null;
    const bodegaId = idExterno ? (idsBodega.get(idExterno) ?? guardado?.bodegaDeRegistro(idExterno) ?? null) : null;
    const motivo = !idExterno ? "sin_enlace" : "sin_vincular";
    if (guardado) {
      contar(ctx, await guardado.guardarServicio(n, bodegaId, motivo));
    } else {
      if (bodegaId) ctx.contadores.nuevos++;
      else ctx.contadores.revision++;
      ctx.salida.push({ entidad: "servicio", ...n, bodega_resuelta: !!bodegaId, a_revision: !bodegaId });
    }
  });
}

function resumenResolucion(m: Map<string, ResolucionBodega>): string {
  const cuenta: Record<string, number> = {};
  for (const r of m.values()) cuenta[r.motivo] = (cuenta[r.motivo] ?? 0) + 1;
  return Object.entries(cuenta).map(([k, v]) => `${k}=${v}`).join(", ");
}
