// Mide el emparejamiento con casos reales etiquetados a mano (fixtures/):
//   - bodegas-casos.json: fichas de otras fuentes (Ruta del Vino Ribera, nombres de
//     bodega de los vinos de Rioja) con su bodega esperada o «distinto».
//   - catálogo contra sí mismo (leave-one-out): cada bodega o vino del catálogo frente
//     al resto; vincular automáticamente es un falso positivo (salvo duplicados del
//     catálogo ya conocidos, que se listan aparte para que el admin los fusione).
//   - vinos-casos.json: los «parecidos» de la cola de revisión, etiquetados.
// Uso: node scrapers/emparejamiento/evaluar.ts [--detalle]
import { readFileSync } from "node:fs";
import { EmparejadorBodegas, type BodegaCatalogo, type DatosBodega } from "./entidades.ts";
import { EmparejadorVinos, type SenalesVinoBodega, type VinoCatalogo } from "./vinos.ts";

const dir = new URL("./fixtures/", import.meta.url);
const leer = <T>(f: string): T => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as T;

type Clase = "duplicado" | "distinto" | "dudoso";
interface CasoBodega {
  fuente: string;
  clase: Clase;
  esperado: string | null;
  nota?: string;
  entrada: DatosBodega;
}
interface CasoVino {
  fuente: string;
  clase: Clase;
  esperado: string | null;
  candidatoActual: string;
  nota?: string;
  entrada: SenalesVinoBodega;
}

