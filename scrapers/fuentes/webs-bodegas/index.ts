// Webs oficiales de las bodegas: crawler genérico (WordPress + Woo, sitemap y HTML; Wix por
// sitemap + JSON-LD; Shopify como punto de extensión). Por sitio: puerta legal → descubrimiento →
// hechos → consolidación con origen «bodega» (web oficial).
import type { Contexto } from "../../lib/ejecucion.ts";
import { ClienteHttp } from "../../lib/http.ts";
import { LimitadorPorHost } from "../../lib/rate-limit.ts";
import { decidirDenominacion, denominacionesDeSemillas, ResolutorDenominaciones } from "./denominacion.ts";
import { agruparPorDominio, bodegasDeArgumento, candidatasDeArgumento, loteDe, parsearLote, type BodegaConWeb } from "./entrada.ts";
import { GuardadoWebs } from "./guardar.ts";
import { cuentaHechosHistoria, hechosBodega, hechosVino, previsualizar } from "./normalizar.ts";
import { cargarExclusiones, notaPuerta, TEXTO_MOTIVO, type MotivoSalto } from "./puerta.ts";
import { RastreadorSitio, type EntradaSitio, type ResultadoSitio } from "./sitio.ts";

export const SLUG_FUENTE = "webs-bodegas";

/** Dominios rastreados a la vez (cada uno con su propia cola de 3–5 s; SOURCES §3: ≤ 8). */
const CONCURRENCIA = 8;
const PRESUPUESTO_MIN = 45;

