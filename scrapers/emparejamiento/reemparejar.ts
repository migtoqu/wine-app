// Núcleo de `scrapers/reemparejar.ts`: vuelve a pasar la cola de revisión por el
// emparejador actual y dice qué se resolvería. Es puro (recibe una instantánea de
// la BD) para poder probarlo y ejecutarlo en seco con datos exportados.
//
// Qué hace con cada registro en revisión (sin decisión del admin ni supresión):
//   - ficha de bodega (C.R., guía, sitio web) → EmparejadorBodegas; si ahora se
//     vincula, es «aplicable»: el script puede enlazar el registro a la bodega y la
//     próxima ejecución de la fuente consolida sus campos.
//   - vino dentro de su bodega (webs de bodegas, Rioja) → EmparejadorVinos;
//   - vino de tienda → Emparejador vino→bodega y luego EmparejadorVinos;
//   - vino de Rioja cuya bodega no estaba en el catálogo → EmparejadorBodegas con el
//     nombre de bodega que da el C.R. (solo informe).
//   Los vinos no se aplican aquí: crear o enlazar la añada es cosa del scraper, que en
//   su próxima ejecución empareja de nuevo los registros en revisión con este código.
//   Los vinos de webs con tipo desconocido se dejan (los trata webs-bodegas).
//
// Auditoría: vinculaciones de bodega ya hechas entre fuentes que el emparejador actual
// no haría (posibles falsos positivos), con lo que habría que mover para separarlas.
import { Emparejador, type BodegaCandidata } from "./bodegas.ts";
import {
  EmparejadorBodegas,
  UMBRAL_REVISION,
  type BodegaCatalogo,
  type DatosBodega,
  type ResultadoBodega,
  type SupresionBodega,
} from "./entidades.ts";
import { coordenadas } from "./lugar.ts";
import { EmparejadorVinos, type SupresionVino, type VinoCatalogo } from "./vinos.ts";
import { claveNombreBodega } from "../lib/texto.ts";

export interface RegistroRevision {
  id: string;
  fuente: string;
  idExterno: string;
  datos: Record<string, unknown>;
  /** Bodega del contexto: la del sitio (webs de bodegas) o la ficha enlazada (vinos de Rioja). */
  bodegaId: string | null;
}

export interface RegistroVinculado {
  id: string;
  fuente: string;
  idExterno: string;
  bodegaId: string;
  datos: Record<string, unknown>;
}

export interface Instantanea {
  bodegas: BodegaCatalogo[];
  supresionesBodega: SupresionBodega[];
  vinos: VinoCatalogo[];
  eans: { ean: string; vinoId: string }[];
  supresionesVino: SupresionVino[];
  registros: RegistroRevision[];
  /** Registros de bodega ya vinculados (excluir: una fuente no lista dos veces la misma bodega). */
  vinculadas: { fuente: string; idExterno: string; bodegaId: string }[];
  /** Vinculaciones de bodega entre fuentes distintas, para auditar. */
  auditoria?: RegistroVinculado[];
}

export type Accion =
  | "vincular_bodega" // aplicable: enlazar el registro a la bodega
  | "vino_existente" // la próxima ejecución lo enlazará a este vino
  | "vino_nuevo" // la próxima ejecución creará el vino (ya no se parece a ninguno)
  | "bodega_encontrada" // vino de tienda/Rioja: ahora hay bodega; el vino lo resuelve el scraper
  | "sigue_revision"
  | "sin_bodega" // la bodega sigue sin estar en el catálogo
  | "omitido"; // fuera de alcance (tipo desconocido, servicios…)

export interface Resultado {
  registroId: string;
  fuente: string;
  idExterno: string;
  tipo: "bodega" | "vino" | "vino_tienda" | "vino_sin_bodega" | "servicio" | "otro";
  nombre: string;
  accion: Accion;
  destinoId: string | null;
  destinoNombre: string | null;
  confianza: number | null;
  motivo: string | null;
  candidatos: { id: string; nombre: string; puntuacion: number }[];
}

export interface Sospecha {
  registroId: string;
  fuente: string;
  idExterno: string;
  bodegaActual: string;
  bodegaActualNombre: string;
  ahora: ResultadoBodega["estado"];
  candidato: string | null;
  confianza: number;
}

