// Comparación de JSON independiente del orden de las claves (jsonb las reordena).

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, ordenar((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function igualesJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(ordenar(a ?? null)) === JSON.stringify(ordenar(b ?? null));
}
