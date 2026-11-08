import type { Procedencias, Resumen } from "./types";

// Atribución por bloque de una ficha (SCOPE §7.3): qué fuentes respaldan los
// campos que se muestran y cuándo se actualizaron. Módulo puro.

export type SourceLine =
  | { kind: "fuente"; key: string; nombre: string; url: string; updatedAt: string }
  | { kind: "admin"; key: "admin"; updatedAt: string };

/**
 * Fuentes de los campos `campos` que tienen valor (`conValor`), una línea por fuente (o una para
 * el admin), con la fecha más reciente. Las fuentes van primero por nº de campos y después por fecha.
 */
export function sourcesFor(
  procedencia: Procedencias,
  campos: string[],
  conValor: (campo: string) => boolean = () => true,
): SourceLine[] {
  const lineas = new Map<string, SourceLine>();
  const usos = new Map<string, number>();
  const masReciente = (prev: SourceLine | undefined, fecha: string) =>
    prev && prev.updatedAt > fecha ? prev.updatedAt : fecha;
  for (const campo of campos) {
    const p = procedencia[campo];
    if (!p || !conValor(campo)) continue;
    if (p.origen !== "admin" && !p.fuente) continue;
    const key = p.origen === "admin" ? "admin" : p.fuente!.nombre;
    const prev = lineas.get(key);
    usos.set(key, (usos.get(key) ?? 0) + 1);
    if (p.origen === "admin") {
      lineas.set(key, { kind: "admin", key: "admin", updatedAt: masReciente(prev, p.observado_en) });
    } else {
      lineas.set(key, {
        kind: "fuente",
        key,
        nombre: p.fuente!.nombre,
        url: (prev?.kind === "fuente" ? prev.url : null) ?? p.url ?? p.fuente!.url_base,
        updatedAt: masReciente(prev, p.observado_en),
      });
    }
  }
  return [...lineas.values()].sort(
    (a, b) => (usos.get(b.key) ?? 0) - (usos.get(a.key) ?? 0) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Resumen propio de un campo en el idioma pedido, o en español si no lo hay. */
export function pickResumen(resumenes: Resumen[], campos: string[], lang: "es" | "en"): Resumen | null {
  for (const campo of campos) {
    const r = resumenes.find((x) => x.campo === campo && x.idioma === lang) ??
      resumenes.find((x) => x.campo === campo && x.idioma === "es");
    if (r) return r;
  }
  return null;
}
