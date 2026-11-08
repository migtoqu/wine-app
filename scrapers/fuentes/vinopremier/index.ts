// Scraper de Vinopremier (tienda Magento), categorías D.O. Ribera del Duero y Rioja.
// extraer (listado ?p=N + fichas) → normalizar → emparejar (EAN primero, luego bodega + nombre) → guardar.
// Una tienda no crea bodegas: si la bodega no existe, la ficha va a la cola de revisión.
import { readFile } from "node:fs/promises";
import { Emparejador, type BodegaCandidata, type ResultadoEmparejamiento } from "../../emparejamiento/bodegas.ts";
import { EmparejadorVinos, type VinoCatalogo } from "../../emparejamiento/vinos.ts";
import { registrosConocidos } from "../../lib/db.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ParadaFuente } from "../../lib/http.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { claveNombreBodega } from "../../lib/texto.ts";
import { decisionAdmin } from "../../lib/consolidacion/supresiones.ts";
import { bodegasDesdeDryRun } from "../vinoseleccion/index.ts";
import { GuardadoVinopremier, PREFIJO_SUPRIMIDA } from "./guardar.ts";
import { normalizarVino, type VinoNormalizadoVp } from "./normalizar.ts";
import { CATEGORIAS, parsearFicha, parsearListado, urlListado, type Categoria, type TarjetaVp } from "./parsear.ts";

export const SLUG_FUENTE = "vinopremier";

// Ribera tiene 369 productos (24 por página → 16 páginas); el tope protege de un paginador anómalo.
const MAX_PAGINAS = 40;

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

/** Instantánea del catálogo para --dry-run (nunca se lee la BD en dry-run). */
export interface SnapshotCatalogo {
  bodegas: { id: string; nombre: string; marcas?: string[] }[];
  vinos: VinoCatalogo[];
  eans: { ean: string; vinoId: string }[];
}

/** `--bodegas`: instantánea del catálogo (`{bodegas, vinos, eans}`) o JSON de un dry-run de Ribera. */
export async function catalogoDesdeDryRun(ruta: string): Promise<{ bodegas: BodegaCandidata[]; vinos: VinoCatalogo[]; eans: SnapshotCatalogo["eans"] }> {
  const json = JSON.parse(await readFile(ruta, "utf8")) as Partial<SnapshotCatalogo>;
  if (Array.isArray(json.bodegas)) {
    return {
      bodegas: json.bodegas.map((b) => ({ id: b.id, nombre: b.nombre, clave: claveNombreBodega(b.nombre), marcas: b.marcas ?? [] })),
      vinos: json.vinos ?? [],
      eans: json.eans ?? [],
    };
  }
  return { bodegas: await bodegasDesdeDryRun(ruta), vinos: [], eans: [] };
}

/**
 * La bodega manda salvo que el EAN ya sea de un vino del catálogo: entonces el EAN decide cuando
 * el nombre de la tienda no basta («Varma» frente a «Marqués de Vargas»). Si el nombre apunta a
 * otra bodega distinta, se deja tal cual y el guardado lo manda a revisión («EAN de otra bodega»).
 */
export function resolverBodega(
  n: VinoNormalizadoVp,
  emparejador: Emparejador,
  vinoPorEan: (ean: string | null) => { vinoId: string; bodegaId: string } | null,
): ResultadoEmparejamiento {
  const emp = emparejador.emparejar(n.senales);
  const porEan = vinoPorEan(n.ean);
  if (porEan && emp.estado === "revision") {
    return { ...emp, estado: "emparejado", bodegaId: porEan.bodegaId, confianza: 1 };
  }
  return emp;
}

