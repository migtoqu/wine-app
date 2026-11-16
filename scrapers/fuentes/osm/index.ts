// OpenStreetMap: (1) una consulta Overpass con los POI craft=winery / shop=wine de España;
// (2) Nominatim para las bodegas sin coordenadas de otra fuente (municipio y, si se puede, calle);
// (3) emparejar POI ↔ bodega cerca de su punto; (4) registro por bodega y consolidación.
// Solo se escriben coordenadas en bodegas sin ubicación oficial, siempre con su precisión
// (registros_fuente.datos.precision), y web/teléfono solo donde falten.
import { readFile } from "node:fs/promises";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ClienteHttp, ParadaFuente } from "../../lib/http.ts";
import { CacheRespuestas } from "./cache.ts";
import { emparejarPoi, resolverConflictos, type Emparejamiento } from "./emparejar.ts";
import { Geocodificador, type ResultadoGeo } from "./geocodificar.ts";
import { bodegaDeJson, GuardadoOsm, proponer, type BodegaOsm, type FilaBodegaJson } from "./guardar.ts";
import { parsearOverpass, URLS_OVERPASS, urlOverpass, type Poi } from "./overpass.ts";

export const SLUG_FUENTE = "openstreetmap";
export const RUTA_CACHE = "scrapers/.cache/osm/nominatim.json";

async function descargarPois(ctx: Contexto): Promise<Poi[]> {
  // La consulta de toda España tarda hasta 3 min: cliente propio con timeout largo (mismo UA).
  const http = new ClienteHttp({ log: ctx.log, timeoutMs: 200_000, backoffMs: [30_000, 60_000] });
  let ultimo: unknown = null;
  for (const base of URLS_OVERPASS) {
    try {
      const res = await http.get(urlOverpass(base), { api: true });
      const pois = parsearOverpass(res.texto);
      ctx.log.info(`Overpass (${new URL(base).host}): ${pois.length} POI con nombre`);
      return pois;
    } catch (e) {
      if (e instanceof ParadaFuente) throw e;
      ultimo = e;
      ctx.log.warn(`Overpass ${new URL(base).host}: ${(e as Error).message}`);
    }
  }
  throw new Error(`Overpass no responde: ${(ultimo as Error)?.message}`);
}

