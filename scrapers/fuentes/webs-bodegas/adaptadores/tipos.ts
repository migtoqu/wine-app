// Adaptador por sitio (ola D, docs/research/scraping-herramientas.md §4): un extractor elegido por
// dominio en vez de por plataforma, con la misma puerta legal delante. Declarativo primero: rutas
// del catálogo y selectores de la ficha. Nunca pide nada fuera de `ctx.pedir` (presupuesto, robots
// y parada ante 401/403/429 del rastreador).
import type { cargar } from "../html.ts";
import type { VinoWeb } from "../extraer.ts";

/** Marca → bodega dueña, para dominios que comparte un grupo (Sierra Cantabria, Paganos, Teso la Monja). */
export interface Marca {
  patron: RegExp;
  /** Nombre de la bodega dueña de la marca, tal como está (o estaría) en `bodegas.nombre`. */
  bodega: string;
}

/** Lo que recibe `extraerVino`: la ficha ya descargada. */
export interface FichaAdaptador {
  $: ReturnType<typeof cargar>;
  url: string;
  /** Texto del contenedor de la ficha (o de la página, sin `selectores.contenido`). */
  texto: string;
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
    /** Tope de fichas por ejecución (por defecto 150). */
    maxFichas?: number;
  };
  /** Selectores CSS (cheerio) aplicados a las fichas (URLs que casan `patronFicha`). */
  selectores?: {
    /** Contenedor(es) de la ficha: su texto sustituye al de `<main>`. */
    contenido?: string;
    /** Nombre del vino (si el h1 es el de la bodega o «Tienda online»). */
    nombre?: string;
    /** Elementos a quitar antes de leer (menús de «otros vinos», premios, carruseles). */
    quitar?: string;
    /** Imagen de la botella. */
    imagen?: string;
  };
  /** Marcadores de ficha técnica mínimos en una ficha (por defecto 2, como el genérico). */
  evidenciasMin?: number;
  /** WooCommerce: lee también el HTML de la ficha (la Store API trae una descripción pobre). */
  fichaHtmlWoo?: boolean;
  /** Dominio compartido por varias bodegas: cada vino va a la bodega de su marca o a revisión. */
  marcas?: Marca[];
  /** Solo si lo declarativo no basta: campos que corrigen lo que saca el genérico de la ficha. */
  extraerVino?: (ficha: FichaAdaptador) => Partial<VinoWeb> | null;
  /** Renderizado con navegador: no se usa en esta ola (siempre false). */
  renderizar?: false;
  /** Vinos mínimos esperados: si da menos, aviso «adaptador roto» en el resumen del sitio. */
  minimoVinos?: number;
}
