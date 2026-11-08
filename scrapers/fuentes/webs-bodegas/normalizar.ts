// Del resultado de un sitio a hechos atómicos (registros_fuente.hechos), con
// la URL de la página de la que sale cada uno. Puro: lo usan guardar.ts y el
// JSON del dry-run (que incluye además los resúmenes que se generarían).
import type { FuenteHecho, Hecho } from "../../lib/consolidacion/hechos.ts";
import { hechosDe } from "../../lib/consolidacion/hechos.ts";
import { PlantillasEsEn } from "../../lib/consolidacion/plantillas.ts";
import { calcularResumenes, type CampoResumen, type EntidadResumen } from "../../lib/consolidacion/resumen.ts";
import { claveTexto } from "../../lib/texto.ts";
import type { BodegaSitio, ServicioSitio, VinoSitio } from "./sitio.ts";

const fuente = (fuenteId: string, url: string | null): FuenteHecho => ({ fuente_id: fuenteId, registro_id: null, url, origen: "bodega" });

/** Hechos de historia y de la bodega (no incluye nombre, municipio ni D.O.: los da el Consejo Regulador). */
export function hechosBodega(b: BodegaSitio, fuenteId: string, urlSitio: string, observadoEn: string, nombre?: string): Hecho[] {
  const de = (k: keyof BodegaSitio["urls"]) => fuente(fuenteId, b.urls[k] ?? urlSitio);
  return [
    ...(nombre ? hechosDe(fuente(fuenteId, urlSitio), observadoEn, [{ clave: "bodega.nombre", valor: nombre }]) : []),
    ...hechosDe(de("fundacion_anio"), observadoEn, [{ clave: "bodega.fundacion_anio", valor: b.fundacion_anio }]),
    ...hechosDe(de("fundadores"), observadoEn, b.fundadores.map((f) => ({ clave: "bodega.fundadores" as const, valor: f, sujeto: claveTexto(f) }))),
    ...hechosDe(de("familia"), observadoEn, [{ clave: "bodega.familia", valor: b.familia }]),
    ...hechosDe(de("generacion"), observadoEn, [{ clave: "bodega.generacion", valor: b.generacion }]),
    ...hechosDe(de("hectareas"), observadoEn, [{ clave: "bodega.hectareas", valor: b.hectareas, unidad: "ha" }]),
    ...hechosDe(de("altitud"), observadoEn, [{ clave: "bodega.altitud", valor: b.altitud, unidad: "m" }]),
    ...hechosDe(de("vinedo_municipios"), observadoEn, b.vinedo_municipios.map((m) => ({ clave: "bodega.vinedo_municipio" as const, valor: m, sujeto: claveTexto(m) }))),
    ...hechosDe(de("primera_anada"), observadoEn, [{ clave: "bodega.primera_anada", valor: b.primera_anada }]),
    ...hechosDe(de("inauguracion"), observadoEn, b.inauguracion ? [{ clave: "bodega.hito", valor: b.inauguracion, sujeto: "inauguracion" }] : []),
    ...hechosDe(de("produccion_botellas"), observadoEn, [{ clave: "bodega.produccion_botellas", valor: b.produccion_botellas, unidad: "botellas" }]),
    ...hechosDe(fuente(fuenteId, b.enoturismo_web), observadoEn, b.enoturismo ? [{ clave: "bodega.enoturismo", valor: true }] : []),
  ];
}

/** Nº de hechos de historia (lo que cuenta el informe del dry-run). */
export function cuentaHechosHistoria(b: BodegaSitio | null): number {
  if (!b) return 0;
  return [b.fundacion_anio, b.familia, b.generacion, b.hectareas, b.altitud, b.primera_anada, b.inauguracion, b.produccion_botellas]
    .filter((x) => x != null).length + b.fundadores.length + b.vinedo_municipios.length;
}

export function hechosVino(v: VinoSitio, fuenteId: string, observadoEn: string, denominacion: string | null): Hecho[] {
  const f = fuente(fuenteId, v.url);
  const conSujeto = (clave: Hecho["clave"], valores: string[]) => valores.map((x) => ({ clave, valor: x, sujeto: x }));
  return hechosDe(f, observadoEn, [
    { clave: "vino.nombre", valor: v.nombre },
    { clave: "vino.tipo", valor: v.tipo },
    { clave: "vino.crianza", valor: v.crianza },
    { clave: "vino.denominacion", valor: denominacion },
    { clave: "vino.ean", valor: v.ean },
    { clave: "anada.anio", valor: v.anio },
    { clave: "anada.barrica_meses", valor: v.barrica_meses, unidad: "meses" },
    { clave: "anada.grado", valor: v.grado, unidad: "%" },
    { clave: "anada.temperatura_min", valor: v.temp_min, unidad: "ºC" },
    { clave: "anada.temperatura_max", valor: v.temp_max, unidad: "ºC" },
    ...v.variedades.map((x) => ({ clave: "anada.variedad" as const, valor: x.porcentaje, sujeto: x.nombre, unidad: "%" })),
    ...conSujeto("anada.cata.vista", v.cata_vista),
    ...conSujeto("anada.cata.nariz", v.cata_nariz),
    ...conSujeto("anada.cata.boca", v.cata_boca),
    ...conSujeto("vino.maridaje", v.maridaje),
  ]);
}

export function hechosServicio(s: ServicioSitio, fuenteId: string, observadoEn: string): Hecho[] {
  return hechosDe(fuente(fuenteId, s.url), observadoEn, [
    { clave: "servicio.tipo", valor: s.tipo },
    { clave: "servicio.titulo", valor: s.titulo },
    { clave: "servicio.precio_desde", valor: s.precio_desde, unidad: "€" },
    { clave: "servicio.duracion_minutos", valor: s.duracion_minutos, unidad: "min" },
    { clave: "servicio.url_reserva", valor: s.url_reserva },
    ...s.idiomas.map((i) => ({ clave: "servicio.idioma" as const, valor: i, sujeto: i })),
  ]);
}

/** Resúmenes que se generarían solo con estos hechos (para revisar en el dry-run). */
export async function previsualizar(entidad: EntidadResumen, campo: CampoResumen, hechos: Hecho[]): Promise<string | null> {
  const [es] = await calcularResumenes(new PlantillasEsEn(), entidad, campo, hechos);
  return es?.resumen.texto ?? null;
}
