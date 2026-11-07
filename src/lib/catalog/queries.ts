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
  SearchSuggestion,
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

export async function getVino(slug: string): Promise<VinoFicha | null> {
  "use cache";
  cacheLife("catalogo");
  cacheTag(CATALOG_TAG, `vino:${slug}`);
  if (!isValidSlug(slug)) return null;

  const { data, error } = await createPublicClient()
    .from("vinos")
    .select(
      `id, slug, nombre, tipo, crianza, descripcion, updated_at,
       bodega:bodegas!inner(slug, nombre, municipio, provincia),
       denominacion:denominaciones(slug, nombre, tipo),
       fuente:fuentes(nombre, url_base),
       imagenes(${IMAGE_FIELDS}),
       anadas(id, anio, grado, meses_crianza, notas_cata, maridaje, temp_servicio_min,
              temp_servicio_max, produccion_botellas, updated_at,
              anada_variedades(porcentaje, variedad:variedades_uva(slug, nombre, color)),
              imagenes(${IMAGE_FIELDS}))`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getVino(${slug}): ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    nombre: data.nombre,
    tipo: data.tipo,
    crianza: data.crianza,
    descripcion: data.descripcion,
    updated_at: data.updated_at,
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
        updated_at: a.updated_at,
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
       web, telefono, email, redes, anio_fundacion, hectareas, estado, updated_at,
       fuente:fuentes(nombre, url_base),
       bodega_denominaciones(principal, denominacion:denominaciones(slug, nombre, tipo)),
       imagenes(${IMAGE_FIELDS})`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getBodega(${slug}): ${error.message}`);
  if (!data) return null;

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
    web: data.web,
    telefono: data.telefono,
    email: data.email,
    redes: data.redes,
    anio_fundacion: data.anio_fundacion,
    hectareas: data.hectareas,
    estado: data.estado,
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