export async function scraperWebsBodegas(ctx: Contexto): Promise<void> {
  const log = ctx.log;
  // Cliente propio: mismas reglas (UA, robots, 3–5 s por host), pero un solo reintento corto para
  // que una web caída no cueste minutos.
  const limitador = new LimitadorPorHost({ minMs: 3000, maxMs: 5000 });
  const nuevoHttp = () => new ClienteHttp({ log, limitador, backoffMs: [5000], timeoutMs: 20_000 });
  const exclusiones = cargarExclusiones();
  const guardado = ctx.db ? new GuardadoWebs(ctx.db, ctx.fuenteId!, log) : null;
  const descubrirWebs = ctx.opciones.descubrirWebs === "1";

  let bodegas: BodegaConWeb[];
  let candidatas: EntradaSitio[] = [];
  let resolutor: ResolutorDenominaciones;
  if (guardado) {
    await guardado.preparar();
    bodegas = guardado.bodegasConWeb();
    resolutor = guardado.resolutor();
    if (descubrirWebs || !ctx.opciones.dominio) candidatas = guardado.candidatasWeb();
  } else {
    if (!ctx.opciones.webs) throw new Error("En --dry-run hace falta --webs (fichero .txt, JSON de un dry-run de ribera o rioja, o URLs separadas por comas)");
    bodegas = bodegasDeArgumento(ctx.opciones.webs);
    resolutor = new ResolutorDenominaciones(denominacionesDeSemillas());
    if (descubrirWebs) candidatas = candidatasDeArgumento(ctx.opciones.webs, bodegas);
  }
  const dosPorBodega = new Map(bodegas.map((b) => [b.id ?? b.nombre, b.denominaciones ?? []]));
  const municipios = guardado?.municipios() ?? [...new Set(bodegas.map((b) => b.municipio).filter((m): m is string => !!m))];

  let sitios = [...agruparPorDominio(bodegas), ...candidatas];
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
  log.info(
    `${sitios.length} sitios a rastrear (${sitios.filter((s) => s.candidata).length} webs candidatas)` +
      `${lote ? ` (lote ${lote.indice}/${lote.total})` : ""}; presupuesto ${minutos} min`,
  );

  const rastreador = new RastreadorSitio(nuevoHttp, {
    log, exclusiones, municipios, denominaciones: resolutor, previas: guardado ? (d) => guardado.previas(d) : undefined,
  });
  const resumen = {
    aptas: 0, saltadas: new Map<string, number>(), vinos: 0, hechosHistoria: 0, servicios: 0, sinTiempo: 0, conVinos: 0,
    conHistoria: 0, conEnoturismo: 0, imagenesBodega: 0, botellas: 0, doOtra: 0, doSin: 0, doRevision: 0,
    serviciosConIncluye: 0, serviciosConPrecio: 0, serviciosConDuracion: 0, websVerificadas: 0, websDudosas: 0, websNo: 0,
    sinCambios: 0, subdominios: 0, ofertas: 0, conTienda: 0,
  };

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
    if (guardado && !sitio.candidata && (await guardado.desactivada(sitio))) {
      contarSalto(resumen.saltadas, "desactivada");
      ctx.contadores.descartados++;
      log.info(`${sitio.dominio}: saltada — ${TEXTO_MOTIVO.desactivada}`);
      return;
    }
    const r = await rastreador.rastrear(sitio);
    const etiqueta = sitio.candidata ? ` [web candidata por ${sitio.candidata.origen} de ${sitio.bodegas[0]?.nombre}: ${r.verificacion?.estado ?? "sin portada"}]` : "";
    log.info(
      `${sitio.dominio}${etiqueta}: ${notaPuerta(r.puerta)}` +
        (r.puerta.apta
          ? ` Extractor ${r.extractor}; ${r.paginas.length} páginas (${r.sinCambios.length} sin cambios), ${r.vinos.length} vinos, ` +
            `${r.servicios.length} servicios, ${cuentaHechosHistoria(r.bodega)} hechos de historia, imagen ${r.imagen ? "sí" : "no"} ` +
            `(${r.peticiones} peticiones, ${r.segundos} s)`
          : ""),
    );
    for (const a of r.avisos) log.warn(`${sitio.dominio}: ${a}`);
    if (sitio.candidata) {
      if (!r.puerta.apta && r.puerta.motivo !== "no_verificada") resumen.websNo++;
      else if (r.verificacion?.estado === "verificada") resumen.websVerificadas++;
      else if (r.verificacion?.estado === "dudosa") resumen.websDudosas++;
      else resumen.websNo++;
    }
    if (r.puerta.apta && (!sitio.candidata || r.verificacion?.estado === "verificada")) {
      resumen.aptas++;
      resumen.vinos += r.vinos.length;
      resumen.servicios += r.servicios.length;
      resumen.hechosHistoria += cuentaHechosHistoria(r.bodega);
      resumen.sinCambios += r.sinCambios.length;
      if (r.hosts.length > 1) resumen.subdominios++;
      if (r.vinos.length) resumen.conVinos++;
      if (cuentaHechosHistoria(r.bodega) > 0) resumen.conHistoria++;
      if (r.bodega?.enoturismo) resumen.conEnoturismo++;
      if (r.imagen) resumen.imagenesBodega++;
      // Las D.O. de la bodega (BD en real, JSON en dry-run): un vino sin D.O. en la ficha las hereda.
      const dos = sitio.bodegas.flatMap((b) => (guardado && b.id ? guardado.denominacionesDe(b.id) : dosPorBodega.get(b.id ?? b.nombre) ?? []));
      const ofertasSitio = r.vinos.reduce((n, v) => n + v.ofertas.filter((o) => o.precio != null && o.unidades === 1).length, 0);
      resumen.ofertas += ofertasSitio;
      if (ofertasSitio) resumen.conTienda++;
      for (const v of r.vinos) {
        if (v.imagen) resumen.botellas++;
        const d = decidirDenominacion(v.denominacion, dos, { vino: v.nombre, bodega: sitio.bodegas[0]?.nombre ?? "" });
        if (d.estado === "revision") resumen.doRevision++;
        else if (d.estado === "sin_do") resumen.doSin++;
        else if (!dos.some((x) => x.slug === d.denominacion.slug)) resumen.doOtra++;
      }
      for (const s of r.servicios) {
        if (s.incluye.length) resumen.serviciosConIncluye++;
        if (s.precio_desde != null) resumen.serviciosConPrecio++;
        if (s.duracion_minutos != null) resumen.serviciosConDuracion++;
      }
    } else if (!sitio.candidata) {
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
      ctx.salida.push(await salidaDryRun(r, sitio.bodegas.flatMap((b) => dosPorBodega.get(b.id ?? b.nombre) ?? [])));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, sitios.length) }, trabajador));
  ctx.http.peticiones += rastreador.peticiones;

  const saltadas = [...resumen.saltadas].map(([m, n]) => `${m} ${n}`).join(", ") || "ninguna";
  log.info(
    `Resumen: ${resumen.aptas} aptas de ${sitios.length - candidatas.length}${candidatas.length ? ` (+ webs candidatas: ${resumen.websVerificadas} verificadas, ${resumen.websDudosas} dudosas, ${resumen.websNo} descartadas)` : ""}; ` +
      `saltadas: ${saltadas}; ${resumen.vinos} vinos (${resumen.conVinos} webs; ${resumen.doOtra} de otra D.O., ${resumen.doSin} sin D.O., ` +
      `${resumen.doRevision} a revisión por D.O.; ${resumen.botellas} con imagen de botella), ${resumen.hechosHistoria} hechos de historia ` +
      `(${resumen.conHistoria} webs), ${resumen.servicios} servicios (${resumen.conEnoturismo} webs con enoturismo; ` +
      `${resumen.serviciosConIncluye} con «incluye», ${resumen.serviciosConPrecio} con precio, ${resumen.serviciosConDuracion} con duración), ` +
      `${resumen.ofertas} ofertas con precio (${resumen.conTienda} webs con tienda), ${resumen.imagenesBodega} imágenes de bodega, ${resumen.subdominios} webs con subdominios, ${resumen.sinCambios} páginas sin cambios` +
      `${resumen.sinTiempo ? `; ${resumen.sinTiempo} sin tiempo (siguen en la próxima ejecución)` : ""}`,
  );
  if (resumen.sinTiempo) ctx.marcarParcial(`Presupuesto de ${minutos} min agotado: ${resumen.sinTiempo} sitios pendientes`);
}

