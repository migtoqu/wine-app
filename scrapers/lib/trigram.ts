// Similitud por trigramas con el mismo algoritmo que pg_trgm `similarity()`:
// palabras alfanuméricas en minúsculas, cada una rellenada como "  palabra ",
// conjunto de trigramas y |A ∩ B| / |A ∪ B|. Así el emparejamiento da lo mismo
// en TypeScript (y en --dry-run) que en SQL.
import { quitarTildes } from "./texto.ts";

export function trigramas(s: string): Set<string> {
  const set = new Set<string>();
  const palabras = quitarTildes(s).toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const p of palabras) {
    const r = `  ${p} `;
    for (let i = 0; i + 3 <= r.length; i++) set.add(r.slice(i, i + 3));
  }
  return set;
}

export function similitud(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  return comunes / (ta.size + tb.size - comunes);
}