export interface Metricas {
  casos: number;
  duplicados: number;
  /** Duplicados vinculados automáticamente a la bodega/vino correcto. */
  aciertosAuto: number;
  /** Vinculaciones automáticas a una entidad equivocada (o de un caso «distinto»). */
  falsosPositivos: number;
  /** Duplicados que van a revisión con el candidato correcto en cabeza. */
  aRevision: number;
  /** Duplicados que se tratarían como nuevos (o a revisión con otro candidato primero). */
  perdidos: number;
  /** Casos «distinto» que van a revisión (ruido para el admin). */
  ruidoRevision: number;
  precision: number;
  recall: number;
  detalle: string[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function metricas(): Metricas {
  return { casos: 0, duplicados: 0, aciertosAuto: 0, falsosPositivos: 0, aRevision: 0, perdidos: 0, ruidoRevision: 0, precision: 1, recall: 0, detalle: [] };
}

function cerrar(m: Metricas): Metricas {
  m.precision = r3(m.aciertosAuto + m.falsosPositivos === 0 ? 1 : m.aciertosAuto / (m.aciertosAuto + m.falsosPositivos));
  m.recall = r3(m.duplicados === 0 ? 0 : m.aciertosAuto / m.duplicados);
  return m;
}

/** Catálogo de bodegas con las marcas que publica el Consejo Regulador de Ribera (id corto → marcas). */
export function catalogoBodegas(): BodegaCatalogo[] {
  const marcas = leer<Record<string, string[]>>("marcas-cr-ribera.json");
  return leer<BodegaCatalogo[]>("catalogo-bodegas.json").map((b) => ({ ...b, marcas: marcas[b.id.slice(0, 8)] ?? [] }));
}

export function catalogoVinos(): VinoCatalogo[] {
  return leer<VinoCatalogo[]>("catalogo-vinos.json");
}

/** Fichas de otras fuentes contra el catálogo. */
export function evaluarCasosBodegas(): Metricas {
  const emp = new EmparejadorBodegas(catalogoBodegas());
  const m = metricas();
  for (const c of leer<CasoBodega[]>("bodegas-casos.json")) {
    if (c.clase === "dudoso") continue;
    m.casos++;
    const r = emp.emparejar(c.entrada);
    const top = r.candidatos[0];
    const linea = `${c.clase} | ${r.estado} ${r.confianza} | ${c.entrada.nombre} ~ ${top?.nombre ?? "-"} (${top?.motivo ?? "-"})`;
    if (c.clase === "duplicado") {
      m.duplicados++;
      if (r.estado === "vinculada" && r.bodegaId === c.esperado) m.aciertosAuto++;
      else if (r.estado === "vinculada") { m.falsosPositivos++; m.detalle.push("FP " + linea); }
      else if (r.estado === "revision" && top?.id === c.esperado) { m.aRevision++; m.detalle.push("REV " + linea); }
      else { m.perdidos++; m.detalle.push("PERDIDO " + linea); }
    } else if (r.estado === "vinculada") { m.falsosPositivos++; m.detalle.push("FP " + linea); }
    else if (r.estado === "revision") { m.ruidoRevision++; m.detalle.push("RUIDO " + linea); }
  }
  return cerrar(m);
}

/** Cada bodega del catálogo frente a las demás: todas son distintas entre sí. */
export function evaluarCatalogoBodegas(): Metricas {
  const catalogo = catalogoBodegas();
  const emp = new EmparejadorBodegas(catalogo);
  const m = metricas();
  for (const b of catalogo) {
    m.casos++;
    const r = emp.emparejar(b, { excluir: new Set([b.id]) });
    const linea = `${r.estado} ${r.confianza} | ${b.nombre} (${b.municipio}) ~ ${r.candidatos[0]?.nombre} (${r.candidatos[0]?.motivo})`;
    if (r.estado === "vinculada") { m.falsosPositivos++; m.detalle.push("FP " + linea); }
    else if (r.estado === "revision") { m.ruidoRevision++; m.detalle.push("RUIDO " + linea); }
  }
  return cerrar(m);
}

/** «Parecidos» de la cola de revisión. */
export function evaluarCasosVinos(): Metricas {
  const emp = new EmparejadorVinos(catalogoVinos());
  const m = metricas();
  for (const c of leer<CasoVino[]>("vinos-casos.json")) {
    if (c.clase === "dudoso") continue;
    m.casos++;
    const r = emp.emparejar(c.entrada);
    const linea = `${c.clase} | ${r.estado} ${r.motivo ?? ""} | ${c.entrada.nombre} ~ ${r.candidatos[0]?.nombre ?? c.candidatoActual}`;
    if (c.clase === "duplicado") {
      m.duplicados++;
      if (r.estado === "vinculado" && r.vinoId === c.esperado) m.aciertosAuto++;
      else if (r.estado === "vinculado") { m.falsosPositivos++; m.detalle.push("FP " + linea); }
      else if (r.estado === "revision") { m.aRevision++; m.detalle.push("REV " + linea); }
      else { m.perdidos++; m.detalle.push("PERDIDO " + linea); }
    } else if (r.estado === "vinculado") { m.falsosPositivos++; m.detalle.push("FP " + linea); }
    else if (r.estado === "revision") { m.ruidoRevision++; m.detalle.push("RUIDO " + linea); }
  }
  return cerrar(m);
}

/**
 * Cada vino del catálogo frente a los demás de su bodega. Una vinculación automática es
 * un duplicado del catálogo (si está en `conocidos`) o un falso positivo.
 */
export function evaluarCatalogoVinos(conocidos: Set<string> = DUPLICADOS_CATALOGO_VINOS): Metricas & { duplicadosCatalogo: string[] } {
  const vinos = catalogoVinos();
  const m = metricas();
  const duplicadosCatalogo: string[] = [];
  const porBodega = new Map<string, VinoCatalogo[]>();
  for (const v of vinos) porBodega.set(v.bodegaId, [...(porBodega.get(v.bodegaId) ?? []), v]);
  for (const [, lista] of porBodega) {
    for (const v of lista) {
      m.casos++;
      const emp = new EmparejadorVinos(lista.filter((x) => x.id !== v.id));
      const r = emp.emparejar({ bodegaId: v.bodegaId, nombre: v.nombre, tipo: v.tipo, crianza: v.crianza, ean: null });
      if (r.estado !== "vinculado") continue;
      const otro = lista.find((x) => x.id === r.vinoId)!;
      const par = [v.nombre, otro.nombre].sort().join(" ≈ ");
      if (conocidos.has(par)) duplicadosCatalogo.push(par);
      else { m.falsosPositivos++; m.detalle.push(`FP ${par} (${r.motivo})`); }
    }
  }
  return { ...cerrar(m), duplicadosCatalogo: [...new Set(duplicadosCatalogo)].sort() };
}

/**
 * Pares de vinos del catálogo que son el mismo vino (revisados a mano): el emparejador nuevo los
 * reconoce y conviene fusionarlos en /admin. Cadena = nombres ordenados unidos por « ≈ ».
 */
export const DUPLICADOS_CATALOGO_VINOS = new Set<string>([
  "Arcum Edición Limitada Reserva ≈ Arcum Reserva Edición Limitada",
  "Diez Almendros ≈ Info nutricional DIEZ ALMENDROS",
  "Ilena vino ≈ Info nutricional Ilena",
  "Info nutricional JILGUERÍN ≈ Jilguerín",
  "KORDE Blanco 20/21 ≈ KORDE Blanco 23-24",
  "Nexus Crianza ≈ tinto Nexus Crianza",
  "Nexus One ≈ tinto Nexus One",
  "Paydos ≈ Vinos-Paydos",
  "Pozo De Nieve ≈ Pozo de Nieve – Etiquetado nutricional",
  "TresMatas Crianza – Etiquetado nutricional ≈ Tresmatas Crianza",
  "TresMatas Reserva 22- Etiquetado nutricional ≈ Tresmatas Reserva",
  "TresMatas Vendimia Seleccionada - Etiquetado nutricional ≈ Tresmatas Vendimia Seleccionada",
  "Viña Pedrosa Gran Reserva ≈ Viña Pedrosa Gran Reserva Ficha Técnica",
]);

function tabla(nombre: string, m: Metricas): string {
  return `| ${nombre} | ${m.casos} | ${m.duplicados} | ${m.aciertosAuto} | ${m.aRevision} | ${m.perdidos} | **${m.falsosPositivos}** | ${m.ruidoRevision} | ${m.precision} | ${m.recall} |`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const detalle = process.argv.includes("--detalle");
  const filas: [string, Metricas][] = [
    ["Bodegas: fichas de otras fuentes", evaluarCasosBodegas()],
    ["Bodegas: catálogo contra sí mismo", evaluarCatalogoBodegas()],
    ["Vinos: parecidos de la cola", evaluarCasosVinos()],
  ];
  const cat = evaluarCatalogoVinos();
  filas.push(["Vinos: catálogo contra sí mismo", cat]);
  console.log("| Conjunto | Casos | Duplicados | Auto ✓ | Revisión ✓ | Perdidos | FP auto | Ruido revisión | Precisión | Recall auto |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [n, m] of filas) console.log(tabla(n, m));
  if (cat.duplicadosCatalogo.length) console.log(`\nDuplicados ya en el catálogo de vinos: ${cat.duplicadosCatalogo.length}`);
  if (detalle) {
    for (const [n, m] of filas) {
      console.log(`\n## ${n}`);
      for (const l of m.detalle) console.log(l);
    }
    for (const d of cat.duplicadosCatalogo) console.log("DUP-CATÁLOGO " + d);
  }
}
