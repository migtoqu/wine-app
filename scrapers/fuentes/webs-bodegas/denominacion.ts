// Denominación de cada vino (fase B): la que dice su ficha, su categoría o su
// ruta, resuelta contra `denominaciones` (DOP de las semillas + IGP/VT). Sin
// pista, la D.O. de la bodega solo si tiene una única; nunca «la principal».
import { readFileSync } from "node:fs";
import { claveTexto } from "../../lib/texto.ts";

export interface Denominacion {
  /** id de la BD; en dry-run, el slug. */
  id: string;
  nombre: string;
  slug: string;
  tipo: string;
}

export type OrigenDo = "ficha" | "categoria" | "ruta" | "bodega";

export interface DeteccionDo {
  /** Denominación resuelta, o null si la ficha dice algo que no está en la tabla. */
  denominacion: Denominacion | null;
  /** Texto tal como lo dice la fuente («D.O. Rueda», «Vino de la Tierra de Castilla y León»). */
  texto: string | null;
  origen: OrigenDo;
  /** «dop», «igp» o «sin_do» (Vino de España, vino sin indicación geográfica). */
  clase: "dop" | "igp" | "sin_do";
}

// Formas habituales que no son el nombre oficial (clave normalizada → slug).
const ALIAS: Record<string, string> = {
  ribera: "ribera-del-duero",
  "ribera duero": "ribera-del-duero",
  "rioja alavesa": "rioja",
  "rioja alta": "rioja",
  "rioja oriental": "rioja",
  "rioja baja": "rioja",
  priorato: "priorat",
  "rias baixas": "rias-baixas",
  jerez: "jerez-xeres-sherry",
  sherry: "jerez-xeres-sherry",
  manzanilla: "manzanilla-sanlucar-de-barrameda",
  "castilla leon": "castilla-y-leon",
  "tierra leon": "leon",
  "tierra de leon": "leon",
  "vino de la tierra castilla y leon": "castilla-y-leon",
  "arribes del duero": "arribes",
  "tierra del vino zamora": "tierra-del-vino-de-zamora",
  "penedes": "penedes",
  "valdepenas": "valdepenas",
};

const NOMBRE_DO = "[A-ZÁÉÍÓÚÑ0-9][\\wÁÉÍÓÚÑáéíóúñü'’·.-]*(?:[ \\t]+(?:de[ \\t]+(?:la[ \\t]+|los[ \\t]+|las[ \\t]+)?|del[ \\t]+|y[ \\t]+|i[ \\t]+|e[ \\t]+|do[ \\t]+|da[ \\t]+)?[A-ZÁÉÍÓÚÑ][\\wÁÉÍÓÚÑáéíóúñü'’·.-]*){0,5}";
// «D.O.», «D.O.Ca.», «DOCa», «D.O.P.», «DO», «Denominación de Origen (Calificada|Protegida)», «Vino de Pago».
const RE_DOP = new RegExp(
  `(?:^|[^\\p{L}])(?:D\\.?\\s?O\\.?\\s?Ca\\.?|DOCa|D\\.?\\s?O\\.?\\s?C\\.?(?=\\s)|D\\.?\\s?O\\.?\\s?P\\.?|D\\.\\s?O\\.?|DO(?=\\s[A-ZÁÉÍÓÚ])|Denominaci[óo]n\\s+de\\s+Origen(?:\\s+Calificada|\\s+Protegida)?|Vino\\s+de\\s+Pago|D\\.?O\\.?\\s?Pago)\\s*:?\\s*[«"“]?(?:de\\s+)?(${NOMBRE_DO})`,
  "gu",
);
const RE_IGP = new RegExp(
  `(?:^|[^\\p{L}])(?:Vinos?\\s+de\\s+la\\s+Tierra|V\\.\\s?T\\.?|VT(?=\\s[A-ZÁÉÍÓÚ])|I\\.\\s?G\\.\\s?P\\.?|IGP|Indicaci[óo]n\\s+Geogr[áa]fica\\s+Protegida)\\s*:?\\s*(?:de\\s+(?:la\\s+)?|del\\s+)?[«"“]?(${NOMBRE_DO})`,
  "gu",
);
const RE_SIN_DO = /\b(vino de españa|vino de mesa|vino sin (?:d\.?\s?o\.?|denominaci[óo]n|indicaci[óo]n geogr[áa]fica))\b/i;
const RE_ETIQUETA = /\b(?:denominaci[óo]n(?:\s+de\s+origen)?|d\.?\s?o\.?|origen|zona|regi[óo]n)\s*:\s*([^\n.;|]{2,60})/i;

