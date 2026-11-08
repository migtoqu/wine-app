// Vino → bodega. La ficha del vino solo trae el nombre de la bodega («Bodega Ysios»), sin enlace.
// Orden: enlace explícito desde la ficha de bodega → nombre → vinos hermanos («Más vinos de la bodega»).
import { similitud } from "../../lib/trigram.ts";
import type { BodegaClave, MotivoResolucion, ResolucionBodega } from "./normalizar.ts";

export const UMBRAL_NOMBRE = 0.85;
export const MARGEN_NOMBRE = 0.05;

export interface VinoParaResolver {
  slug: string;
  clave_bodega: string;
  hermanos: string[];
}

const contiene = (a: string, b: string) => {
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  if (!corta) return false;
  const pl = new Set(larga.split(" "));
  return corta.split(" ").every((p) => pl.has(p));
};

/** Bodegas cuya clave coincide con la del vino (exacta, o contenida/similar con margen). */
export function bodegasPorNombre(clave: string, bodegas: BodegaClave[]): { exacto: boolean; candidatos: BodegaClave[] } {
  if (!clave) return { exacto: false, candidatos: [] };
  const exactas = bodegas.filter((b) => b.clave === clave);
  if (exactas.length > 0) return { exacto: true, candidatos: exactas };
  const puntuadas = bodegas
    .map((b) => ({ b, p: contiene(clave, b.clave) ? 0.9 : similitud(clave, b.clave) }))
    .filter((x) => x.p >= UMBRAL_NOMBRE)
    .sort((x, y) => y.p - x.p);
  if (puntuadas.length === 0) return { exacto: false, candidatos: [] };
  const mejor = puntuadas[0]!.p;
  return { exacto: false, candidatos: puntuadas.filter((x) => mejor - x.p < MARGEN_NOMBRE).map((x) => x.b) };
}

export function resolverBodegas(
  vinos: VinoParaResolver[],
  bodegas: BodegaClave[],
  enlaces: Map<string, string> = new Map(),
): Map<string, ResolucionBodega> {
  const out = new Map<string, ResolucionBodega>();
  const res = (idExterno: string | null, motivo: MotivoResolucion, candidatos: string[] = []): ResolucionBodega => ({
    idExterno, motivo, candidatos,
  });
  for (const v of vinos) {
    const enlace = enlaces.get(v.slug);
    if (enlace) {
      out.set(v.slug, res(enlace, "enlace"));
      continue;
    }
    const { candidatos } = bodegasPorNombre(v.clave_bodega, bodegas);
    if (candidatos.length === 1) out.set(v.slug, res(candidatos[0]!.idExterno, "nombre"));
    else if (candidatos.length > 1) out.set(v.slug, res(null, "ambigua", candidatos.map((c) => c.idExterno)));
    else out.set(v.slug, res(null, "sin_candidata"));
  }

  // Hermanos: componentes conectados por «Más vinos de la bodega»; si los resueltos coinciden, el resto hereda.
  const porSlug = new Map(vinos.map((v) => [v.slug, v]));
  const vecinos = new Map<string, Set<string>>();
  const unir = (a: string, b: string) => {
    if (!porSlug.has(a) || !porSlug.has(b) || a === b) return;
    (vecinos.get(a) ?? vecinos.set(a, new Set()).get(a)!).add(b);
    (vecinos.get(b) ?? vecinos.set(b, new Set()).get(b)!).add(a);
  };
  for (const v of vinos) for (const h of v.hermanos) unir(v.slug, h);
  const visitado = new Set<string>();
  for (const v of vinos) {
    if (visitado.has(v.slug)) continue;
    const comp: string[] = [];
    const pila = [v.slug];
    while (pila.length) {
      const s = pila.pop()!;
      if (visitado.has(s)) continue;
      visitado.add(s);
      comp.push(s);
      for (const n of vecinos.get(s) ?? []) pila.push(n);
    }
    const resueltas = new Set(comp.map((s) => out.get(s)!.idExterno).filter((x): x is string => !!x));
    if (resueltas.size !== 1) continue;
    const [id] = [...resueltas];
    for (const s of comp) if (!out.get(s)!.idExterno) out.set(s, res(id!, "hermano"));
  }
  return out;
}
