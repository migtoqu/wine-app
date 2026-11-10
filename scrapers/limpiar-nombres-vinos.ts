// Limpieza de nombres de vino con palabras de plantilla («Ficha X», «X – Etiquetado nutricional»,
// «Info nutricional X», «X + Ficha Técnica», «Fichas de producto»), cargados por webs-bodegas antes
// de filtrarlas. EN SECO POR DEFECTO: solo lista lo que haría.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scrapers/limpiar-nombres-vinos.ts            # en seco
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scrapers/limpiar-nombres-vinos.ts --aplicar  # solo renombra
//
// Por cada vino con nombre basura propone una acción:
//   * renombrar: nombre limpio y slug nuevo, si no hay otro vino con ese nombre en la bodega. Con
//     --aplicar se escribe (y la procedencia del nombre queda en la web de la bodega, que es de donde
//     salió). Si el admin ya editó el nombre (procedencia «admin»), no se toca.
//   * fusionar: ya hay un vino con el nombre limpio en la misma bodega → lista para que el admin
//     ejecute `admin_fusionar('vino', origen, destino)` (pasa añadas, ofertas, imágenes… y deja la
//     supresión que evita recrearlo).
//   * borrar: el nombre solo era plantilla («Fichas de producto») → lista para borrar desde admin
//     (el borrado del admin deja la supresión).
// Fusionar y borrar nunca los hace el script: son decisiones del admin.
import { parseArgs } from "node:util";
import { crearClienteDb, sinError, type ClienteDb } from "./lib/db.ts";
import { claveTexto, slugify } from "./lib/texto.ts";
import { esNombreDeVino, nombreVino } from "./fuentes/webs-bodegas/extraer.ts";

/** Nombres con palabras de plantilla (mismo criterio que los filtros de webs-bodegas). */
export const NOMBRE_BASURA = /\b(fichas?|nutricional(?:es)?|etiquetado|ingredientes|al[eé]rgenos|sheets?|nutritional|nutrition facts)\b/i;

export interface VinoLimpieza {
  id: string;
  nombre: string;
  slug: string;
  bodegaId: string;
  bodega: string;
  bodegaSlug: string;
  anadas: number;
  /** La procedencia del campo `nombre` es «admin». */
  nombreDeAdmin?: boolean;
}

export type Accion =
  | { tipo: "renombrar"; vino: VinoLimpieza; nombre: string; slug: string }
  | { tipo: "fusionar"; vino: VinoLimpieza; destino: { id: string; nombre: string; slug: string } }
  | { tipo: "borrar"; vino: VinoLimpieza; motivo: string }
  | { tipo: "omitir"; vino: VinoLimpieza; motivo: string };

/**
 * Acción para cada vino con nombre basura. `todos`: todos los vinos de las bodegas afectadas (para
 * buscar el homónimo limpio). `slugs`: slugs ya usados en `vinos` (el slug es único global).
 */
export function proponerLimpieza(basura: VinoLimpieza[], todos: VinoLimpieza[], slugs: Set<string>): Accion[] {
  const usados = new Set(slugs);
  const out: Accion[] = [];
  for (const v of basura) {
    if (v.nombreDeAdmin) {
      out.push({ tipo: "omitir", vino: v, motivo: "el admin editó el nombre" });
      continue;
    }
    const limpio = nombreVino(v.nombre);
    if (!limpio || !esNombreDeVino(limpio) || NOMBRE_BASURA.test(limpio)) {
      out.push({ tipo: "borrar", vino: v, motivo: `solo es plantilla («${v.nombre}»)` });
      continue;
    }
    if (limpio.length < 3) {
      out.push({ tipo: "omitir", vino: v, motivo: `nombre limpio demasiado corto («${limpio}»): revisar a mano` });
      continue;
    }
    const clave = claveTexto(limpio);
    const homonimo = todos.find((x) => x.bodegaId === v.bodegaId && x.id !== v.id && claveTexto(x.nombre) === clave);
    if (homonimo) {
      out.push({ tipo: "fusionar", vino: v, destino: { id: homonimo.id, nombre: homonimo.nombre, slug: homonimo.slug } });
      continue;
    }
    // Dos fichas basura de la misma bodega que limpian al mismo nombre: la segunda se fusiona con la primera.
    const previo = out.find((a): a is Extract<Accion, { tipo: "renombrar" }> => a.tipo === "renombrar" && a.vino.bodegaId === v.bodegaId && claveTexto(a.nombre) === clave);
    if (previo) {
      out.push({ tipo: "fusionar", vino: v, destino: { id: previo.vino.id, nombre: previo.nombre, slug: previo.slug } });
      continue;
    }
    const base = slugify(limpio) || "vino";
    const candidatos = [base, `${v.bodegaSlug}-${base}`, ...Array.from({ length: 20 }, (_, i) => `${v.bodegaSlug}-${base}-${i + 2}`)];
    usados.delete(v.slug); // su propio slug se puede reutilizar
    const slug = candidatos.find((c) => !usados.has(c)) ?? `${base}-${v.id.slice(0, 8)}`;
    usados.add(slug);
    out.push({ tipo: "renombrar", vino: v, nombre: limpio, slug });
  }
  return out;
}

