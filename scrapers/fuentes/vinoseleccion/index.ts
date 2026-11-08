// Scraper de Vinoselección, categoría D.O. Ribera del Duero.
// extraer (listado ?p=N + fichas) → normalizar → emparejar con bodegas → guardar.
import { readFile } from "node:fs/promises";
import { Emparejador, type BodegaCandidata } from "../../emparejamiento/bodegas.ts";
import { registrosConocidos } from "../../lib/db.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ParadaFuente } from "../../lib/http.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { claveNombreBodega } from "../../lib/texto.ts";
import { decisionAdmin } from "../../lib/consolidacion/supresiones.ts";
import { GuardadoVinoseleccion, PREFIJO_SUPRIMIDA } from "./guardar.ts";
import { normalizarVino } from "./normalizar.ts";
import { parsearFicha, parsearListado, rutaProducto, urlListado, type TarjetaVs } from "./parsear.ts";

export const SLUG_FUENTE = "vinoseleccion";

// Hoy son 30 páginas. Pedir páginas por encima de la última devuelve productos
// repetidos, así que se para al repetir o al pasar el máximo del paginador.
const MAX_PAGINAS = 80;

async function listar(ctx: Contexto): Promise<TarjetaVs[]> {
  const tarjetas: TarjetaVs[] = [];
  const vistas = new Set<string>();
  let maxPagina = 1;
  for (let pagina = 1; pagina <= Math.min(maxPagina, MAX_PAGINAS); pagina++) {
    const listado = parsearListado((await ctx.http.get(urlListado(pagina))).texto);
    maxPagina = Math.max(maxPagina, listado.maxPagina ?? 0);
    const nuevas = listado.tarjetas.filter((t) => !vistas.has(t.url));
    if (nuevas.length === 0) {
      ctx.log.info(`Página ${pagina} sin productos nuevos; fin del listado`);
      break;
    }
    for (const t of nuevas) {
      vistas.add(t.url);
      tarjetas.push(t);
    }
    if (ctx.limite != null && tarjetas.length >= ctx.limite) return tarjetas.slice(0, ctx.limite);
  }
  if (maxPagina > MAX_PAGINAS) ctx.marcarParcial(`Paginador anómalo: ${maxPagina} páginas`);
  ctx.log.info(`Listado: ${tarjetas.length} productos en ${Math.min(maxPagina, MAX_PAGINAS)} páginas`);
  return tarjetas;
}

/** Bodegas para --dry-run desde el JSON de un dry-run de Ribera (nunca de la BD). */
export async function bodegasDesdeDryRun(ruta: string): Promise<BodegaCandidata[]> {
  const json = JSON.parse(await readFile(ruta, "utf8")) as {
    registros?: { idExterno: string; campos: { nombre: string }; datos: { claves_marcas?: string[] } }[];
  };
  return (json.registros ?? []).map((r) => ({
    id: r.idExterno,
    nombre: r.campos.nombre,
    clave: claveNombreBodega(r.campos.nombre),
    marcas: r.datos.claves_marcas ?? [],
  }));
}

export async function scraperVinoseleccion(ctx: Contexto): Promise<void> {
  // robots.txt: la categoría y su paginación ?p=N deben seguir permitidas.
  await ctx.http.comprobarRobots(urlListado(1));
  await ctx.http.comprobarRobots(urlListado(2));

  const guardado = ctx.db ? new GuardadoVinoseleccion(ctx.db, ctx.fuenteId!, ctx.log) : null;
  let bodegas: BodegaCandidata[] = [];
  if (guardado) bodegas = await guardado.preparar();
  else if (ctx.rutaBodegas) bodegas = await bodegasDesdeDryRun(ctx.rutaBodegas);
  else ctx.log.warn("Dry-run sin --bodegas: no hay bodegas con las que emparejar (todo irá a revisión)");
  const emparejador = new Emparejador(bodegas);
  ctx.log.info(`${emparejador.total} bodegas candidatas para emparejar`);

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
      const n = normalizarVino(parsearFicha(res.texto, tarjeta.url), tarjeta, rutaProducto(tarjeta.url));

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
        : emparejador.emparejar(n.senales);
      const sinTipo = emp.estado === "emparejado" && !n.vino.tipo;
      if (emp.estado === "revision" || sinTipo) {
        ctx.contadores.revision++;
        const motivo = sinTipo ? { ...emp, estado: "revision" as const, motivo: "tipo de vino desconocido" } : emp;
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
        ctx.salida.push({ estado: "emparejado", emparejamiento: emp, ...n });
        ctx.log.info(`emparejado (${emp.confianza}, ${emp.candidatos[0]?.motivo}): ${n.datos.nombre} → ${emp.candidatos[0]?.nombre}`);
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
