// Ruta del Vino Ribera del Duero: de datos crudos a campos de `bodegas` y
// `servicios_bodega` + hechos. Nada de descripciones: solo datos factuales.
import {
  normalizarCodigoPostal, normalizarEmail, normalizarTelefono, normalizarWeb,
} from "../../lib/contacto.ts";
import { comunidadDeProvincia } from "../../lib/geo.ts";
import { capitalizarSiMayusculas, claveNombreBodega, claveTexto } from "../../lib/texto.ts";
import type { FichaDirectorio, ProductoRuta } from "./parsear.ts";

// ---------------------------------------------------------------- bodegas

/** Columnas de `bodegas` que aporta esta fuente (nunca el nombre ni la descripción). */
export interface CamposBodegaRuta {
  direccion: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  provincia: string | null;
  comunidad: string | null;
  web: string | null;
  telefono: string | null;
  email: string | null;
  anio_fundacion: number | null;
}

export interface FichaNormalizada {
  idExterno: string;
  url: string;
  nombre: string;
  campos: CamposBodegaRuta;
  /** «Lunes a Viernes: 10:00 h - 17:00 h; …» o null. */
  horario_visitas: string | null;
  datos: FichaDirectorio & { campos: CamposBodegaRuta };
}

/** «Carretera de Zayas s/n. San Esteban de Gormaz (Soria)» → calle, municipio y provincia. */
export function separarDireccion(d: string | null): { calle: string | null; municipio: string | null; provincia: string | null } {
  if (!d) return { calle: null, municipio: null, provincia: null };
  const m = /^(.*?)[\s.,]*([^.,()]+?)\s*\(([^)]+)\)\s*$/.exec(d.trim());
  if (!m) return { calle: d.trim(), municipio: null, provincia: null };
  return { calle: m[1]!.trim().replace(/[.,]+$/, "") || null, municipio: m[2]!.trim(), provincia: m[3]!.trim() };
}

const ORDEN_DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const sinTildes = (s: string) => claveTexto(s);

/** Agrupa días consecutivos con el mismo horario: «Lunes a Viernes: 10:00 h - 17:00 h». */
export function resumirHorario(filas: { dia: string; horas: string }[]): string | null {
  const limpias = filas
    .map((f) => ({ dia: f.dia.trim(), horas: f.horas.replace(/\s+/g, " ").replace(/H\b/g, "h").trim(), i: ORDEN_DIAS.indexOf(sinTildes(f.dia)) }))
    .filter((f) => f.dia && f.horas);
  if (limpias.length === 0) return null;
  const grupos: { desde: string; hasta: string; horas: string; i: number }[] = [];
  for (const f of limpias) {
    const ult = grupos[grupos.length - 1];
    if (ult && ult.horas.toLowerCase() === f.horas.toLowerCase() && f.i >= 0 && ult.i >= 0 && f.i === ult.i + 1) {
      ult.hasta = f.dia;
      ult.i = f.i;
    } else grupos.push({ desde: f.dia, hasta: f.dia, horas: f.horas, i: f.i });
  }
  return grupos.map((g) => `${g.desde === g.hasta ? g.desde : `${g.desde} a ${g.hasta}`}: ${g.horas}`).join("; ");
}

export function normalizarFicha(f: FichaDirectorio): FichaNormalizada {
  const dir = separarDireccion(f.direccion);
  const provincia = dir.provincia ? capitalizarSiMayusculas(dir.provincia) : null;
  const campos: CamposBodegaRuta = {
    direccion: dir.calle,
    codigo_postal: normalizarCodigoPostal(f.codigo_postal),
    municipio: dir.municipio ? capitalizarSiMayusculas(dir.municipio) : null,
    provincia,
    comunidad: comunidadDeProvincia(provincia),
    web: normalizarWeb(f.web),
    telefono: normalizarTelefono(f.telefono),
    email: normalizarEmail(f.email),
    anio_fundacion: f.anio_fundacion,
  };
  return {
    idExterno: `directorio:${f.id}`,
    url: f.url,
    nombre: f.nombre,
    campos,
    horario_visitas: resumirHorario(f.horario_visitas),
    datos: { ...f, campos },
  };
}

// -------------------------------------------------------------- servicios

export type TipoServicio = "cata" | "visita" | "otra";

export interface ServicioNormalizado {
  idExterno: string;
  url: string;
  /** Nombre completo del producto (con el prefijo de bodega). */
  nombre: string;
  tipo: TipoServicio;
  categorias: string[];
  /** Pack de varias bodegas o producto de la propia Ruta: no es de ninguna bodega. */
  paquete: boolean;
  /** Categoría que indica que no es enoturismo de bodega (spa, bienestar…). */
  noBodega: boolean;
  precio_desde: number | null;
  duracion_minutos: number | null;
  idiomas: string[];
  horario: string | null;
  url_reserva: string | null;
}

