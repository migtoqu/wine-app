// Scraper del C.R.D.O. Navarra (navarrawine.com): sitemaps → experiencias (lectura) → bodegas → vinos
// → experiencias (guardado). Mismo guardado que Rioja (GuardadoConsejoCompleto) con la D.O. Navarra.
// Idempotente: ids externos estables (bodega:/vino:/exp:<slug>).
import { resolverBodegas } from "../../rioja/resolver.ts";
import { registrosConocidos } from "../../../lib/db.ts";
import type { Contexto } from "../../../lib/ejecucion.ts";
import { ParadaFuente } from "../../../lib/http.ts";
import { RobotsDenegado } from "../../../lib/robots.ts";
import { GuardadoConsejoCompleto, type ResolucionBodega, type Resultado } from "../comun/guardar-completo.ts";
import {
  DENOMINACION,
  normalizarBodega,
  normalizarExperiencia,
  normalizarVino,
  partirDireccion,
  type ServicioNavarra,
  type VinoNavarra,
} from "./normalizar.ts";
import {
  parsearBodega,
  parsearExperiencia,
  parsearIndiceSitemaps,
  parsearSitemap,
  parsearVino,
  parsearZonas,
  urlFicha,
  URL_LISTADO,
  URL_SITEMAP,
  type TipoFicha,
} from "./parsear.ts";

export const SLUG_FUENTE = "cr-navarra";

/** Cada cuántas fichas se escribe una línea de progreso (la web a veces tarda > 20 s por ficha). */
const CADA = 25;

function contar(ctx: Contexto, r: Resultado) {
  const c = ctx.contadores;
  if (r === "nuevo") c.nuevos++;
  else if (r === "actualizado") c.actualizados++;
  else if (r === "revision") c.revision++;
  else if (r === "descartado") c.descartados++;
  else c.sinCambios++;
}

/** Descarga y procesa cada ficha; robots → omitir; 404 → omitir; parada → abortar; resto → error contado. */
async function recorrer(
  ctx: Contexto,
  tipo: TipoFicha,
  slugs: string[],
  procesar: (html: string, url: string) => Promise<void>,
): Promise<void> {
  ctx.log.info(`[${tipo}] ${slugs.length} fichas`);
  for (const [i, slug] of slugs.entries()) {
    if (i > 0 && i % CADA === 0) ctx.log.info(`[${tipo}] ${i}/${slugs.length}`);
    const url = urlFicha(tipo, slug);
    try {
      await procesar((await ctx.http.get(url)).texto, url);
    } catch (e) {
      if (e instanceof RobotsDenegado) {
        ctx.contadores.omitidas++;
        ctx.log.warn(`Omitida por robots.txt: ${url}`);
      } else if (e instanceof ParadaFuente) {
        throw e;
      } else if (/HTTP 404/.test((e as Error).message)) {
        ctx.contadores.omitidas++;
        ctx.log.warn(`Ficha retirada (404), omitida: ${url}`);
      } else {
        ctx.contadores.errores++;
        ctx.log.error(`${url}: ${(e as Error).message}`);
      }
    }
  }
}