export async function scraperVinopremier(ctx: Contexto): Promise<void> {
  // robots.txt: cada categoría y su paginación ?p=N deben seguir permitidas.
  for (const c of CATEGORIAS) {
    await ctx.http.comprobarRobots(urlListado(c, 1));
    await ctx.http.comprobarRobots(urlListado(c, 2));
  }

  const guardado = ctx.db ? new GuardadoVinopremier(ctx.db, ctx.fuenteId!, ctx.log) : null;
  let bodegas: BodegaCandidata[] = [];
  // En dry-run el catálogo sale de una instantánea (--bodegas); sin ella todo irá a revisión.
  let vinosDry = new EmparejadorVinos([]);
  const eansDry = new Map<string, { vinoId: string; bodegaId: string }>();
  if (guardado) bodegas = await guardado.preparar();
  else if (ctx.rutaBodegas) {
    const c = await catalogoDesdeDryRun(ctx.rutaBodegas);
    bodegas = c.bodegas;
    vinosDry = new EmparejadorVinos(c.vinos, c.eans);
    const bodegaDe = new Map(c.vinos.map((v) => [v.id, v.bodegaId]));
    for (const e of c.eans) if (bodegaDe.has(e.vinoId)) eansDry.set(e.ean, { vinoId: e.vinoId, bodegaId: bodegaDe.get(e.vinoId)! });
    ctx.log.info(`Catálogo de prueba: ${c.vinos.length} vinos, ${c.eans.length} EAN`);
  } else ctx.log.warn("Dry-run sin --bodegas: no hay catálogo con el que emparejar (todo irá a revisión)");
  const emparejador = new Emparejador(bodegas);
  ctx.log.info(`${emparejador.total} bodegas candidatas para emparejar`);
  const vinoPorEan = (ean: string | null) => (guardado ? guardado.vinoPorEan(ean) : ean ? (eansDry.get(ean) ?? null) : null);

  const tarjetas = await listar(ctx);

  if (ctx.db && ctx.limite == null) {
    const conocidos = await registrosConocidos(ctx.db, ctx.fuenteId!);
    if (conocidos > 0 && tarjetas.length < conocidos * 0.5) {
      ctx.marcarParcial(`Volumen anómalo: ${tarjetas.length} productos frente a ${conocidos} conocidos`);
    }
  }

  for (const tarjeta of tarjetas) {
    try {
      const res = await ctx.http.get(tarjeta.url);
      const n = normalizarVino(parsearFicha(res.texto, tarjeta.url), tarjeta.categoria);

      if (n.descarte) {
        ctx.contadores.descartados++;
        await guardado?.guardarRegistro(n, "descartado", null, { motivo: n.descarte });
        if (!guardado) ctx.salida.push({ estado: "descartado", motivo: n.descarte, ...n });
        ctx.log.info(`descartado (${n.descarte}): ${n.datos.nombre}`);
        continue;
      }

      const previo = guardado ? await guardado.registroPrevio(n.idExterno) : null;
      const decision = decisionAdmin(previo);

      // El admin borró la entidad o descartó la ficha: no se vuelve a crear.
      if (guardado && (decision?.tipo === "suprimido" || decision?.tipo === "descartar")) {
        ctx.contadores.descartados++;
        await guardado.guardarRegistro(n, "descartado", null, { motivo: "decisión del admin" });
        continue;
      }

      // Ficha ya vinculada (por una ejecución anterior o por el admin): se reutiliza.
      if (guardado && previo?.entidad_tipo === "anada" && previo.entidad_id) {
        const anada = await guardado.anadaVinculada(previo.entidad_id);
        if (anada) {
          const r = await guardado.guardarVino(n, "", { vinoId: anada.vino_id, anadaId: anada.id, datos: previo.datos });
          if (r.tipo === "guardado" && r.resultado === "actualizado") ctx.contadores.actualizados++;
          else ctx.contadores.sinCambios++;
          continue;
        }
      }

      // Decisión del admin en la cola de revisión: bodega (o vino) elegida a mano.
      let bodegaForzada: string | null = null;
      let vinoForzado: string | undefined;
      if (guardado && (decision?.tipo === "asociar" || decision?.tipo === "crear") && decision.id) {
        if (decision.entidad === "vino") {
          vinoForzado = decision.id;
          bodegaForzada = guardado.bodegaDelVino(decision.id);
        } else if (decision.entidad === "bodega") {
          bodegaForzada = decision.id;
        }
      }

      const emp = bodegaForzada
        ? { estado: "emparejado" as const, bodegaId: bodegaForzada, confianza: 1, candidatos: [] }
        : resolverBodega(n, emparejador, vinoPorEan);
      if (emp.estado === "revision" || !n.vino.tipo) {
        ctx.contadores.revision++;
        const motivo = !n.vino.tipo ? { ...emp, estado: "revision" as const, motivo: "tipo de vino desconocido" } : emp;
        await guardado?.guardarRegistro(n, "revision", null, motivo);
        if (!guardado) ctx.salida.push({ estado: "revision", emparejamiento: motivo, ...n });
        ctx.log.info(
          `revisión (${emp.confianza}): ${n.datos.nombre} — bodega tienda: ${n.senales.bodega ?? "?"}; ` +
            `mejor candidata: ${emp.candidatos[0]?.nombre ?? "ninguna"}`,
        );
        continue;
      }

      if (guardado) {
        // La bodega candidata la borró el admin: no se cuelga el vino de otra.
        if (emp.bodegaId!.startsWith(PREFIJO_SUPRIMIDA)) {
          ctx.contadores.descartados++;
          await guardado.guardarRegistro(n, "descartado", null, emp, emp.bodegaId!.slice(PREFIJO_SUPRIMIDA.length));
          continue;
        }
        const r = await guardado.guardarVino(n, emp.bodegaId!, null, bodegaForzada ? null : emp, {
          vinoId: vinoForzado,
          crear: decision?.tipo === "crear",
        });
        if (r.tipo === "suprimido") {
          ctx.contadores.descartados++;
          await guardado.guardarRegistro(n, "descartado", null, { motivo: "suprimido por el admin" }, r.supresionId);
        } else if (r.tipo === "revision") {
          ctx.contadores.revision++;
          await guardado.guardarRegistro(n, "revision", null, {
            ...emp,
            estado: "revision" as const,
            motivo: r.vino.motivo === "parecido" ? "vino parecido en la bodega" : "EAN de otra bodega",
            vinos: r.vino.candidatos,
          });
        } else if (r.resultado === "nuevo") ctx.contadores.nuevos++;
        else if (r.resultado === "actualizado") ctx.contadores.actualizados++;
        else ctx.contadores.sinCambios++;
      } else {
        // Dry-run: resultado del emparejamiento de vino contra la instantánea.
        const v = vinosDry.emparejar({
          bodegaId: emp.bodegaId!,
          nombre: n.vino.nombre,
          tipo: n.vino.tipo,
          crianza: n.vino.crianza,
          ean: n.ean,
        });
        const estado = v.estado === "revision" ? "revision" : "emparejado";
        if (estado === "revision") ctx.contadores.revision++;
        ctx.salida.push({ estado, emparejamiento: emp, emparejamientoVino: v, ...n });
        ctx.log.info(
          `${estado} (${emp.confianza}): ${n.datos.nombre} → ${emp.candidatos[0]?.nombre ?? "bodega por EAN"}; vino: ${v.estado}${v.motivo ? ` (${v.motivo})` : ""}`,
        );
      }
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
}
