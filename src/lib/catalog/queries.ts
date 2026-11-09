import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { isValidSlug, PAGE_SIZE, toListarBodegasArgs, toListarVinosArgs, type SearchFilters } from "./filters";
import { sortAnadas } from "./format";
import { createPublicClient } from "./public-client";
import type {
  BodegaFicha,
  BodegaListItem,
  CatalogImage,
  DenominacionRef,
  FilterOption,
  Procedencias,
  Resumen,
  SearchSuggestion,
  ServicioBodega,
  VinoFicha,
  VinoListItem,
} from "./types";

// Lecturas del catálogo, todas cacheadas con 'use cache'.
//   * Fichas: perfil "catalogo" de next.config.ts (los datos cambian cada
//     semana) y etiquetas para invalidarlas a demanda con revalidateTag.
//   * Búsquedas: perfil "hours", con los filtros ya normalizados como clave.
// Los errores de Supabase se lanzan para que los recoja el error boundary.

export const CATALOG_TAG = "catalogo";

type RawImage = {
  url: string;
  alt: string | null;
  atribucion: string | null;
  tipo: string;
  principal: boolean;
  orden: number;
  estado_enlace: string;
};

const IMAGE_FIELDS = "url, alt, atribucion, tipo, principal, orden, estado_enlace";

// Nunca salen del servidor las imágenes ocultas por el comprobador de enlaces.
function visibleImages(images: RawImage[] | null, preferTipo: string): CatalogImage[] {
  return (images ?? [])
    .filter((i) => i.estado_enlace !== "oculto")
    .sort(
      (a, b) =>
        Number(b.principal) - Number(a.principal) ||
        Number(b.tipo === preferTipo) - Number(a.tipo === preferTipo) ||
        a.orden - b.orden,
    )
    .map(({ url, alt, atribucion }) => ({ url, alt, atribucion }));
}

type EntidadFicha = "bodega" | "vino" | "anada";

// Enlaces ocultos por el comprobador (o el admin). Llegan en la misma consulta
// de la ficha como campo calculado `enlaces_ocultos` (URLs, sin más datos) y
// nunca salen del servidor.
type ConOcultos = { id: string; enlaces_ocultos: string[] | null };

function ocultosPorId(filas: ConOcultos[]): Map<string, Set<string>> {
  return new Map(filas.map((f) => [f.id, new Set(f.enlaces_ocultos ?? [])]));
}

function visible(url: string | null, ocultas: Set<string> | undefined): string | null {
  return url && ocultas?.has(url) ? null : url;
}

// Procedencia por campo y resúmenes propios de un conjunto de entidades
// (tablas polimórficas: sin FK a la entidad, así que van en consultas aparte).
async function procedenciaYResumenes(
  tipo: EntidadFicha,
  ids: string[],
  ocultos: Map<string, Set<string>> = new Map(),
): Promise<{ procedencia: Map<string, Procedencias>; resumenes: Map<string, Resumen[]> }> {
  const procedencia = new Map<string, Procedencias>();
  const resumenes = new Map<string, Resumen[]>();
  if (ids.length === 0) return { procedencia, resumenes };
  const client = createPublicClient();
  const [proc, res] = await Promise.all([
    client
      .from("procedencia_campos")
      .select("entidad_id, campo, origen, url, observado_en, fuente:fuentes(nombre, url_base)")
      .eq("entidad_tipo", tipo)
      .in("entidad_id", ids),
    client
      .from("resumenes")
      .select("entidad_id, campo, idioma, texto, fuentes")
      .eq("entidad_tipo", tipo)
      .in("entidad_id", ids),
  ]);
  if (proc.error) throw new Error(`procedencia(${tipo}): ${proc.error.message}`);
  if (res.error) throw new Error(`resumenes(${tipo}): ${res.error.message}`);

  for (const p of proc.data) {
    const m = procedencia.get(p.entidad_id) ?? {};
    // Un enlace de procedencia oculto deja paso a la portada de la fuente.
    const url = visible(p.url, ocultos.get(p.entidad_id));
    m[p.campo] = { origen: p.origen, fuente: p.fuente, url, observado_en: p.observado_en };
    procedencia.set(p.entidad_id, m);
  }

  const fuenteIds = [...new Set(res.data.flatMap((r) => r.fuentes))];
  const fuentes = new Map<string, { nombre: string; url_base: string }>();
  if (fuenteIds.length > 0) {
    const f = await client.from("fuentes").select("id, nombre, url_base").in("id", fuenteIds);
    if (f.error) throw new Error(`fuentes: ${f.error.message}`);
    for (const x of f.data) fuentes.set(x.id, { nombre: x.nombre, url_base: x.url_base });
  }
  for (const r of res.data) {
    const lista = resumenes.get(r.entidad_id) ?? [];
    lista.push({
      campo: r.campo,
      idioma: r.idioma,
      texto: r.texto,
      fuentes: r.fuentes.flatMap((id) => (fuentes.has(id) ? [fuentes.get(id)!] : [])),
    });
    resumenes.set(r.entidad_id, lista);
  }
  return { procedencia, resumenes };
}

