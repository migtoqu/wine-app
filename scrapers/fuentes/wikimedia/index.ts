// Fotos de bodega desde Wikimedia Commons (licencias libres, atribución obligatoria).
// 1. Recorre el árbol público de categorías «Wineries in Spain…» (HTML de /wiki/Category:…).
// 2. Empareja cada categoría de bodega con una del catálogo por nombre (y provincia de la ruta).
// 3. Lee la ficha /wiki/File:… de sus mejores archivos: licencia libre, autor, tamaño.
// 4. Enlaza la imagen (upload.wikimedia.org) con «Autor · Licencia · Wikimedia Commons · ficha».
// Nada se descarga ni se copia: solo la URL y la atribución. Nunca la API (/w/) ni /sparql: robots.txt los excluye.
import { readFile } from "node:fs/promises";
import { cargarSupresiones, clavesImagenesSuprimidas } from "../../lib/consolidacion/supresiones.ts";
import { sinError } from "../../lib/db.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ErrorHttp, ParadaFuente } from "../../lib/http.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { claveNombreBodega } from "../../lib/texto.ts";
import {
  archivoValido, atribucion, emparejarCategoria, esCategoriaDeBodega, esContenedora, ORIGEN, ordenarArchivos, parsearArchivo,
  parsearCategoria, RAICES, tipoArchivo, urlWiki, type BodegaRef, type FichaArchivo,
} from "./commons.ts";

export const SLUG_FUENTE = "wikimedia-commons";

/** Como mucho, fichas de archivo leídas por bodega antes de rendirse. */
const ARCHIVOS_POR_BODEGA = 3;
const MAX_CATEGORIAS = 900;
const PROFUNDIDAD = 4;

interface Hallazgo {
  bodega: BodegaRef;
  categoria: string;
  ruta: string[];
  archivo: FichaArchivo | null;
  descartes: string[];
}

async function bodegasDesdeJson(ruta: string): Promise<BodegaRef[]> {
  const json = JSON.parse(await readFile(ruta, "utf8")) as BodegaRef[] | { bodegas: BodegaRef[] };
  return Array.isArray(json) ? json : json.bodegas;
}

async function bodegasDeBd(ctx: Contexto): Promise<BodegaRef[]> {
  const out: BodegaRef[] = [];
  for (let d = 0; ; d += 1000) {
    const filas = sinError(await ctx.db!.from("bodegas").select("id, nombre, provincia, municipio").order("id").range(d, d + 999), "leer bodegas");
    out.push(...filas);
    if (filas.length < 1000) return out;
  }
}

async function pedir(ctx: Contexto, url: string): Promise<string | null> {
  try {
    return (await ctx.http.get(url)).texto;
  } catch (e) {
    if (e instanceof ParadaFuente) throw e;
    if (e instanceof RobotsDenegado || e instanceof ErrorHttp) {
      ctx.log.warn(`${url}: ${(e as Error).message}`);
      return null;
    }
    throw e;
  }
}

