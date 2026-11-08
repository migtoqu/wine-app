// Lectura de los registros de fuente en revisión (registros_fuente.datos),
// tal como los dejan los scrapers. Módulo puro (lo prueba revision.test.ts).

export type CandidatoRevision = { id: string; nombre: string; puntuacion: number | null; motivo: string | null };

export type RegistroRevision = {
  /** 'bodega': ficha de bodega (p. ej. Consejo Regulador); 'vino': ficha de vino de una tienda. */
  tipo: "bodega" | "vino";
  nombre: string;
  /** Bodegas candidatas (para un vino, su bodega). */
  candidatos: CandidatoRevision[];
  /** Vinos parecidos dentro de la bodega elegida (solo fichas de vino). */
  vinos: CandidatoRevision[];
  motivo: string | null;
};

const PREFIJO_SUPRIMIDA = "supresion:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function candidatos(v: unknown): CandidatoRevision[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) => {
    const o = obj(c);
    const id = typeof o.id === "string" ? o.id : "";
    // Las bodegas borradas por el admin no se ofrecen para asociar.
    if (!UUID.test(id) || id.startsWith(PREFIJO_SUPRIMIDA)) return [];
    return [{
      id,
      nombre: typeof o.nombre === "string" ? o.nombre : "",
      puntuacion: typeof o.puntuacion === "number" ? o.puntuacion : null,
      motivo: typeof o.motivo === "string" ? o.motivo : null,
    }];
  });
}

export function leerRegistroRevision(datos: unknown): RegistroRevision {
  const d = obj(datos);
  const campos = obj(d.campos);
  const emp = obj(d.emparejamiento);
  const esBodega = typeof campos.nombre === "string";
  return {
    tipo: esBodega ? "bodega" : "vino",
    nombre: (esBodega ? (campos.nombre as string) : typeof d.nombre === "string" ? d.nombre : "") || "—",
    candidatos: candidatos(emp.candidatos),
    vinos: candidatos(emp.vinos),
    motivo: typeof emp.motivo === "string" ? emp.motivo : null,
  };
}