export class ResolutorDenominaciones {
  private porClave = new Map<string, Denominacion>();
  private porSlug = new Map<string, Denominacion>();
  readonly todas: Denominacion[];

  constructor(lista: Denominacion[]) {
    this.todas = lista;
    for (const d of lista) {
      this.porSlug.set(d.slug, d);
      this.porClave.set(claveTexto(d.nombre), d);
      this.porClave.set(claveTexto(d.slug.replace(/-/g, " ")), d);
    }
  }

  porSlugDe(slug: string): Denominacion | null {
    return this.porSlug.get(slug) ?? null;
  }

  /** Nombre exacto, alias o el prefijo más largo del texto («Ribera del Duero Crianza» → Ribera del Duero). */
  resolver(texto: string, clase: "dop" | "igp" | null = null): Denominacion | null {
    // Prefijos que repiten el tipo («DOCa Rioja», «Vino de la Tierra de Castilla», «IGP Castilla y León»).
    const limpio = claveTexto(texto).replace(/^(?:(?:d o ca|doca|d o c|d o p|dop|d o|do|igp|i g p|vt|v t)\s+)+/, "").replace(/^vinos? de la tierra (?:de (?:la |los )?|del )?/, "");
    const palabras = limpio.split(" ").filter(Boolean);
    for (let n = Math.min(palabras.length, 7); n >= 1; n--) {
      const k = palabras.slice(0, n).join(" ");
      const d = this.porClave.get(k) ?? (ALIAS[k] ? this.porSlug.get(ALIAS[k]!) : undefined) ?? this.porClave.get(k.replace(/\b(de|del|la|los|las)\b/g, " ").replace(/\s+/g, " ").trim());
      if (!d) continue;
      if (clase === "igp" && d.tipo !== "igp") continue;
      if (clase === "dop" && d.tipo === "igp") continue;
      return d;
    }
    return null;
  }
}

/** Denominaciones de las migraciones de semillas (dry-run sin BD): id = slug. */
export function denominacionesDeSemillas(raiz = new URL("../../../supabase/migrations/", import.meta.url)): Denominacion[] {
  const out: Denominacion[] = [];
  for (const f of ["20261107191000_semillas_catalogo.sql", "20261112100000_semillas_igp.sql"]) {
    let sql: string;
    try {
      sql = readFileSync(new URL(f, raiz), "utf8");
    } catch {
      continue;
    }
    for (const m of sql.matchAll(/^\s+\('((?:[^']|'')+)', '([a-z0-9-]+)', '(do|doca|do_pago|vc|igp)'/gm)) {
      out.push({ id: m[2]!, nombre: m[1]!.replace(/''/g, "'"), slug: m[2]!, tipo: m[3]! });
    }
  }
  return out;
}

function enTexto(texto: string, r: ResolutorDenominaciones): DeteccionDo | null {
  const hallazgos: DeteccionDo[] = [];
  for (const m of texto.matchAll(RE_IGP)) {
    // «I.G.P.: Vino de España» no es una IGP: es vino sin indicación geográfica.
    if (/^vino de espa/i.test(m[1]!)) {
      hallazgos.push({ denominacion: null, texto: m[0].trim(), origen: "ficha", clase: "sin_do" });
      continue;
    }
    hallazgos.push({ denominacion: r.resolver(m[1]!, "igp"), texto: m[0].trim(), origen: "ficha", clase: "igp" });
  }
  for (const m of texto.matchAll(RE_DOP)) {
    // «D.O. Ribera del Duero» con o sin «de»; una IGP ya contada no se repite.
    if (hallazgos.some((h) => h.texto && h.texto.includes(m[1]!))) continue;
    hallazgos.push({ denominacion: r.resolver(m[1]!, "dop"), texto: m[0].trim(), origen: "ficha", clase: "dop" });
  }
  const etiqueta = texto.match(RE_ETIQUETA);
  if (etiqueta && hallazgos.length === 0) {
    const d = r.resolver(etiqueta[1]!.replace(/^(?:d\.?\s?o\.?\s*(?:ca\.?)?|denominaci[óo]n de origen)\s*/i, ""));
    if (d) hallazgos.push({ denominacion: d, texto: etiqueta[0].trim(), origen: "ficha", clase: d.tipo === "igp" ? "igp" : "dop" });
  }
  if (hallazgos.length === 0) {
    const s = texto.match(RE_SIN_DO);
    return s ? { denominacion: null, texto: s[1]!, origen: "ficha", clase: "sin_do" } : null;
  }
  // La resuelta más repetida; a igualdad, la primera.
  const resueltas = hallazgos.filter((h) => h.denominacion);
  if (resueltas.length === 0) return hallazgos[0]!;
  const cuenta = new Map<string, number>();
  for (const h of resueltas) cuenta.set(h.denominacion!.slug, (cuenta.get(h.denominacion!.slug) ?? 0) + 1);
  const max = Math.max(...cuenta.values());
  return resueltas.find((h) => cuenta.get(h.denominacion!.slug) === max)!;
}