async function leer(db: ClienteDb) {
  const todos: (VinoLimpieza & { fuenteId: string | null })[] = [];
  const slugs = new Set<string>();
  for (let desde = 0; ; desde += 1000) {
    const filas = sinError(
      await db.from("vinos").select("id, nombre, slug, bodega_id, fuente_id, bodega:bodegas!inner(nombre, slug), anadas(id)").order("id").range(desde, desde + 999),
      "leer vinos",
    );
    for (const f of filas) {
      slugs.add(f.slug);
      const b = f.bodega as unknown as { nombre: string; slug: string };
      todos.push({
        id: f.id, nombre: f.nombre, slug: f.slug, bodegaId: f.bodega_id, bodega: b.nombre, bodegaSlug: b.slug,
        anadas: (f.anadas as unknown[] | null)?.length ?? 0, fuenteId: f.fuente_id,
      });
    }
    if (filas.length < 1000) break;
  }
  const basura = todos.filter((v) => NOMBRE_BASURA.test(v.nombre));
  if (basura.length) {
    const procs = sinError(
      await db.from("procedencia_campos").select("entidad_id, origen").eq("entidad_tipo", "vino").eq("campo", "nombre").in("entidad_id", basura.map((v) => v.id)),
      "leer procedencia",
    );
    const admin = new Set(procs.filter((p) => p.origen === "admin").map((p) => p.entidad_id));
    for (const v of basura) v.nombreDeAdmin = admin.has(v.id);
  }
  return { todos, basura, slugs };
}

function informe(acciones: Accion[]): string {
  const l: string[] = [];
  const por = (t: Accion["tipo"]) => acciones.filter((a) => a.tipo === t);
  l.push(`${acciones.length} vinos con nombre de plantilla: ${por("renombrar").length} renombrar, ${por("fusionar").length} fusionar, ${por("borrar").length} borrar, ${por("omitir").length} omitir`);
  for (const a of acciones) {
    const v = `«${a.vino.nombre}» (${a.vino.bodega}, ${a.vino.anadas} añadas, ${a.vino.id})`;
    if (a.tipo === "renombrar") l.push(`RENOMBRAR ${v} → «${a.nombre}» [${a.vino.slug} → ${a.slug}]`);
    else if (a.tipo === "fusionar") l.push(`FUSIONAR  ${v} → «${a.destino.nombre}»   select public.admin_fusionar('vino', '${a.vino.id}', '${a.destino.id}');`);
    else if (a.tipo === "borrar") l.push(`BORRAR    ${v}: ${a.motivo} (desde /admin, para que quede la supresión)`);
    else l.push(`OMITIR    ${v}: ${a.motivo}`);
  }
  return l.join("\n");
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { aplicar: { type: "boolean", default: false } } });
  const db = crearClienteDb();
  const { todos, basura, slugs } = await leer(db);
  const acciones = proponerLimpieza(basura, todos, slugs);
  console.log(informe(acciones));
  if (!values.aplicar) {
    console.log("\nEn seco: no se ha cambiado nada (--aplicar solo renombra; fusionar y borrar son del admin).");
    return 0;
  }
  let n = 0;
  for (const a of acciones) {
    if (a.tipo !== "renombrar") continue;
    // El slug es único global: si otra fila lo tomó entretanto, se informa y se sigue.
    const r = await db.from("vinos").update({ nombre: a.nombre, slug: a.slug }).eq("id", a.vino.id);
    if (r.error) {
      console.error(`No se pudo renombrar ${a.vino.id}: ${r.error.message}`);
      continue;
    }
    n++;
  }
  console.log(`\n${n} vinos renombrados.`);
  return 0;
}

if (process.argv[1]?.endsWith("limpiar-nombres-vinos.ts")) {
  main().then(
    (c) => (process.exitCode = c),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    },
  );
}
