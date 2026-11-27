// Adaptador por sitio (ola D, docs/research/scraping-herramientas.md §4): un extractor elegido por
// dominio en vez de por plataforma, con la misma puerta legal delante. Declarativo primero: rutas
// del catálogo y selectores de la ficha. Nunca pide nada fuera de `ctx.pedir` (presupuesto, robots
// y parada ante 401/403/429 del rastreador).
import type { cargar } from "../html.ts";
import type { VinoWeb } from "../extraer.ts";

/** Marca → bodega dueña, para dominios que comparte un grupo (Sierra Cantabria, Paganos, Teso la Monja). */
export interface Marca {
  /** Se prueba contra el nombre del vino y contra la URL de su ficha. */
  patron: RegExp;
  /** Nombre de la bodega dueña de la marca, tal como está (o estaría) en `bodegas.nombre`. */
  bodega: string;
}

/**
 * Lo que devuelve `extraerVino`: campos que mandan sobre los del genérico. `denominacion`: D.O. que la
 * ficha da sin la sigla («100% verdejo de Rueda»), escrita como la detecta el genérico («D.O. Rueda»).
 */
export type ParcialVino = Partial<VinoWeb> & { bodega?: string | null; denominacion?: string };

/** Lo que recibe `extraerVino`: la ficha ya descargada. */
export interface FichaAdaptador {
  $: ReturnType<typeof cargar>;
  url: string;
  /** Texto del contenedor de la ficha (o de la página, sin `selectores.contenido`). */
  texto: string;
  /** Lo que saca el extractor genérico de esa ficha (para corregir o completar campos). */
  vino: VinoWeb;
}

export interface AdaptadorSitio {
  /** Dominios registrables a los que aplica (sin www). */
  dominios: string[];
  /** Sube al cambiar selectores o rutas; se guarda en `registros_fuente.datos.adaptador`. */
  version: number;
  /**
   * «completa»: el adaptador descubre sus fichas y después corre el extractor de la plataforma
   * (historia, enoturismo, tienda). «reemplaza»: solo el adaptador (y, si no da fichas, el genérico).
   */
  modo: "completa" | "reemplaza";
  /** Por qué existe, qué falla en el genérico, fecha y quién lo revisó. */
  notas: string;
  /** URL de inicio cuando la raíz redirige sin HTTP (meta refresh, frameset, JS). La puerta se pasa en su host. */
  portada?: string;
  rutas?: {
    /** Sitemaps con las fichas (rutas o URLs absolutas del sitio). */
    sitemaps?: string[];
    /** Páginas que enlazan a las fichas. */
    listados?: string[];
    /** Qué URL es una ficha de vino. Con él, el resto de páginas «vino» del sitio no dan vinos. */
    patronFicha?: RegExp;
    /** URLs que nunca son fichas (otros idiomas, cajas, legales). */
    excluir?: RegExp;
    /** URL canónica de una ficha enlazada con rutas relativas encadenadas (null = no es ficha). */
    canonica?: (url: string) => string | null;
    /** Tope de fichas por ejecución (por defecto 150). */
    maxFichas?: number;
  };
  /** Selectores CSS (cheerio) aplicados a las fichas (URLs que casan `patronFicha`). */
  selectores?: {
    /**
     * Varias fichas en una página (pestañas, acordeón, bloques de la portada): cada elemento es un
     * vino, con su propio texto; `nombre` e `imagen` se buscan dentro de cada uno. La página puede
     * ser la portada (`patronFicha` que casa la raíz): sigue contando como historia de la bodega.
     */
    fichas?: string;
    /** Contenedor(es) de la ficha: su texto sustituye al de `<main>`. */
    contenido?: string;
    /** Nombre del vino (si el h1 es el de la bodega o «Tienda online»). */
    nombre?: string;
    /** Elementos a quitar antes de leer (menús de «otros vinos», premios, carruseles). */
    quitar?: string;
    /** Imagen de la botella (`src`, `data-src` o el `background-image` de su `style`). */
    imagen?: string;
    /** Precio en euros de la ficha (si no hay JSON-LD `Offer`): «36.00€», «12,50 €». */
    precio?: string;
    /** Texto con el formato de venta («Caja de 6 botellas de 75 cl.»): unidades y ml de la oferta. */
    formato?: string;
  };
  /** Marcadores de ficha técnica mínimos en una ficha (por defecto 2, como el genérico). */
  evidenciasMin?: number;
  /** WooCommerce: lee también el HTML de la ficha (la Store API trae una descripción pobre). */
  fichaHtmlWoo?: boolean;
  /** Dominio compartido por varias bodegas: cada vino va a la bodega de su marca o a revisión. */
  marcas?: Marca[];
  /**
   * Solo si lo declarativo no basta: campos que corrigen lo que saca el genérico de la ficha.
   * `bodega`: dueña del vino según la ficha (migas, categoría) en tiendas que venden vinos de
   * otras bodegas del grupo; se trata como una marca (la del sitio se asigna, el resto a revisión).
   */
  extraerVino?: (ficha: FichaAdaptador) => ParcialVino | null;
  /** Renderizado con navegador: no se usa en esta ola (siempre false). */
  renderizar?: false;
  /** Vinos mínimos esperados: si da menos, aviso «adaptador roto» en el resumen del sitio. */
  minimoVinos?: number;
}
