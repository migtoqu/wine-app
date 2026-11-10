// C.R.D.O. Navarra: de ficha cruda a bodega (núcleo común de consejos), vino y servicio
// con las formas que espera GuardadoConsejoCompleto.
import { claveNombreBodega, claveTexto, limpiarEspacios } from "../../../lib/texto.ts";
import type { BodegaCompleta, ServicioCompleto, VinoCompleto } from "../comun/guardar-completo.ts";
import { normalizarBodega as normalizarBodegaConsejo } from "../comun/normalizar.ts";
import { duracionMinutos, idiomasDe, parsearPrecio } from "../comun/servicios.ts";
import type { DefinicionConsejo, FichaConsejo } from "../comun/tipos.ts";
import { crianzaDe, separarAnada, tipoVino } from "../comun/vinos.ts";
import type { FichaBodegaNavarra, FichaExperienciaNavarra, FichaVinoNavarra } from "./parsear.ts";

export const DENOMINACION = { slug: "navarra", nombre: "Navarra" };

// Municipios con bodegas de la D.O. (las cinco zonas). La ficha da la calle y, a veces, la población
// al final («Camino de Araiz S/N Olite»): se reconoce con esta lista.
const MUNICIPIOS = [
  "Ablitas", "Allo", "Añorbe", "Arellano", "Arróniz", "Artajona", "Ayegui", "Barásoain", "Barillas", "Beire",
  "Cadreita", "Cascante", "Castejón", "Cintruénigo", "Corella", "Dicastillo", "Eslava", "Estella", "Falces",
  "Fitero", "Funes", "Garínoain", "Igúzquiza", "Lerga", "Lerín", "Lumbier", "Mañeru", "Marcilla", "Mendavia",
  "Mendigorría", "Milagro", "Monteagudo", "Morentin", "Murchante", "Murillo el Fruto", "Obanos", "Olite",
  "Oteiza", "Peralta", "Pitillas", "Puente la Reina", "Sada", "San Martín de Unx", "Sangüesa", "Santacara",
  "Tafalla", "Tudela", "Tulebras", "Ujué", "Villafranca", "Villamayor de Monjardín", "Murieta", "Aberin",
  "Larraga", "Miranda de Arga", "Berbinzana", "Ucar", "Úcar", "Uterga", "Legarda", "Cizur", "Etxauri", "Arguedas",
  "Valtierra", "Fustiñana", "Cortes", "Buñuel", "Ribaforada", "Fontellas", "Cabanillas", "Murillo el Cuende",
  "Caparroso", "Mélida", "Carcastillo", "Ujue", "Aibar", "Gallipienzo", "Cáseda", "Sansoáin", "Leoz",
];
const PROVINCIA_POR_MUNICIPIO = Object.fromEntries(MUNICIPIOS.map((m) => [claveTexto(m), "Navarra"]));

export const configNavarra: Pick<DefinicionConsejo, "denominacion" | "provinciaPorMunicipio" | "provinciaUnica"> = {
  denominacion: DENOMINACION,
  provinciaPorMunicipio: PROVINCIA_POR_MUNICIPIO,
  // La D.O. Navarra está entera en la Comunidad Foral.
  provinciaUnica: "Navarra",
};

/**
 * Población al final de la dirección, si es un municipio conocido de la D.O.
 * «Camino de Araiz S/N Olite» → { calle: «Camino de Araiz S/N», municipio: «Olite» }.
 */
export function partirDireccion(texto: string | null): { calle: string | null; municipio: string | null } {
  if (!texto) return { calle: null, municipio: null };
  const limpio = limpiarEspacios(texto).replace(/[,.\s]+$/, "");
  const c = ` ${claveTexto(limpio)}`;
  const candidatos = MUNICIPIOS.filter((m) => c.endsWith(` ${claveTexto(m)}`)).sort((a, b) => b.length - a.length);
  const municipio = candidatos[0];
  if (!municipio) return { calle: limpio || null, municipio: null };
  // Quita las últimas N palabras (las del municipio) de la dirección original.
  const palabras = limpio.split(" ");
  const calle = palabras.slice(0, palabras.length - municipio.split(" ").length).join(" ").replace(/[,\s-]+$/, "");
  return { calle: calle || null, municipio };
}

/** ¿Ofrece visitas? Algún servicio de enoturismo es una visita. */
export const ofreceVisitas = (servicios: string[]) => servicios.some((s) => /\bvisita/i.test(s));

export type BodegaNavarra = BodegaCompleta & ReturnType<typeof normalizarBodegaConsejo>;