export async function scraperWikimedia(ctx: Contexto): Promise<void> {
  const bodegas = ctx.db ? await bodegasDeBd(ctx) : ctx.rutaBodegas ? await bodegasDesdeJson(ctx.rutaBodegas) : [];
  if (!bodegas.length) ctx.log.warn("Sin bodegas con las que emparejar (en dry-run, pásalas con --bodegas)");
  const porClave = new Map<string, BodegaRef[]>();
  for (const b of bodegas) {
    const k = claveNombreBodega(b.nombre);
    porClave.set(k, [...(porClave.get(k) ?? []), b]);
  }

  // 1–2. Árbol de categorías (BFS) y emparejamiento.
  const vistas = new Set<string>();
  const cola: { titulo: string; ruta: string[]; nivel: number }[] = RAICES.map((t) => ({ titulo: t.replace(/_/g, " "), ruta: [], nivel: 0 }));
  const porBodega = new Map<string, { bodega: BodegaRef; categoria: string; ruta: string[]; archivos: ReturnType<typeof parsearCategoria>["archivos"] }>();
  let categoriasBodega = 0;
  while (cola.length && vistas.size < MAX_CATEGORIAS) {
    const { titulo, ruta, nivel } = cola.shift()!;
    if (vistas.has(titulo)) continue;
    vistas.add(titulo);
    const deBodega = !esContenedora(titulo) && nivel > 0;
    // Una categoría de bodega solo interesa si es de una del catálogo: no se pide si no empareja.
    const bodega = deBodega ? emparejarCategoria(titulo, ruta, porClave) : null;
    if (deBodega && (!esCategoriaDeBodega(titulo) || !bodega)) continue;
    if (deBodega) categoriasBodega++;
    const html = await pedir(ctx, urlWiki(titulo));
    if (!html) continue;
    const pagina = parsearCategoria(html);
    if (bodega) {
      const previa = porBodega.get(bodega.id);
      if (previa) previa.archivos.push(...pagina.archivos);
      else porBodega.set(bodega.id, { bodega, categoria: titulo, ruta, archivos: pagina.archivos });
      continue; // no se baja a subcategorías de una bodega (interiores, botellas…)
    }
    if (nivel >= PROFUNDIDAD) continue;
    for (const sub of pagina.subcategorias) if (!vistas.has(sub.titulo)) cola.push({ titulo: sub.titulo, ruta: [...ruta, titulo], nivel: nivel + 1 });
  }
  ctx.log.info(`${vistas.size} categorías recorridas; ${categoriasBodega} de bodegas del catálogo; ${porBodega.size} bodegas emparejadas`);

  // 3. Fichas de archivo.
  const hallazgos: Hallazgo[] = [];
  let procesadas = 0;
  for (const { bodega, categoria, ruta, archivos } of porBodega.values()) {
    if (ctx.limite != null && procesadas >= ctx.limite) break;
    procesadas++;
    const h: Hallazgo = { bodega, categoria, ruta, archivo: null, descartes: [] };
    for (const a of ordenarArchivos(archivos).slice(0, ARCHIVOS_POR_BODEGA)) {
      const html = await pedir(ctx, a.url);
      if (!html) continue;
      const f = parsearArchivo(html, a.titulo);
      const motivo = archivoValido(f);
      if (motivo) {
        h.descartes.push(`${a.titulo}: ${motivo}`);
        continue;
      }
      // El host de la imagen también debe permitirlo robots.txt (upload.wikimedia.org lo permite).
      try {
        await ctx.http.comprobarRobots(f.imagen);
      } catch {
        h.descartes.push(`${a.titulo}: robots.txt excluye la imagen`);
        continue;
      }
      h.archivo = f;
      break;
    }
    if (!h.archivo && !archivos.length) h.descartes.push("categoría sin archivos");
    hallazgos.push(h);
    ctx.log.info(`${bodega.nombre} ← ${categoria}: ${h.archivo ? `${h.archivo.titulo} (${h.archivo.licencia}, ${h.archivo.autor ?? "s/a"})` : `sin foto válida (${h.descartes.join("; ") || "sin candidatas"})`}`);
  }

  const conFoto = hallazgos.filter((h) => h.archivo);
  ctx.log.info(`Resumen: ${porBodega.size} bodegas emparejadas, ${conFoto.length} con foto de licencia libre, ${ctx.http.peticiones} peticiones`);

  if (!ctx.db) {
    ctx.salida.push(...hallazgos.map((h) => ({
      bodega: h.bodega, categoria: h.categoria, ruta: h.ruta, descartes: h.descartes,
      imagen: h.archivo ? { url: h.archivo.imagen, tipo: tipoArchivo(h.archivo.titulo), atribucion: atribucion(h.archivo), ficha: h.archivo.url } : null,
    })));
    ctx.contadores.nuevos = conFoto.length;
    return;
  }

  // 4. Guardar: una imagen por bodega de esta fuente; respeta las supresiones del admin.
  const suprimidas = clavesImagenesSuprimidas(await cargarSupresiones(ctx.db, "imagen"));
  for (const h of conFoto) {
    const f = h.archivo!;
    if (suprimidas.has(`${h.bodega.id}|${f.imagen}`)) {
      ctx.contadores.descartados++;
      continue;
    }
    const actuales = sinError(await ctx.db.from("imagenes").select("id, url, fuente_id, atribucion").eq("bodega_id", h.bodega.id), "leer imágenes");
    const propia = actuales.find((i) => i.fuente_id === ctx.fuenteId);
    const fila = { url: f.imagen, tipo: tipoArchivo(f.titulo), atribucion: atribucion(f), alt: null };
    if (propia) {
      if (propia.url === fila.url && propia.atribucion === fila.atribucion) ctx.contadores.sinCambios++;
      else {
        sinError(await ctx.db.from("imagenes").update(fila).eq("id", propia.id), "actualizar imagen");
        ctx.contadores.actualizados++;
      }
      continue;
    }
    // Detrás de la foto de la web oficial (orden 5): la tarjeta y la portada prefieren la propia.
    sinError(
      await ctx.db.from("imagenes").insert({ ...fila, bodega_id: h.bodega.id, fuente_id: ctx.fuenteId, principal: false, orden: 5 }),
      "guardar imagen",
    );
    ctx.contadores.nuevos++;
  }
  // Registro por bodega emparejada (trazabilidad y revisión del admin).
  for (const h of hallazgos) {
    sinError(
      await ctx.db.from("registros_fuente").upsert(
        {
          fuente_id: ctx.fuenteId!, id_externo: h.categoria, url: urlWiki(h.categoria),
          datos: JSON.parse(JSON.stringify({ ruta: h.ruta, archivo: h.archivo, descartes: h.descartes })),
          entidad_tipo: "bodega", entidad_id: h.bodega.id, estado_emparejamiento: "emparejado", confianza_emparejamiento: 0.9,
          visto_por_ultima_vez: new Date().toISOString(),
        },
        { onConflict: "fuente_id,id_externo" },
      ),
      "guardar registro",
    );
  }
}

export { ORIGEN };