export async function scraperNavarra(ctx: Contexto): Promise<void> {
  await ctx.http.comprobarRobots(URL_SITEMAP);
  await ctx.http.comprobarRobots(urlFicha("bodega", "bodegas-ochoa"));
  await ctx.http.comprobarRobots(urlFicha("vino", "ochoa-reserva"));
  await ctx.http.comprobarRobots(urlFicha("experiencia", "vivimos-el-vino"));

  // ---- Sitemaps -----------------------------------------------------------------------------------
  const indice = parsearIndiceSitemaps((await ctx.http.get(URL_SITEMAP)).texto);
  const slugs: Record<TipoFicha, string[]> = { bodega: [], vino: [], experiencia: [] };
  for (const tipo of Object.keys(indice) as TipoFicha[]) {
    for (const url of indice[tipo]) {
      for (const s of parsearSitemap((await ctx.http.get(url)).texto, tipo)) if (!slugs[tipo].includes(s)) slugs[tipo].push(s);
    }
  }
  ctx.log.info(`Sitemaps: ${slugs.bodega.length} bodegas, ${slugs.vino.length} vinos, ${slugs.experiencia.length} experiencias`);
  if (slugs.bodega.length < 10 || slugs.vino.length < 50) {
    throw new Error("Sitemaps anómalos: muy pocas fichas (¿cambió la estructura de la web?)");
  }
  const recorte = (l: string[]) => (ctx.limite != null ? l.slice(0, ctx.limite) : l);

  const guardado = ctx.db ? new GuardadoConsejoCompleto(ctx.db, ctx.fuenteId!, ctx.log, DENOMINACION) : null;
  await guardado?.preparar();
  if (ctx.db && ctx.limite == null) {
    const conocidos = await registrosConocidos(ctx.db, ctx.fuenteId!);
    const esperados = slugs.bodega.length + slugs.vino.length + slugs.experiencia.length;
    if (conocidos > 0 && esperados < conocidos * 0.5) {
      ctx.marcarParcial(`Volumen anómalo: ${esperados} fichas frente a ${conocidos} conocidas`);
    }
  }

  // Zona de cada bodega (solo en el listado); si falla, se sigue sin zona.
  let zonas = new Map<string, string>();
  try {
    zonas = parsearZonas((await ctx.http.get(URL_LISTADO)).texto);
  } catch (e) {
    if (e instanceof ParadaFuente) throw e;
    ctx.log.warn(`Sin zonas: ${(e as Error).message}`);
  }

  // ---- 1. Experiencias (lectura): dan la población de la bodega cuando su ficha no la trae ----------
  const experiencias: ServicioNavarra[] = [];
  const municipioDeBodega = new Map<string, string>();
  await recorrer(ctx, "experiencia", recorte(slugs.experiencia), async (html, url) => {
    const n = normalizarExperiencia(parsearExperiencia(html, url));
    experiencias.push(n);
    const m = partirDireccion(n.datos.direccion_texto).municipio;
    if (n.bodega_slug && m && !municipioDeBodega.has(n.bodega_slug)) municipioDeBodega.set(n.bodega_slug, m);
  });

  // ---- 2. Bodegas -----------------------------------------------------------------------------------
  const claves: { idExterno: string; clave: string }[] = [];
  const idsBodega = new Map<string, string | null>(); // id externo → bodega del catálogo (o el id externo en dry-run)
  const enlaces = new Map<string, string>(); // slug de vino → id externo de bodega
  const enlacesExp = new Map<string, string>(); // slug de experiencia → id externo de bodega
  await recorrer(ctx, "bodega", recorte(slugs.bodega), async (html, url) => {
    const f = parsearBodega(html, url);
    const n = normalizarBodega(f, zonas.get(f.slug_fuente) ?? null, municipioDeBodega.get(f.slug_fuente) ?? null);
    claves.push({ idExterno: n.idExterno, clave: n.datos.clave_nombre });
    for (const v of f.vinos_enlazados) if (!enlaces.has(v)) enlaces.set(v, n.idExterno);
    for (const x of f.experiencias_enlazadas) if (!enlacesExp.has(x)) enlacesExp.set(x, n.idExterno);
    if (guardado) {
      const { resultado, bodegaId } = await guardado.guardarBodega(n);
      idsBodega.set(n.idExterno, bodegaId);
      contar(ctx, resultado);
      return;
    }
    idsBodega.set(n.idExterno, n.idExterno);
    ctx.contadores.nuevos++;
    ctx.salida.push({ entidad: "bodega", ...n });
  });
  const bodegaDe = (idExterno: string | null): string | null =>
    idExterno ? (idsBodega.get(idExterno) ?? guardado?.bodegaDeRegistro(idExterno) ?? null) : null;

  // ---- 3. Vinos ---------------------------------------------------------------------------------------
  const vinos: VinoNavarra[] = [];
  await recorrer(ctx, "vino", recorte(slugs.vino), async (html, url) => {
    vinos.push(normalizarVino(parsearVino(html, url)));
  });
  // Enlace explícito: desde la ficha de la bodega o el «Ver bodega» de la ficha del vino.
  for (const v of vinos) {
    if (!enlaces.has(v.datos.slug_fuente) && v.datos.bodega_slug) enlaces.set(v.datos.slug_fuente, `bodega:${v.datos.bodega_slug}`);
  }
  const resoluciones = resolverBodegas(
    vinos.map((v) => ({ slug: v.datos.slug_fuente, clave_bodega: v.clave_bodega, hermanos: v.datos.vinos_hermanos })),
    claves,
    enlaces,
  );
  const cuenta: Record<string, number> = {};
  for (const r of resoluciones.values()) cuenta[r.motivo] = (cuenta[r.motivo] ?? 0) + 1;
  ctx.log.info(`[vino] resolución de bodega: ${Object.entries(cuenta).map(([k, n]) => `${k}=${n}`).join(", ")}`);
  for (const v of vinos) {
    const r: ResolucionBodega = resoluciones.get(v.datos.slug_fuente)!;
    const bodegaId = bodegaDe(r.idExterno);
    try {
      if (guardado) contar(ctx, await guardado.guardarVino(v, r, bodegaId));
      else {
        if (bodegaId && v.vino.tipo) ctx.contadores.nuevos++;
        else ctx.contadores.revision++;
        ctx.salida.push({ entidad: "vino", ...v, resolucion_bodega: r, a_revision: !bodegaId || !v.vino.tipo });
      }
    } catch (e) {
      ctx.contadores.errores++;
      ctx.log.error(`${v.url}: ${(e as Error).message}`);
    }
  }

  // ---- 4. Experiencias (guardado) ---------------------------------------------------------------------
  for (const n of experiencias) {
    const idExterno = enlacesExp.get(n.datos.slug_fuente) ?? (n.bodega_slug ? `bodega:${n.bodega_slug}` : null);
    const bodegaId = bodegaDe(idExterno);
    const motivo = !idExterno ? "sin_enlace" : "sin_vincular";
    try {
      if (guardado) contar(ctx, await guardado.guardarServicio(n, bodegaId, motivo));
      else {
        if (bodegaId) ctx.contadores.nuevos++;
        else ctx.contadores.revision++;
        ctx.salida.push({ entidad: "servicio", ...n, bodega_resuelta: !!bodegaId, a_revision: !bodegaId });
      }
    } catch (e) {
      ctx.contadores.errores++;
      ctx.log.error(`${n.url}: ${(e as Error).message}`);
    }
  }
}