export interface Informe {
  resultados: Resultado[];
  resumen: Record<string, Record<Accion, number>>;
  sospechas: Sospecha[];
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Lo que una ficha de bodega guardada en `datos` dice de la bodega (formatos de C.R., guía y webs). */
export function datosBodegaDeRegistro(datos: Record<string, unknown>): DatosBodega | null {
  const c = { ...datos, ...obj(datos.campos) };
  const dominio = texto(datos.dominio);
  const nombre = texto(c.nombre) ?? dominio;
  if (!nombre) return null;
  return {
    nombre,
    municipio: texto(c.municipio),
    provincia: texto(c.provincia),
    codigoPostal: texto(c.codigo_postal),
    telefono: texto(c.telefono),
    direccion: texto(c.direccion),
    web: texto(c.web) ?? (dominio ? `https://${dominio}` : null),
    ubicacion: coordenadas(c.ubicacion),
    nif: texto(c.nif),
    registroEmbotellador: texto(c.registro_embotellador),
  };
}

function tipoDeRegistro(r: RegistroRevision): Resultado["tipo"] {
  const d = r.datos;
  if (d.titulo !== undefined || r.idExterno.startsWith("exp:") || r.idExterno.startsWith("servicio:")) return "servicio";
  if (d.bodega_tienda !== undefined) return "vino_tienda";
  if (d.vino !== undefined) return r.bodegaId ? "vino" : "vino_sin_bodega";
  if (datosBodegaDeRegistro(d)) return "bodega";
  return "otro";
}

const vacio = (): Record<Accion, number> => ({
  vincular_bodega: 0, vino_existente: 0, vino_nuevo: 0, bodega_encontrada: 0, sigue_revision: 0, sin_bodega: 0, omitido: 0,
});

export function reemparejar(inst: Instantanea): Informe {
  const nombreBodega = new Map(inst.bodegas.map((b) => [b.id, b.nombre]));
  const bodegas = new EmparejadorBodegas(inst.bodegas, inst.supresionesBodega);
  const vinos = new EmparejadorVinos(inst.vinos, inst.eans, inst.supresionesVino);
  const tienda = new Emparejador(
    inst.bodegas.map((b): BodegaCandidata => ({ id: b.id, nombre: b.nombre, clave: claveNombreBodega(b.nombre), marcas: b.marcas ?? [] })),
  );
  const nombreVino = new Map(inst.vinos.map((v) => [v.id, v.nombre]));
  const vinculadasPorFuente = new Map<string, { idExterno: string; bodegaId: string }[]>();
  for (const v of inst.vinculadas) vinculadasPorFuente.set(v.fuente, [...(vinculadasPorFuente.get(v.fuente) ?? []), v]);
  const excluir = (fuente: string, idExterno: string) =>
    new Set((vinculadasPorFuente.get(fuente) ?? []).filter((v) => v.idExterno !== idExterno).map((v) => v.bodegaId));

  const resultados: Resultado[] = [];
  for (const r of inst.registros) {
    const tipo = tipoDeRegistro(r);
    const base = { registroId: r.id, fuente: r.fuente, idExterno: r.idExterno, tipo };
    const motivoPrevio = texto(obj(r.datos.emparejamiento).motivo) ?? texto(r.datos.motivo);

    if (tipo === "bodega") {
      const d = datosBodegaDeRegistro(r.datos)!;
      const e = bodegas.emparejar(d, { excluir: excluir(r.fuente, r.idExterno) });
      resultados.push({
        ...base, nombre: d.nombre,
        accion: e.estado === "vinculada" ? "vincular_bodega" : e.estado === "revision" ? "sigue_revision" : "sin_bodega",
        destinoId: e.bodegaId, destinoNombre: e.bodegaId ? nombreBodega.get(e.bodegaId) ?? null : null,
        confianza: e.confianza, motivo: e.candidatos[0]?.motivo ?? null, candidatos: e.candidatos,
      });
      continue;
    }

    if (tipo === "vino" || tipo === "vino_tienda") {
      const v = obj(r.datos.vino);
      const nombre = texto(v.nombre) ?? texto(r.datos.nombre) ?? r.idExterno;
      if (motivoPrevio === "tipo_desconocido" || motivoPrevio === "tipo de vino desconocido") {
        resultados.push({ ...base, nombre, accion: "omitido", destinoId: null, destinoNombre: null, confianza: null, motivo: "tipo_desconocido", candidatos: [] });
        continue;
      }
      let bodegaId = r.bodegaId;
      let candidatosBodega: Resultado["candidatos"] = [];
      let motivoBodega: string | null = null;
      let confianza: number | null = null;
      if (tipo === "vino_tienda") {
        const grupo = Array.isArray(r.datos.grupo_tienda) ? r.datos.grupo_tienda.filter((g): g is string => typeof g === "string") : [];
        // Como en la tienda: el nombre del vino sin añada.
        const sinAnada = nombre.replace(/\b(?:19|20)\d\d\b/g, " ").replace(/\s+/g, " ").trim();
        const e = tienda.emparejar({ bodega: texto(r.datos.bodega_tienda), grupo, vino: sinAnada });
        bodegaId = e.bodegaId;
        candidatosBodega = e.candidatos;
        motivoBodega = e.candidatos[0]?.motivo ?? null;
        confianza = e.confianza;
        if (!bodegaId) {
          resultados.push({
            ...base, nombre, accion: e.confianza >= UMBRAL_REVISION ? "sigue_revision" : "sin_bodega",
            destinoId: null, destinoNombre: null, confianza, motivo: e.candidatos[0]?.motivo ?? null, candidatos: candidatosBodega,
          });
          continue;
        }
      }
      const m = vinos.emparejar({ bodegaId: bodegaId!, nombre, tipo: texto(v.tipo), crianza: texto(v.crianza), ean: texto(v.ean) ?? texto(r.datos.ean) });
      const accion: Accion =
        m.estado === "vinculado" ? "vino_existente" : m.estado === "revision" ? "sigue_revision" : tipo === "vino_tienda" ? "bodega_encontrada" : "vino_nuevo";
      resultados.push({
        ...base, nombre, accion,
        destinoId: m.vinoId ?? (accion === "bodega_encontrada" ? bodegaId : null),
        destinoNombre: m.vinoId ? nombreVino.get(m.vinoId) ?? null : accion === "bodega_encontrada" ? nombreBodega.get(bodegaId!) ?? null : null,
        confianza, motivo: m.motivo ?? motivoBodega, candidatos: m.candidatos.length ? m.candidatos : candidatosBodega,
      });
      continue;
    }

    if (tipo === "vino_sin_bodega") {
      const nombreB = texto(r.datos.bodega_texto) ?? texto(r.datos.bodega_nombre);
      const v = obj(r.datos.vino);
      const nombre = texto(v.nombre) ?? texto(r.datos.nombre) ?? r.idExterno;
      const e = nombreB ? bodegas.emparejar({ nombre: nombreB }) : null;
      resultados.push({
        ...base, nombre: `${nombre} (${nombreB ?? "?"})`,
        accion: e?.estado === "vinculada" ? "bodega_encontrada" : e?.estado === "revision" ? "sigue_revision" : "sin_bodega",
        destinoId: e?.bodegaId ?? null, destinoNombre: e?.bodegaId ? nombreBodega.get(e.bodegaId) ?? null : null,
        confianza: e?.confianza ?? null, motivo: e?.candidatos[0]?.motivo ?? motivoPrevio, candidatos: e?.candidatos ?? [],
      });
      continue;
    }

    resultados.push({
      ...base, nombre: texto(r.datos.titulo) ?? texto(r.datos.nombre) ?? r.idExterno,
      accion: "omitido", destinoId: null, destinoNombre: null, confianza: null, motivo: motivoPrevio, candidatos: [],
    });
  }

  const resumen: Informe["resumen"] = {};
  for (const r of resultados) {
    const grupo = r.fuente.startsWith("web-") ? "webs-bodegas" : r.fuente;
    resumen[grupo] ??= vacio();
    resumen[grupo][r.accion]++;
  }

  const sospechas: Sospecha[] = [];
  for (const a of inst.auditoria ?? []) {
    const d = datosBodegaDeRegistro(a.datos);
    if (!d) continue;
    const e = bodegas.emparejar(d, { excluir: excluir(a.fuente, a.idExterno) });
    if (e.estado === "vinculada" && e.bodegaId === a.bodegaId) continue;
    sospechas.push({
      registroId: a.id, fuente: a.fuente, idExterno: a.idExterno,
      bodegaActual: a.bodegaId, bodegaActualNombre: nombreBodega.get(a.bodegaId) ?? "?",
      ahora: e.estado, candidato: e.candidatos[0] ? `${e.candidatos[0].nombre} (${e.candidatos[0].motivo})` : null, confianza: e.confianza,
    });
  }
  return { resultados, resumen, sospechas };
}

/** Informe en Markdown para el PR / el orquestador. */
export function informeMarkdown(inf: Informe): string {
  const L: string[] = ["| Fuente | Vincular bodega | Vino existente | Vino nuevo | Bodega encontrada | Sigue en revisión | Sin bodega | Omitido |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const [f, c] of Object.entries(inf.resumen).sort()) {
    L.push(`| ${f} | ${c.vincular_bodega} | ${c.vino_existente} | ${c.vino_nuevo} | ${c.bodega_encontrada} | ${c.sigue_revision} | ${c.sin_bodega} | ${c.omitido} |`);
  }
  const cambian = inf.resultados.filter((r) => r.accion !== "sigue_revision" && r.accion !== "omitido" && r.accion !== "sin_bodega");
  if (cambian.length) {
    L.push("", "Se resuelven:", "");
    for (const r of cambian) L.push(`- \`${r.fuente}\` ${r.nombre} → **${r.accion}** ${r.destinoNombre ?? ""} (${r.motivo ?? ""})`);
  }
  if (inf.sospechas.length) {
    L.push("", "Vinculaciones existentes que el emparejador actual no haría:", "");
    for (const s of inf.sospechas) L.push(`- \`${s.fuente}\` ${s.idExterno} → ${s.bodegaActualNombre}; ahora: ${s.ahora} ${s.confianza} ~ ${s.candidato ?? "-"}`);
  }
  return L.join("\n");
}