export async function getVino(slug: string): Promise<VinoFicha | null> {
  "use cache";
  cacheLife("catalogo");
  cacheTag(CATALOG_TAG, `vino:${slug}`);
  if (!isValidSlug(slug)) return null;

  const { data, error } = await createPublicClient()
    .from("vinos")
    .select(
      `id, slug, nombre, tipo, crianza, descripcion, elaboracion, updated_at, enlaces_ocultos,
       bodega:bodegas!inner(slug, nombre, municipio, provincia),
       denominacion:denominaciones(slug, nombre, tipo),
       fuente:fuentes(nombre, url_base),
       imagenes(${IMAGE_FIELDS}),
       anadas(id, anio, grado, meses_crianza, notas_cata, maridaje, temp_servicio_min,
              temp_servicio_max, produccion_botellas, elaboracion, cata_vista, cata_nariz,
              cata_boca, updated_at, enlaces_ocultos,
              anada_variedades(porcentaje, variedad:variedades_uva(slug, nombre, color)),
              imagenes(${IMAGE_FIELDS}))`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getVino(${slug}): ${error.message}`);
  if (!data) return null;
  const [delVino, deAnadas] = await Promise.all([
    procedenciaYResumenes("vino", [data.id], ocultosPorId([data])),
    procedenciaYResumenes("anada", data.anadas.map((a) => a.id), ocultosPorId(data.anadas)),
  ]);

  return {
    id: data.id,
    slug: data.slug,
    nombre: data.nombre,
    tipo: data.tipo,
    crianza: data.crianza,
    descripcion: data.descripcion,
    elaboracion: data.elaboracion,
    updated_at: data.updated_at,
    procedencia: delVino.procedencia.get(data.id) ?? {},
    bodega: data.bodega,
    denominacion: data.denominacion,
    fuente: data.fuente,
    imagenes: visibleImages(data.imagenes, "botella"),
    anadas: sortAnadas(
      data.anadas.map((a) => ({
        id: a.id,
        anio: a.anio,
        grado: a.grado,
        meses_crianza: a.meses_crianza,
        notas_cata: a.notas_cata,
        maridaje: a.maridaje,
        temp_servicio_min: a.temp_servicio_min,
        temp_servicio_max: a.temp_servicio_max,
        produccion_botellas: a.produccion_botellas,
        elaboracion: a.elaboracion,
        cata_vista: a.cata_vista,
        cata_nariz: a.cata_nariz,
        cata_boca: a.cata_boca,
        updated_at: a.updated_at,
        procedencia: deAnadas.procedencia.get(a.id) ?? {},
        resumenes: deAnadas.resumenes.get(a.id) ?? [],
        variedades: a.anada_variedades
          .flatMap((av) => (av.variedad ? [{ ...av.variedad, porcentaje: av.porcentaje }] : []))
          .sort(
            (x, y) =>
              (y.porcentaje ?? -1) - (x.porcentaje ?? -1) || x.nombre.localeCompare(y.nombre),
          ),
        imagenes: visibleImages(a.imagenes, "botella"),
      })),
    ),
  };
}

// Vinos de una bodega (todas las páginas; una bodega tiene como mucho unas decenas).
async function vinosDeBodega(bodegaSlug: string): Promise<VinoListItem[]> {
  const client = createPublicClient();
  const all: VinoListItem[] = [];
  const pageSize = 48;
  for (let page = 0; page < 20; page++) {
    const { data, error } = await client.rpc("listar_vinos", {
      bodega: bodegaSlug,
      orden: "nombre",
      limite: pageSize,
      desplazamiento: page * pageSize,
    });
    if (error) throw new Error(`listar_vinos(bodega=${bodegaSlug}): ${error.message}`);
    all.push(...data);
    if (data.length < pageSize || all.length >= (data[0]?.total ?? 0)) break;
  }
  return all;
}

export async function getOtrosVinos(
  bodegaSlug: string,
  excludeId: string,
  limit = 8,
): Promise<VinoListItem[]> {
  "use cache";
  cacheLife("catalogo");
  cacheTag(CATALOG_TAG, `bodega:${bodegaSlug}`);
  const { data, error } = await createPublicClient().rpc("listar_vinos", {
    bodega: bodegaSlug,
    orden: "novedad",
    limite: limit + 1,
  });
  if (error) throw new Error(`getOtrosVinos(${bodegaSlug}): ${error.message}`);
  return data.filter((v) => v.id !== excludeId).slice(0, limit);
}

export async function getBodega(slug: string): Promise<BodegaFicha | null> {
  "use cache";
  cacheLife("catalogo");
  cacheTag(CATALOG_TAG, `bodega:${slug}`);
  if (!isValidSlug(slug)) return null;

  const { data, error } = await createPublicClient()
    .from("bodegas")
    .select(
      `id, slug, nombre, descripcion, direccion, codigo_postal, municipio, provincia, comunidad,
       web, telefono, email, redes, anio_fundacion, hectareas, estado, historia,
       enoturismo_web, enoturismo_email, enoturismo_telefono, updated_at, enlaces_ocultos,
       servicios_bodega(id, tipo, titulo, descripcion, precio_desde, duracion_minutos, idiomas,
                        horario, url_reserva, activo, enlaces_ocultos),
       fuente:fuentes(nombre, url_base),
       bodega_denominaciones(principal, denominacion:denominaciones(slug, nombre, tipo)),
       imagenes(${IMAGE_FIELDS})`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getBodega(${slug}): ${error.message}`);
  if (!data) return null;
  const ocultas = new Set(data.enlaces_ocultos ?? []);
  const extra = await procedenciaYResumenes("bodega", [data.id], ocultosPorId([data]));
  const servicios: ServicioBodega[] = data.servicios_bodega
    .filter((s) => s.activo)
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.titulo.localeCompare(b.titulo))
    .map((s) => ({
      id: s.id,
      tipo: s.tipo,
      titulo: s.titulo,
      descripcion: s.descripcion,
      precio_desde: s.precio_desde,
      duracion_minutos: s.duracion_minutos,
      idiomas: s.idiomas,
      horario: s.horario,
      url_reserva: visible(s.url_reserva, new Set(s.enlaces_ocultos ?? [])),
    }));

  const denominaciones: DenominacionRef[] = [...data.bodega_denominaciones]
    .sort(
      (a, b) =>
        Number(b.principal) - Number(a.principal) ||
        a.denominacion.nombre.localeCompare(b.denominacion.nombre),
    )
    .map((bd) => bd.denominacion);

  return {
    id: data.id,
    slug: data.slug,
    nombre: data.nombre,
    descripcion: data.descripcion,
    direccion: data.direccion,
    codigo_postal: data.codigo_postal,
    municipio: data.municipio,
    provincia: data.provincia,
    comunidad: data.comunidad,
    web: visible(data.web, ocultas),
    telefono: data.telefono,
    email: data.email,
    redes: data.redes,
    anio_fundacion: data.anio_fundacion,
    hectareas: data.hectareas,
    estado: data.estado,
    historia: data.historia,
    enoturismo_web: visible(data.enoturismo_web, ocultas),
    enoturismo_email: data.enoturismo_email,
    enoturismo_telefono: data.enoturismo_telefono,
    servicios,
    procedencia: extra.procedencia.get(data.id) ?? {},
    resumenes: extra.resumenes.get(data.id) ?? [],
    updated_at: data.updated_at,
    fuente: data.fuente,
    denominaciones,
    imagenes: visibleImages(data.imagenes, "bodega"),
    vinos: await vinosDeBodega(data.slug),
  };
}

