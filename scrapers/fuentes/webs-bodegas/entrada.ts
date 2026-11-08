// Entrada del crawler: bodegas con web (BD) o, en dry-run, URLs de un fichero,
// del JSON de un dry-run de Ribera o de la línea de comandos. Agrupa por
// dominio (un sitio compartido se rastrea una vez) y reparte en lotes estables.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dominioWeb, esDominioGenerico, normalizarWeb } from "../../lib/contacto.ts";
import type { BodegaEntrada, EntradaSitio } from "./sitio.ts";

export interface BodegaConWeb extends BodegaEntrada {
  web: string;
}

/** Agrupa bodegas por dominio; descarta webs que no son de la bodega (redes, tiendas, constructores). */
export function agruparPorDominio(bodegas: BodegaConWeb[]): EntradaSitio[] {
  const porDominio = new Map<string, EntradaSitio>();
  for (const b of bodegas) {
    const url = normalizarWeb(b.web);
    const dominio = dominioWeb(url);
    if (!url || !dominio || esDominioGenerico(dominio)) continue;
    const sitio = porDominio.get(dominio);
    const bodega = { id: b.id, nombre: b.nombre, municipio: b.municipio };
    if (!sitio) porDominio.set(dominio, { dominio, url: new URL(url).origin + "/", bodegas: [bodega] });
    else if (!sitio.bodegas.some((x) => (x.id ?? x.nombre) === (b.id ?? b.nombre))) sitio.bodegas.push(bodega);
  }
  return [...porDominio.values()];
}

/** «2/3» → { indice: 2, total: 3 } (1-based). */
export function parsearLote(s: string | undefined): { indice: number; total: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d+)\/(\d+)$/);
  if (!m) throw new Error(`--lote debe ser I/N (p. ej. 1/3): ${s}`);
  const indice = Number(m[1]), total = Number(m[2]);
  if (total < 1 || indice < 1 || indice > total) throw new Error(`--lote fuera de rango: ${s}`);
  return { indice, total };
}

/** Lote estable de un dominio (sha1 mod N): no cambia entre ejecuciones ni depende del orden. */
export function loteDe(dominio: string, total: number): number {
  const h = createHash("sha1").update(dominio).digest();
  return (h.readUInt32BE(0) % total) + 1;
}

/** Bodegas desde `--webs`: JSON de un dry-run de ribera, fichero .txt o lista separada por comas. */
export function bodegasDeArgumento(arg: string): BodegaConWeb[] {
  let contenido: string | null = null;
  try {
    contenido = readFileSync(arg, "utf8");
  } catch {
    contenido = null;
  }
  if (contenido === null) {
    return arg.split(",").map((w) => w.trim()).filter(Boolean).map((web) => ({ id: null, nombre: dominioWeb(normalizarWeb(web)) ?? web, municipio: null, web }));
  }
  const t = contenido.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) {
    const json = JSON.parse(t) as { registros?: { campos?: { nombre?: string; web?: string | null; municipio?: string | null } }[] } | unknown[];
    const registros = Array.isArray(json) ? (json as { campos?: Record<string, string | null> }[]) : json.registros ?? [];
    return registros
      .map((r) => r.campos ?? (r as Record<string, string | null>))
      .filter((c): c is { nombre: string; web: string; municipio?: string | null } => !!c?.web && !!c.nombre)
      .map((c) => ({ id: null, nombre: c.nombre, municipio: c.municipio ?? null, web: c.web }));
  }
  return t
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [web, nombre, municipio] = l.split("\t");
      return { id: null, nombre: nombre?.trim() || (dominioWeb(normalizarWeb(web!)) ?? web!), municipio: municipio?.trim() || null, web: web!.trim() };
    });
}