export async function scraperOsm(ctx: Contexto): Promise<void> {
  const inicio = Date.now();
  const presupuestoMin = Number(ctx.opciones.presupuestoMin ?? 50);
  const guardado = new GuardadoOsm(ctx.db, ctx.fuenteId);

  let bodegas: BodegaOsm[];
  if (ctx.db) bodegas = await guardado.cargarBodegas();
  else if (ctx.rutaBodegas) bodegas = (JSON.parse(await readFile(ctx.rutaBodegas, "utf8")) as FilaBodegaJson[]).map(bodegaDeJson);
  else throw new Error("Dry-run sin --bodegas: hace falta el JSON de bodegas (ver docs/SOURCES.md, OpenStreetMap)");
  if (ctx.limite != null) {
    // Con límite, primero las que no tienen coordenadas (lo que interesa probar).
    bodegas = [...bodegas].sort((a, b) => Number(a.origenUbicacion === "oficial") - Number(b.origenUbicacion === "oficial"))
      .slice(0, ctx.limite);
  }
  ctx.log.info(`${bodegas.length} bodegas; ${bodegas.filter((b) => b.origenUbicacion !== "oficial").length} sin coordenadas oficiales`);

  const pois = await descargarPois(ctx);

  // Nominatim: caché en disco + ritmo del cliente común (3–5 s por host, por debajo de 1 petición/s).
  const cache = new CacheRespuestas(ctx.opciones.cache === "no" ? null : (ctx.opciones.cache ?? RUTA_CACHE));
  await cache.cargar();
  let peticionesNominatim = 0;
  const geocodificador = new Geocodificador(async (url) => {
    const guardada = cache.get(url);
    if (guardada !== null) return guardada;
    peticionesNominatim++;
    const res = await ctx.http.get(url, { api: true });
    cache.set(url, res.texto);
    return res.texto;
  });

  const geos = new Map<string, ResultadoGeo>();
  let cortado = false;
  try {
    for (const b of bodegas) {
      if (b.origenUbicacion === "oficial") continue;
      if ((Date.now() - inicio) / 60_000 > presupuestoMin) {
        cortado = true;
        break;
      }
      try {
        geos.set(b.id, await geocodificador.geocodificar(b));
      } catch (e) {
        if (e instanceof ParadaFuente) throw e;
        ctx.contadores.errores++;
        ctx.log.error(`Nominatim (${b.nombre}): ${(e as Error).message}`);
      }
    }
  } finally {
    await cache.guardar();
  }
  ctx.log.info(`Nominatim: ${peticionesNominatim} peticiones, ${cache.aciertos} respuestas de la caché`);
  if (cortado) ctx.marcarParcial(`Presupuesto de ${presupuestoMin} min agotado: el resto se geocodifica el mes que viene`, { esperado: true });

  // Emparejar POI con cada bodega cerca de su punto de referencia.
  const emparejados = new Map<string, Emparejamiento>();
  for (const b of bodegas) {
    const geo = geos.get(b.id)?.mejor;
    const ref = b.origenUbicacion === "oficial" && b.ubicacion
      ? { punto: b.ubicacion, precision: "oficial" as const }
      : geo ? { punto: geo.punto, precision: geo.precision } : null;
    if (!ref) continue;
    const e = emparejarPoi(b, ref, pois);
    if (e) emparejados.set(b.id, e);
  }
  const finales = resolverConflictos(emparejados);
  ctx.log.info(`${finales.size} bodegas emparejadas con un POI (${emparejados.size - finales.size} descartadas por POI repetido)`);

  // Guardar.
  const ahora = new Date().toISOString();
  const resumen = { exacta: 0, portal: 0, calle: 0, municipio: 0, sin_punto: 0, con_horario: 0, con_poi: 0 };
  for (const b of bodegas) {
    // Sin geocodificar (presupuesto o error): no se toca, para no retirar un punto anterior.
    if (b.origenUbicacion !== "oficial" && !geos.has(b.id)) continue;
    const geo = geos.get(b.id) ?? null;
    const poi = finales.get(b.id) ?? null;
    const p = proponer({ bodega: b, geo, poi });
    if (b.origenUbicacion !== "oficial") resumen[p.ubicacion?.precision ?? "sin_punto"]++;
    if (poi) resumen.con_poi++;
    if (poi?.poi.horario) resumen.con_horario++;
    if (!ctx.db) {
      if (p.ubicacion || poi) {
        ctx.salida.push({
          bodegaId: b.id, nombre: b.nombre, municipio: b.municipio, provincia: b.provincia,
          antes: b.origenUbicacion, ubicacion: p.ubicacion, campos: p.campos, poi: p.datos.poi,
          opening_hours: p.datos.opening_hours, nominatim: p.datos.nominatim,
        });
        if (p.ubicacion && !b.ubicacion) ctx.contadores.nuevos++;
        else ctx.contadores.actualizados++;
      } else ctx.contadores.descartados++;
      continue;
    }
    try {
      const escritos = await guardado.guardar(b, p, ahora);
      if (escritos === null) ctx.contadores.descartados++;
      else if (escritos.includes("ubicacion") && !b.ubicacion) ctx.contadores.nuevos++;
      else if (escritos.length > 0) ctx.contadores.actualizados++;
      else ctx.contadores.sinCambios++;
    } catch (e) {
      ctx.contadores.errores++;
      ctx.log.error(`${b.nombre}: ${(e as Error).message}`);
    }
  }
  ctx.log.info(
    `Sin coordenadas oficiales → exacta (POI) ${resumen.exacta}, portal ${resumen.portal}, calle ${resumen.calle}, ` +
      `municipio ${resumen.municipio}, sin punto ${resumen.sin_punto}. POI emparejados ${resumen.con_poi} ` +
      `(con horario ${resumen.con_horario}).`,
  );
  if (!ctx.db) ctx.salida.unshift({ resumen });
}