export type Paged<T> = { items: T[]; total: number };

export async function listarVinos(filters: SearchFilters): Promise<Paged<VinoListItem>> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const { data, error } = await createPublicClient().rpc(
    "listar_vinos",
    toListarVinosArgs(filters, PAGE_SIZE),
  );
  if (error) throw new Error(`listar_vinos: ${error.message}`);
  return { items: data, total: data[0]?.total ?? 0 };
}

export async function listarBodegas(filters: SearchFilters): Promise<Paged<BodegaListItem>> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const { data, error } = await createPublicClient().rpc(
    "listar_bodegas",
    toListarBodegasArgs(filters, PAGE_SIZE),
  );
  if (error) throw new Error(`listar_bodegas: ${error.message}`);
  return { items: data, total: data[0]?.total ?? 0 };
}

// Recuento de cada pestaña (vinos | bodegas) para la cabecera de resultados.
export async function contarResultados(
  filters: SearchFilters,
): Promise<{ vinos: number; bodegas: number }> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const client = createPublicClient();
  const one = { ...filters, pagina: 1 };
  const [vinos, bodegas] = await Promise.all([
    client.rpc("listar_vinos", { ...toListarVinosArgs(one, 1) }),
    client.rpc("listar_bodegas", { ...toListarBodegasArgs(one, 1) }),
  ]);
  if (vinos.error) throw new Error(`listar_vinos: ${vinos.error.message}`);
  if (bodegas.error) throw new Error(`listar_bodegas: ${bodegas.error.message}`);
  return { vinos: vinos.data[0]?.total ?? 0, bodegas: bodegas.data[0]?.total ?? 0 };
}

