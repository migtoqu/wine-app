// De ficha de tienda a vino, añada y variedades, con la misma forma que Vinopremier para reutilizar
// su guardado. Solo hechos (cifras, nombres de uva, tipo); nunca frases de la tienda.
import { claveTexto, limpiarEspacios, quitarTildes } from "../../lib/texto.ts";
import {
  anioFicha,
  formatoDesde,
  graduacion,
  mesesBarrica,
  temperaturaServicio,
  uvasDesdeTexto,
  type VinoNormalizadoVp,
} from "../vinopremier/normalizar.ts";
import { crianzaDesde, esPack, nombreVino, temperaturaDesde, tipoDesde, variedadesDesde } from "../vinoseleccion/normalizar.ts";
import type { CategoriaTienda, FichaTienda } from "./tipos.ts";

/** D.O. del foco por nombre (claveTexto), para reconocer la que dice la ficha. */
const DENOMINACIONES: { slug: string; nombre: string; patron: RegExp }[] = [
  { slug: "ribera-del-duero", nombre: "Ribera del Duero", patron: /\bribera del duero\b|\bribera de duero\b/ },
  { slug: "rioja", nombre: "Rioja", patron: /\brioja\b/ },
  { slug: "toro", nombre: "Toro", patron: /\btoro\b/ },
  { slug: "rueda", nombre: "Rueda", patron: /\brueda\b/ },
  { slug: "bierzo", nombre: "Bierzo", patron: /\bbierzo\b/ },
  { slug: "priorat", nombre: "Priorat", patron: /\bpriorat\b|\bpriorato\b/ },
  { slug: "navarra", nombre: "Navarra", patron: /\bnavarra\b/ },
  { slug: "cigales", nombre: "Cigales", patron: /\bcigales\b/ },
];

/** Slugs de las D.O. del foco (todas deben existir en `denominaciones`). */
export const DENOMINACIONES_FOCO: readonly string[] = DENOMINACIONES.map((d) => d.slug);

/** Slug de la D.O. del foco que nombra el texto; `fuera` si nombra otra; null si no dice nada. */
export function denominacionDesde(texto: string | null): { slug: string; nombre: string } | "fuera" | null {
  if (!texto) return null;
  const t = claveTexto(texto);
  if (!t) return null;
  const d = DENOMINACIONES.find((x) => x.patron.test(t));
  if (d) return { slug: d.slug, nombre: d.nombre };
  // «IGP Castilla y León», «Vino de España»…: el producto está en la categoría pero no es de la D.O.
  // (claveTexto deja «D.O.» como «d o»).
  return /^origen\b|\b(d ?o|d ?o ?ca|d ?o ?p|denominacion|i ?g ?p|v ?t|vino de la tierra|vdt|vino de espana)\b/.test(t) ? "fuera" : null;
}

/** «ARZUAGA Crianza» se queda igual; «Vino Tinto X» → «X». Quita añada y formato. */
export function nombreTienda(nombre: string): string {
  const limpio = nombreVino(nombre);
  const sin = limpio.replace(/^(?:estuche\s+)?vino\s+(?:(?:tinto|blanco|rosado|espumoso|dulce|generoso)\s+)?/i, "");
  return limpiarEspacios(sin) || limpio;
}

/** Ruta sin barras ni `.html`: identificador estable del producto en la tienda. */
export function idExternoDe(url: string): string {
  return new URL(url).pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "");
}

export function normalizarFichaTienda(f: FichaTienda, categoria: CategoriaTienda): VinoNormalizadoVp {
  const tipo = tipoDesde(f.tipoTexto, f.nombre);
  const den = denominacionDesde(f.denominacionTexto);
  const denominacion = den && den !== "fuera" ? den : { slug: categoria.denominacion, nombre: categoria.nombre };

  let descarte: string | null = null;
  if (esPack(f.nombre)) descarte = "pack o estuche";
  else if (!tipo) descarte = "no es un vino (tipo no reconocido)";
  else if (den === "fuera") descarte = `fuera de las D.O. del foco (${f.denominacionTexto})`;

  const nombre = nombreTienda(f.nombre);
  if (!descarte && !nombre) descarte = "sin nombre de vino";
  const texto = f.descripcion;
  const temp = temperaturaDesde(f.temperaturaTexto) ?? temperaturaServicio(texto);
  const variedades = (f.uvasTexto ? variedadesDesde(f.uvasTexto) : uvasDesdeTexto(texto)).filter(
    (v) => !/^(?:otras?|varias|varios)$/i.test(quitarTildes(v.nombre)),
  );
  const formato = f.formatoMl ?? formatoDesde(f.nombre, f.url);

  return {
    idExterno: idExternoDe(f.url),
    url: f.url,
    denominacion: denominacion.slug,
    denominacionNombre: denominacion.nombre,
    descarte,
    vino: { nombre, tipo, crianza: crianzaDesde(f.nombre, null) },
    anada: {
      anio: f.anio ?? anioFicha(f.nombre, f.url),
      temp_servicio_min: temp?.min ?? null,
      temp_servicio_max: temp?.max ?? null,
      meses_crianza: mesesBarrica(texto),
      grado: f.grado ?? graduacion(texto),
    },
    variedades,
    imagen: f.imagen,
    ean: f.ean,
    senales: { bodega: f.bodega, grupo: f.grupo, vino: nombre },
    datos: {
      url: f.url,
      nombre: f.nombre,
      sku: f.sku,
      ean: f.ean,
      precio: f.precio,
      moneda: f.moneda,
      disponibilidad: f.disponibilidad,
      formato_ml: formato,
      denominacion: denominacion.slug,
      bodega_tienda: f.bodega,
      grupo_tienda: f.grupo,
      imagen_url: f.imagen,
    },
  };
}
