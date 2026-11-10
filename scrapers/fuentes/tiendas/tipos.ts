// Tipos del scraper de tiendas parametrizado por plataforma (Ola B, docs/research/scraping-herramientas.md §2.6).

/**
 * Plataforma de la tienda: decide cómo se pagina y se lee el listado. La ficha se lee siempre
 * con el extractor de datos estructurados (JSON-LD + microdatos + tabla de atributos).
 * `vinatis`: PrestaShop a medida cuyo listado ya trae cada producto en JSON (sin pedir fichas).
 */
export type Plataforma = "magento" | "woocommerce" | "prestashop" | "vinatis";

/** Categoría de D.O. que se recorre (slug = `denominaciones.slug` del catálogo). */
export interface CategoriaTienda {
  denominacion: string;
  nombre: string;
  /** Ruta del listado, relativa a `base`. */
  ruta: string;
}

export interface ConfigTienda {
  /** Slug de `fuentes` y de `tiendas` (alias de la CLI: `tienda-<slug>`). */
  slug: string;
  /** Nombre visible (atribución de imágenes). */
  nombre: string;
  /** Origen, sin barra final («https://www.vinorea.com»). */
  base: string;
  plataforma: Plataforma;
  categorias: CategoriaTienda[];
  /** Parámetro de paginación del listado (PrestaShop: `p` en 1.6, `page` en 1.7). */
  paramPagina?: string;
  /** Selector CSS de la bodega en la ficha cuando los datos estructurados no la traen. */
  selectorBodega?: string;
  /** Tope de peticiones por ejecución (robots + listados + fichas). */
  maxPeticiones: number;
  /** Tope de páginas por categoría (protege de un paginador anómalo). */
  maxPaginas: number;
  /** Pausa entre peticiones al mismo host (≥ 10 s tras el bloqueo de Vinopremier). */
  pausaMs: { minMs: number; maxMs: number };
}

export interface TarjetaTienda {
  url: string;
  nombre: string;
}

export interface ListadoTienda {
  tarjetas: TarjetaTienda[];
  /** Fichas completas que ya trae el listado (Vinatis); vacío si hay que pedir cada ficha. */
  fichas: FichaTienda[];
  /** Mayor página enlazada o calculada. */
  maxPagina: number | null;
  total: number | null;
}

/** Hechos crudos de un producto, de la ficha o del listado. Solo datos; el texto libre no se guarda. */
export interface FichaTienda {
  url: string;
  nombre: string;
  sku: string | null;
  ean: string | null;
  precio: number | null;
  moneda: string | null;
  /** Valor de schema.org/ItemAvailability sin prefijo («InStock»). */
  disponibilidad: string | null;
  imagen: string | null;
  bodega: string | null;
  grupo: string[];
  /** «Tinto», «TINTO», «Blanco»… */
  tipoTexto: string | null;
  /** «D.O. Ribera del Duero», «Rioja DOCa»… */
  denominacionTexto: string | null;
  /** «100% Tempranillo», «Tempranillo, Garnacha». */
  uvasTexto: string | null;
  anio: number | null;
  formatoMl: number | null;
  grado: number | null;
  /** «16-18°C». */
  temperaturaTexto: string | null;
  /** Texto plano de la descripción: solo para extraer cifras; nunca se almacena. */
  descripcion: string;
}