export async function getOpcionesFiltro(): Promise<FilterOption[]> {
  "use cache";
  cacheLife("catalogo");
  cacheTag(CATALOG_TAG);
  const { data, error } = await createPublicClient().rpc("opciones_filtro_vinos");
  if (error) throw new Error(`opciones_filtro_vinos: ${error.message}`);
  return data;
}

// ¿Hay algo en el catálogo? Para distinguir "sin resultados" de "catálogo vacío".
export async function catalogoVacio(): Promise<boolean> {
  "use cache";
  cacheLife("catalogo");
  cacheTag(CATALOG_TAG);
  const client = createPublicClient();
  const [vinos, bodegas] = await Promise.all([
    client.from("vinos").select("id", { count: "exact", head: true }),
    client.from("bodegas").select("id", { count: "exact", head: true }),
  ]);
  if (vinos.error) throw new Error(`catalogoVacio: ${vinos.error.message}`);
  if (bodegas.error) throw new Error(`catalogoVacio: ${bodegas.error.message}`);
  return (vinos.count ?? 0) + (bodegas.count ?? 0) === 0;
}

export async function buscarCatalogo(q: string, limite = 5): Promise<SearchSuggestion[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const { data, error } = await createPublicClient().rpc("buscar_catalogo", { q, limite });
  if (error) throw new Error(`buscar_catalogo: ${error.message}`);
  return data;
}