function contarSalto(m: Map<string, number>, motivo: MotivoSalto) {
  m.set(motivo, (m.get(motivo) ?? 0) + 1);
}

/** Lo que el dry-run deja por sitio: puerta, páginas, hechos y los resúmenes que se generarían. */
async function salidaDryRun(r: ResultadoSitio, dos: ReturnType<ResolutorDenominaciones["porSlugDe"]>[]) {
  const ahora = new Date().toISOString();
  const nombre = r.entrada.bodegas[0]?.nombre;
  const hb = r.bodega ? hechosBodega(r.bodega, "dry-run", r.entrada.url, ahora, nombre) : [];
  const dosBodega = dos.filter((d): d is NonNullable<typeof d> => !!d);
  return {
    dominio: r.entrada.dominio,
    bodegas: r.entrada.bodegas.map((b) => b.nombre),
    candidata: r.entrada.candidata ?? null,
    verificacion: r.verificacion,
    puerta: { ...r.puerta, nota: notaPuerta(r.puerta) },
    huella: r.huella,
    extractor: r.extractor,
    hosts: r.hosts,
    peticiones: r.peticiones,
    segundos: r.segundos,
    avisos: r.avisos,
    paginas: r.paginas,
    bodega: r.bodega,
    imagen: r.imagen,
    resumenes: r.bodega
      ? { historia: await previsualizar("bodega", "historia", hb), descripcion: await previsualizar("bodega", "descripcion", hb) }
      : null,
    vinos: await Promise.all(
      r.vinos.map(async (v) => {
        const decision = decidirDenominacion(v.denominacion, dosBodega, { vino: v.nombre, bodega: r.entrada.bodegas[0]?.nombre ?? "" });
        const den = decision.estado === "asignada" ? decision.denominacion.nombre : decision.deteccion?.texto ?? null;
        const h = hechosVino(v, "dry-run", ahora, den);
        return {
          ...v,
          decision_do: decision.estado === "asignada" ? { estado: "asignada", slug: decision.denominacion.slug, origen: decision.deteccion.origen } : decision,
          elaboracion: await previsualizar("anada", "elaboracion", h),
          cata: await previsualizar("anada", "cata", h),
        };
      }),
    ),
    servicios: r.servicios,
  };
}