const PAQUETE = /^(aa\.?\s?vv\.?|ribi[ée]rtete)\b/i;

export function tipoDeServicio(nombre: string): TipoServicio {
  const n = claveTexto(nombre);
  if (/\b(visita|visitas|puertas abiertas|recorrido)\b/.test(n)) return "visita";
  if (/\b(cata|catas|degustacion|tasting|maridaje|maridajes)\b/.test(n)) return "cata";
  return "otra";
}

/** Temporada de las promociones de la Ruta, si la categoría lo dice. */
function horarioDe(categorias: string[]): string | null {
  const c = categorias.map(claveTexto);
  if (c.some((x) => x.startsWith("noviembre mes del enoturismo"))) return "Noviembre, Mes del Enoturismo";
  if (c.some((x) => x.startsWith("vendimia"))) return "Vendimia";
  return null;
}

export function normalizarProducto(p: ProductoRuta): ServicioNormalizado {
  const categorias = p.categorias;
  const paquete = PAQUETE.test(p.nombre);
  return {
    idExterno: `producto:${p.id}`,
    url: p.permalink,
    nombre: p.nombre,
    tipo: tipoDeServicio(p.nombre),
    categorias,
    paquete,
    noBodega: categorias.some((c) => claveTexto(c) === "salud y bienestar"),
    precio_desde: p.precio,
    duracion_minutos: p.duracion_minutos,
    idiomas: p.idiomas,
    horario: horarioDe(categorias),
    url_reserva: p.url_reserva ?? p.permalink,
  };
}

// ------------------------------------------- producto → bodega por prefijo

/** Bodega candidata a ser el prefijo del nombre de un producto. */
export interface PrefijoBodega {
  /** Nombre tal cual lo escribe la Ruta o el catálogo. */
  nombre: string;
  bodegaId: string;
}

const GENERICAS = new Set(["bodega", "bodegas", "vinedo", "vinedos", "vino", "vinos", "de", "del", "la", "las", "los", "el", "y", "e", "grupo", "hacienda"]);
const VERBOS = new Set(["visitar", "vistar", "visita"]);

/** Tokens significativos de un nombre con el índice del token original (para recortar el título). */
function tokens(nombre: string): { t: string; i: number }[] {
  return claveTexto(nombre)
    .split(" ")
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t !== "" && !GENERICAS.has(t));
}

export type AsignacionBodega =
  | { estado: "bodega"; bodegaId: string; titulo: string }
  | { estado: "ambigua"; bodegaIds: string[] }
  | { estado: "ninguna" };

/**
 * La bodega es el prefijo del nombre del producto («Bodegas Pradorey Visita premium»).
 * Gana el prefijo más largo; empate entre bodegas distintas → ambigua.
 */
export function asignarBodega(nombreProducto: string, candidatos: PrefijoBodega[]): AsignacionBodega {
  const prod = tokens(nombreProducto);
  let mejor = 0;
  let ids = new Set<string>();
  for (const c of candidatos) {
    let clave = tokens(c.nombre);
    while (clave.length > 1 && VERBOS.has(clave[0]!.t)) clave = clave.slice(1);
    if (clave.length === 0 || clave.length > prod.length) continue;
    if (clave.length === 1 && clave[0]!.t.length < 4) continue;
    if (!clave.every((k, j) => k.t === prod[j]!.t)) continue;
    if (clave.length > mejor) { mejor = clave.length; ids = new Set([c.bodegaId]); }
    else if (clave.length === mejor) ids.add(c.bodegaId);
  }
  if (mejor === 0) return { estado: "ninguna" };
  if (ids.size > 1) return { estado: "ambigua", bodegaIds: [...ids].sort() };
  // Se recorta el nombre hasta el último token del prefijo (posición en el texto original).
  const palabras = [...nombreProducto.matchAll(/[\p{L}\p{N}]+/gu)];
  const fin = palabras[prod[mejor - 1]!.i];
  const detras = fin ? nombreProducto.slice(fin.index! + fin[0].length) : "";
  // «Monasterio de Valbuena Restaurante…»: una sola palabra seguida de «de X» es un lugar, no la bodega.
  if (mejor === 1 && /^\s+(?:de|del)\s/i.test(detras)) return { estado: "ninguna" };
  const resto = detras.replace(/^[\s:–—-]+/, "").trim();
  return { estado: "bodega", bodegaId: [...ids][0]!, titulo: resto.length >= 3 ? resto : nombreProducto.trim() };
}

export { claveNombreBodega };
