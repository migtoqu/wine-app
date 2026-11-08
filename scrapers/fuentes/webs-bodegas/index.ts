// Webs oficiales de las bodegas: crawler genérico (WordPress + HTML; Shopify y
// Wix como punto de extensión). Por sitio: puerta legal → descubrimiento →
// hechos → consolidación con origen «bodega» (web oficial).
import type { Contexto } from "../../lib/ejecucion.ts";
import { ClienteHttp } from "../../lib/http.ts";
import { LimitadorPorHost } from "../../lib/rate-limit.ts";
import { agruparPorDominio, bodegasDeArgumento, loteDe, parsearLote, type BodegaConWeb } from "./entrada.ts";
import { GuardadoWebs } from "./guardar.ts";
import { cuentaHechosHistoria, hechosBodega, hechosVino, previsualizar } from "./normalizar.ts";
import { cargarExclusiones, notaPuerta, TEXTO_MOTIVO, type MotivoSalto } from "./puerta.ts";
import { RastreadorSitio, type EntradaSitio, type ResultadoSitio } from "./sitio.ts";

export const SLUG_FUENTE = "webs-bodegas";

/** Dominios rastreados a la vez (cada uno con su propia cola de 3–5 s). */
const CONCURRENCIA = 6;
const PRESUPUESTO_MIN = 45;

export async function scraperWebsBodegas(ctx: Contexto): Promise<void> {
  const log = ctx.log;
  // Cliente propio: mismas reglas (UA, robots, 3–5 s por host), pero un solo reintento corto para
  // que una web caída no cueste minutos.
  const limitador = new LimitadorPorHost({ minMs: 3000, maxMs: 5000 });
  const nuevoHttp = () => new ClienteHttp({ log, limitador, backoffMs: [5000], timeoutMs: 20_000 });
  const exclusiones = cargarExclusiones();
  const guardado = ctx.db ? new GuardadoWebs(ctx.db, ctx.fuenteId!, log) : null;

  let bodegas: BodegaConWeb[];
  if (guardado) {
    await guardado.preparar();
    bodegas = guardado.bodegasConWeb();
  } else {
    if (!ctx.opciones.webs) throw new Error("En --dry-run hace falta --webs (fichero .txt, JSON de un dry-run de ribera o URLs separadas por comas)");
    bodegas = bodegasDeArgumento(ctx.opciones.webs);
  }
  const municipios = guardado?.municipios() ?? [...new Set(bodegas.map((b) => b.municipio).filter((m): m is string => !!m))];

  let sitios = agruparPorDominio(bodegas);
  const dominio = ctx.opciones.dominio?.toLowerCase().replace(/^www\./, "");
  if (dominio) sitios = sitios.filter((s) => s.dominio === dominio);
  const lote = parsearLote(ctx.opciones.lote);
  if (lote) sitios = sitios.filter((s) => loteDe(s.dominio, lote.total) === lote.indice);
  // Reanudación: primero los sitios nunca vistos, después los vistos hace más tiempo.
  if (guardado) sitios = guardado.ordenar(sitios);
  if (ctx.limite != null) sitios = sitios.slice(0, ctx.limite);
  const minutos = ctx.opciones.presupuestoMin ? Number(ctx.opciones.presupuestoMin) : PRESUPUESTO_MIN;
  if (!Number.isFinite(minutos) || minutos <= 0) throw new Error("--presupuesto-min debe ser un número positivo");
  const limiteTiempo = Date.now() + minutos * 60_000;
  log.info(`${sitios.length} sitios a rastrear${lote ? ` (lote ${lote.indice}/${lote.total})` : ""}; presupuesto ${minutos} min`);

  const rastreador = new RastreadorSitio(nuevoHttp, { log, exclusiones, municipios });
  const resumen = { aptas: 0, saltadas: new Map<string, number>(), vinos: 0, hechosHistoria: 0, servicios: 0, sinTiempo: 0, conVinos: 0, conHistoria: 0, conEnoturismo: 0 };

  const cola = [...sitios];
  const trabajador = async () => {
    for (let sitio = cola.shift(); sitio; sitio = cola.shift()) {
      if (Date.now() > limiteTiempo) {
        resumen.sinTiempo++;
        continue;
      }
      try {
        await procesar(sitio);
      } catch (e) {
        ctx.contadores.errores++;
        log.error(`${sitio.dominio}: ${(e as Error).message}`);
      }
    }
  };

  const procesar = async (sitio: EntradaSitio) => {
    if (guardado && (await guardado.desactivada(sitio))) {
      contarSalto(resumen.saltadas, "desactivada");
      ctx.contadores.descartados++;
      log.info(`${sitio.dominio}: saltada — ${TEXTO_MOTIVO.desactivada}`);
      return;
    }
    const r = await rastreador.rastrear(sitio);
    log.info(`${sitio.dominio}: ${notaPuerta(r.puerta)}${r.puerta.apta ? ` Extractor ${r.extractor}; ${r.paginas.length} páginas, ${r.vinos.length} vinos, ${r.servicios.length} servicios, ${cuentaHechosHistoria(r.bodega)} hechos de historia (${r.peticiones} peticiones, ${r.segundos} s)` : ""}`);
    for (const a of r.avisos) log.warn(`${sitio.dominio}: ${a}`);
    if (r.puerta.apta) {
      resumen.aptas++;
      resumen.vinos += r.vinos.length;
      resumen.servicios += r.servicios.length;
      resumen.hechosHistoria += cuentaHechosHistoria(r.bodega);
      if (r.vinos.length) resumen.conVinos++;
      if (cuentaHechosHistoria(r.bodega) > 0) resumen.conHistoria++;
      if (r.bodega?.enoturismo) resumen.conEnoturismo++;
    } else {
      contarSalto(resumen.saltadas, r.puerta.motivo!);
      if (r.puerta.motivo === "robots") ctx.contadores.omitidas++;
      else ctx.contadores.descartados++;
    }
    if (guardado) {
      const g = await guardado.guardar(r);
      ctx.contadores.nuevos += g.nuevos;
      ctx.contadores.actualizados += g.actualizados;
      ctx.contadores.sinCambios += g.sinCambios;
      ctx.contadores.revision += g.revision;
      ctx.contadores.errores += g.errores;
    } else {
      ctx.salida.push(await salidaDryRun(r));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, sitios.length) }, trabajador));
  ctx.http.peticiones += rastreador.peticiones;

  const saltadas = [...resumen.saltadas].map(([m, n]) => `${m} ${n}`).join(", ") || "ninguna";
  log.info(
    `Resumen: ${resumen.aptas} aptas de ${sitios.length}; saltadas: ${saltadas}; ${resumen.vinos} vinos (${resumen.conVinos} webs), ` +
      `${resumen.hechosHistoria} hechos de historia (${resumen.conHistoria} webs), ${resumen.servicios} servicios ` +
      `(${resumen.conEnoturismo} webs con enoturismo)${resumen.sinTiempo ? `; ${resumen.sinTiempo} sin tiempo (siguen en la próxima ejecución)` : ""}`,
  );
  if (resumen.sinTiempo) ctx.marcarParcial(`Presupuesto de ${minutos} min agotado: ${resumen.sinTiempo} sitios pendientes`);
}