export function normalizarBodega(f: FichaBodegaNavarra, zona: string | null, municipioExperiencia: string | null = null): BodegaNavarra {
  const dir = partirDireccion(f.direccion_texto);
  const ficha: FichaConsejo = {
    url: f.url,
    id_externo: `bodega:${f.slug_fuente}`,
    nombre: f.nombre,
    direccion: dir.calle,
    codigo_postal: null,
    municipio: dir.municipio ?? municipioExperiencia,
    provincia_texto: null,
    ubicacion: f.ubicacion,
    web: f.web,
    telefono: f.telefono,
    email: f.email,
    marcas: [],
    enoturismo: f.enoturismo.length ? ofreceVisitas(f.enoturismo) : null,
    extra: {
      ...(zona ? { zona } : {}),
      ...(f.enoturismo.length ? { servicios_enoturismo: f.enoturismo } : {}),
      ...(f.instalaciones.length ? { instalaciones: f.instalaciones } : {}),
      vinos_enlazados: f.vinos_enlazados,
      experiencias_enlazadas: f.experiencias_enlazadas,
    },
  };
  const n = normalizarBodegaConsejo(ficha, configNavarra);
  return { ...n, campos: { ...n.campos, anio_fundacion: null }, datos: { ...n.datos, slug_fuente: f.slug_fuente } };
}

// ---------------------------------------------------------------------------

/** «Tempranillo, Cabernet Sauvignon y Merlot» → tres uvas. */
export function partirVariedades(texto: string | null): string[] {
  return (texto ?? "")
    .split(/\s*(?:,|;|\/|\s+y\s+)\s*/i)
    .map((v) => limpiarEspacios(v.replace(/\d+\s*%/g, "")).replace(/[.]+$/, ""))
    .filter((v) => v !== "");
}

/** «11 meses de roble francés» → 11; «Sin crianza» → null. */
export function mesesBarrica(texto: string | null): number | null {
  const m = /(\d{1,2})\s*mes(?:es)?\b/i.exec(texto ?? "");
  const n = m ? Number(m[1]) : NaN;
  return n > 0 && n <= 60 ? n : null;
}

export type VinoNavarra = VinoCompleto & {
  clave_bodega: string;
  datos: FichaVinoNavarra & { vino: VinoCompleto["vino"]; anio: number | null; precio: number | null };
};

export function normalizarVino(f: FichaVinoNavarra): VinoNavarra {
  const { nombre, anio } = separarAnada(f.nombre, null);
  const tipo = tipoVino(f.tipo_texto);
  const crianza = crianzaDe(f.tipo_texto, nombre, f.crianza_texto);
  const variedades = partirVariedades(f.variedades_texto).map((v) => ({ nombre: v, porcentaje: null }));
  const meses = mesesBarrica(f.crianza_texto);
  const hechos: VinoCompleto["hechos"] = [{ clave: "vino.nombre", valor: nombre }];
  if (tipo) hechos.push({ clave: "vino.tipo", valor: tipo });
  if (crianza) hechos.push({ clave: "vino.crianza", valor: crianza });
  hechos.push({ clave: "vino.denominacion", valor: DENOMINACION.nombre });
  if (anio) hechos.push({ clave: "anada.anio", valor: anio });
  for (const v of variedades) hechos.push({ clave: "anada.variedad", valor: null, sujeto: v.nombre });
  if (meses) hechos.push({ clave: "anada.barrica_meses", valor: meses, unidad: "meses" });
  const vino = { nombre, tipo, crianza };
  return {
    idExterno: `vino:${f.slug_fuente}`,
    url: f.url,
    vino,
    anada: { anio },
    variedades,
    bodega_texto: f.bodega_texto,
    clave_bodega: claveNombreBodega(f.bodega_texto ?? ""),
    hechos,
    datos: { ...f, vino, anio, precio: parsearPrecio(f.precio_texto) },
  };
}

// ---------------------------------------------------------------------------

/** «2» (la web da horas sin unidad), «2 horas», «90 min» → minutos. */
export function duracionDe(texto: string | undefined): number | null {
  if (!texto) return null;
  const solo = /^\s*(\d+(?:[.,]\d+)?)\s*$/.exec(texto);
  if (solo) {
    const h = Number(solo[1]!.replace(",", "."));
    return h > 0 && h <= 12 ? Math.round(h * 60) : null;
  }
  return duracionMinutos([texto]);
}

export type ServicioNavarra = ServicioCompleto & { bodega_slug: string | null; datos: FichaExperienciaNavarra };

export function normalizarExperiencia(f: FichaExperienciaNavarra): ServicioNavarra {
  const precio = f.info["precio"];
  const gratis = /gratuit|gratis/i.test(precio ?? "");
  const horario = [f.info["temporada"], f.info["horario"]].filter(Boolean).join(" · ");
  return {
    idExterno: `exp:${f.slug_fuente}`,
    url: f.url,
    titulo: limpiarEspacios(f.titulo),
    tipo: f.tipo,
    bodega_slug: f.bodega_slug,
    campos: {
      precio_desde: gratis ? 0 : parsearPrecio(precio),
      duracion_minutos: duracionDe(f.info["duracion"]),
      idiomas: idiomasDe(f.info["idioma"] ? [f.info["idioma"]] : f.info["idiomas"] ? [f.info["idiomas"]] : []),
      horario: horario ? limpiarEspacios(horario) : null,
      url_reserva: f.url_reserva,
    },
    datos: f,
  };
}