/**
 * D.O. de un vino. Orden: título y texto de la ficha → categorías o migas → ruta de la URL.
 * Devuelve null si no hay ninguna pista (quien llama decide con las D.O. de la bodega).
 */
export function detectarDenominacion(
  v: { titulo: string; texto: string; categorias?: string[]; url: string },
  r: ResolutorDenominaciones,
): DeteccionDo | null {
  const ficha = enTexto(`${v.titulo}\n${v.texto}`, r);
  if (ficha) return ficha;
  for (const c of v.categorias ?? []) {
    const en = enTexto(c, r);
    if (en?.denominacion) return { ...en, origen: "categoria" };
    const limpia = c.replace(/^(?:vinos?|wines?)\s+(?:de\s+(?:la\s+)?|del\s+)?/i, "").replace(/^(?:d\.?\s?o\.?\s*(?:ca\.?)?)\s*/i, "");
    // Una categoría que es solo el nombre de una D.O. («Rueda», «Ribera del Duero»), no «Tintos» ni «Crianzas».
    const d = r.resolver(limpia);
    if (d && claveTexto(limpia).split(" ").length <= claveTexto(d.nombre).split(" ").length + 1) {
      return { denominacion: d, texto: c, origen: "categoria", clase: d.tipo === "igp" ? "igp" : "dop" };
    }
  }
  let segmentos: string[] = [];
  try {
    segmentos = new URL(v.url).pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase());
  } catch {
    segmentos = [];
  }
  // Segmentos de categoría completos («/vinos-rueda/», «/do-toro/»); en el último (el del vino)
  // solo slugs de varias palabras («…-ribera-del-duero»), para no tomar «toro» de «toro-loco».
  const porLongitud = [...r.todas].filter((d) => d.slug.length >= 4).sort((a, b) => b.slug.length - a.slug.length);
  for (let i = 0; i < segmentos.length; i++) {
    const seg = segmentos[i]!.replace(/\.(html?|php|asp)$/, "");
    const ultimo = i === segmentos.length - 1;
    for (const d of porLongitud) {
      const ok = ultimo
        ? d.slug.includes("-") && new RegExp(`(?:^|-)${d.slug}(?:-|$)`).test(seg)
        : new RegExp(`^(?:vinos?-|wines?-|do-|doca-|vt-|igp-|d-o-)?(?:de-|del-)?${d.slug}$`).test(seg);
      if (ok) return { denominacion: d, texto: seg, origen: "ruta", clase: d.tipo === "igp" ? "igp" : "dop" };
    }
  }
  return null;
}

export type DecisionDo =
  | { estado: "asignada"; denominacion: Denominacion; deteccion: DeteccionDo }
  | { estado: "sin_do"; deteccion: DeteccionDo | null }
  | { estado: "revision"; motivo: "do_desconocida" | "do_ambigua"; deteccion: DeteccionDo | null };

/** Decide la D.O. del vino con lo detectado y las D.O. de su bodega. */
export function decidirDenominacion(deteccion: DeteccionDo | null, dosBodega: Denominacion[]): DecisionDo {
  if (deteccion?.denominacion) return { estado: "asignada", denominacion: deteccion.denominacion, deteccion };
  if (deteccion && deteccion.clase === "dop") return { estado: "revision", motivo: "do_desconocida", deteccion };
  // IGP fuera de la tabla o «Vino de España»: vino sin D.O., con el texto en los hechos.
  if (deteccion) return { estado: "sin_do", deteccion };
  if (dosBodega.length === 1) {
    const d = dosBodega[0]!;
    return { estado: "asignada", denominacion: d, deteccion: { denominacion: d, texto: null, origen: "bodega", clase: d.tipo === "igp" ? "igp" : "dop" } };
  }
  if (dosBodega.length > 1) return { estado: "revision", motivo: "do_ambigua", deteccion: null };
  return { estado: "sin_do", deteccion: null };
}