function contarSalto(m: Map<string, number>, motivo: MotivoSalto) {
  m.set(motivo, (m.get(motivo) ?? 0) + 1);
}

/** Lo que el dry-run deja por sitio: puerta, páginas, hechos y los resúmenes que se generarían. */
async function salidaDryRun(r: ResultadoSitio) {
  const ahora = new Date().toISOString();
  const nombre = r.entrada.bodegas[0]?.nombre;
  const hb = r.bodega ? hechosBodega(r.bodega, "dry-run", r.entrada.url, ahora, nombre) : [];
  return {
    dominio: r.entrada.dominio,
    bodegas: r.entrada.bodegas.map((b) => b.nombre),
    puerta: { ...r.puerta, nota: notaPuerta(r.puerta) },
    huella: r.huella,
    extractor: r.extractor,
    peticiones: r.peticiones,
    segundos: r.segundos,
    avisos: r.avisos,
    paginas: r.paginas,
    bodega: r.bodega,
    resumenes: r.bodega
      ? { historia: await previsualizar("bodega", "historia", hb), descripcion: await previsualizar("bodega", "descripcion", hb) }
      : null,
    vinos: await Promise.all(
      r.vinos.map(async (v) => {
        const h = hechosVino(v, "dry-run", ahora, "Ribera del Duero");
        return { ...v, elaboracion: await previsualizar("anada", "elaboracion", h), cata: await previsualizar("anada", "cata", h) };
      }),
    ),
    servicios: r.servicios,
  };
}
