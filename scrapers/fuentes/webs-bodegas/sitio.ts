// Rastreo de un sitio: puerta legal → huella → descubrimiento (extractor por
// plataforma) → páginas clasificadas → hechos de bodega, vinos y servicios.
// Sin BD: el resultado lo guarda guardar.ts o va al JSON del dry-run.
import { dominioWeb } from "../../lib/contacto.ts";
import { ClienteHttp, ErrorHttp, ParadaFuente, type Respuesta } from "../../lib/http.ts";
import type { Log } from "../../lib/log.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { claveTexto, limpiarEspacios } from "../../lib/texto.ts";
import { similitud } from "../../lib/trigram.ts";
import { claveNombreBodega } from "../../lib/texto.ts";
import { clasificar, esOtroIdioma, huella, type Clase, type Huella } from "./clasificar.ts";
import { detectarDenominacion, type DeteccionDo, type ResolutorDenominaciones } from "./denominacion.ts";
import { formatoMl, ofertaDeJsonLd, ofertaDeWoo, unidades, type OfertaWeb } from "./ofertas.ts";
import { adaptadorPara } from "./adaptadores/index.ts";
import { productoDeShopify, type ProductoShopify } from "./shopify.ts";
import { dominioBase } from "./dominio.ts";
import type { AdaptadorSitio } from "./adaptadores/tipos.ts";
import { candidatasDePagina, elegirImagenBodega, imagenBotella, type CandidataImagen, type ImagenElegida } from "./imagen.ts";
import {
  bodegaVacia,
  ES_SERVICIO,
  esNombreDeVino,
  extraerBodega,
  nombreVino,
  extraerServicio,
  extraerVino,
  secciones,
  type HechosBodegaWeb,
  type ServicioWeb,
  type VinoWeb,
} from "./extraer.ts";
import {
  bloques,
  bloquesDeContenedor,
  bloquesDeFragmento,
  cargar,
  decodificarEntidades,
  enlaces,
  h1,
  idiomaDeTexto,
  jsonLd,
  limpiarTitulo,
  TITULO_GENERICO,
  metaRobots,
  migas,
  textoDe,
  tiposJsonLd,
  titulo,
  xRobotsTag,
  type Bloque,
  type Enlace,
} from "./html.ts";
import {
  buscarClausulas,
  contentSignal,
  detectarAntiBot,
  enlacesAvisoLegal,
  evaluarSenales,
  exclusionDe,
  permitidoManual,
  type Exclusiones,
  type MotivoSalto,
  type ResultadoPuerta,
} from "./puerta.ts";

export interface BodegaEntrada {
  /** null en dry-run con URLs sueltas. */
  id: string | null;
  nombre: string;
  municipio: string | null;
}

export interface EntradaSitio {
  dominio: string;
  /** URL de `bodegas.web` (la primera si varias bodegas comparten dominio). */
  url: string;
  bodegas: BodegaEntrada[];
  /** Web candidata para una bodega sin `web` (fase B): hay que verificar que la portada la nombra. */
  candidata?: { origen: "email" | "registro"; detalle: string };
}

/** Resultado de comprobar que la portada de una web candidata nombra a la bodega. */
export interface Verificacion {
  estado: "verificada" | "dudosa" | "no_verificada";
  puntuacion: number;
  /** Texto de la portada que mejor casa (título, og:site_name, h1 u Organization). */
  texto: string | null;
}

export interface PaginaVista {
  url: string;
  clase: Clase;
  origen: "html" | "wp" | "woo" | "shopify";
  titulo: string | null;
  /** lastmod del sitemap o `modified` de WordPress (para el rastreo incremental). */
  modificada?: string | null;
  /** Cuándo se leyó la página por última vez (ISO). */
  vista?: string | null;
  /** La página dio al menos una oferta con precio (ficha de la tienda). */
  oferta?: boolean;
}

/** Lo que se recuerda de una página de la visita anterior (rastreo incremental). */
export interface PaginaPrevia {
  modificada: string;
  vista: string | null;
  oferta: boolean;
}

/** Una ficha con oferta se vuelve a leer como mucho cada 7 días aunque no cambie (precio y stock). */
export const DIAS_REFRESCO_OFERTA = 7;

export interface VinoSitio extends VinoWeb {
  url: string;
  /** D.O. que dice la ficha, su categoría o su ruta (null = la ficha no dice nada). */
  denominacion: DeteccionDo | null;
  /** Imagen de la botella (enlazada). */
  imagen: ImagenElegida | null;
  /** Precio, formato, disponibilidad y EAN en la tienda de la bodega (uno por formato o ficha). */
  ofertas: OfertaWeb[];
  /**
   * Dominio de un grupo (adaptador con `marcas`): «propia» = marca de la bodega del sitio; «otra» =
   * de otra bodega del grupo; «dudosa» = sin marca reconocida. Las dos últimas van a revisión.
   */
  bodega_marca?: { estado: "propia" | "otra" | "dudosa"; bodega: string | null };
}

export interface ServicioSitio extends ServicioWeb {
  url: string;
}

export interface BodegaSitio extends HechosBodegaWeb {
  enoturismo: boolean;
  enoturismo_web: string | null;
  enoturismo_email: string | null;
  enoturismo_telefono: string | null;
  redes: Record<string, string>;
  /** URL de la página de la que sale cada hecho (atribución y auditoría). */
  urls: Partial<Record<keyof HechosBodegaWeb, string>>;
}

export interface ResultadoSitio {
  entrada: EntradaSitio;
  puerta: ResultadoPuerta;
  huella: Huella | null;
  /** Extractor usado («wordpress», «wordpress+woocommerce», «sitemap», «generico»…). */
  extractor: string | null;
  /** Adaptador por sitio usado (ola D). */
  adaptador: { dominio: string; version: number } | null;
  paginas: PaginaVista[];
  bodega: BodegaSitio | null;
  vinos: VinoSitio[];
  servicios: ServicioSitio[];
  /** Foto de la bodega o del viñedo (enlazada). */
  imagen: ImagenElegida | null;
  /** Páginas que no han cambiado desde la última visita: no se piden y sus registros siguen valiendo. */
  sinCambios: string[];
  /** Hosts del sitio usados (dominio principal y subdominios como tienda. o enoturismo.). */
  hosts: string[];
  /** Solo para webs candidatas (bodegas sin `web`). */
  verificacion: Verificacion | null;
  peticiones: number;
  segundos: number;
  avisos: string[];
}

export interface OpcionesSitio {
  log: Log;
  exclusiones: Exclusiones;
  /** Municipios conocidos (lista cerrada para «viñedos en …»). */
  municipios: string[];
  /** Peticiones de contenido por sitio (sin contar portada, robots y aviso legal). */
  maxPeticiones?: number;
  /** Tope al que sube el presupuesto en sitios con catálogo (más fichas de vino que presupuesto). */
  maxPeticionesCatalogo?: number;
  /** Para la D.O. de cada vino. */
  denominaciones?: ResolutorDenominaciones;
  /** URL normalizada → fecha de modificación vista la última vez (rastreo incremental). */
  previas?: (dominio: string) => Map<string, PaginaPrevia>;
  ahora?: () => Date;
  /** false = sin adaptadores por sitio (solo el genérico; para comparar en dry-run). */
  adaptadores?: boolean;
  /** Para tests: registro de adaptadores propio. */
  adaptadorPara?: (dominio: string) => AdaptadorSitio | null;
}

class PresupuestoAgotado extends Error {}
/** Subdominio del sitio que bloquea o muestra anti-bot: se deja ese host. */
class HostBloqueado extends Error {}

/** Contenido de una página lista para extraer. */
interface Contenido {
  url: string;
  clase: Clase;
  origen: PaginaVista["origen"];
  titulo: string;
  bloques: Bloque[];
  enlaces: Enlace[];
  /** Ficha de producto de la Store API de WooCommerce (o de `/products.json` de Shopify, en su forma). */
  producto?: ProductoWoo;
  gtin?: string | null;
  /** Migas o categorías de la tienda (para la D.O.). */
  categorias?: string[];
  /** Imágenes candidatas (historia y portada) e imagen del producto (fichas de vino). */
  imagenes?: CandidataImagen[];
  imagenProducto?: { url: string; alt: string | null } | null;
  /** Oferta del JSON-LD `Product.offers` de la ficha. */
  oferta?: OfertaWeb | null;
  modificada?: string | null;
  /** Página «vino» que no es ficha según el adaptador (listado): se siguen sus enlaces, no da vinos. */
  soloEnlaces?: boolean;
  /** Ficha de un adaptador: no se divide como listado y usa su umbral de evidencias. */
  fichaAdaptador?: { evidenciasMin: number; parcial: (Partial<VinoWeb> & { bodega?: string | null }) | null };
  /** `selectores.fichas` de un adaptador: un vino por elemento de la página (en cualquier clase). */
  fichasAdaptador?: FichaEnPagina[];
}

interface FichaEnPagina {
  titulo: string;
  bloques: Bloque[];
  imagen: { url: string; alt: string | null } | null;
  parcial: (Partial<VinoWeb> & { bodega?: string | null }) | null;
}

interface ProductoWoo {
  id: number;
  name: string;
  permalink: string;
  description?: string;
  short_description?: string;
  categories?: { name: string; slug: string }[];
  attributes?: { name: string; terms?: { name: string }[] }[];
  prices?: { price?: string; regular_price?: string; sale_price?: string; currency_code?: string; currency_minor_unit?: number; price_range?: { min_amount?: string; max_amount?: string } | null };
  images?: { src?: string; alt?: string }[];
  sku?: string;
  is_in_stock?: boolean;
}

const MAX_POR_CLASE: Record<Clase, number> = { vino: 150, historia: 4, enoturismo: 12, contacto: 1, legal: 0, otra: 0 };
const MAX_SERVICIOS = 20;
/** Subdominios del mismo dominio que suelen tener la tienda o las reservas. */
const SUBDOMINIO_UTIL = /^(tienda|shop|store|enoturismo|visitas|reservas|booking|wine|vinos|experiencias|turismo)\./i;
const PRIORIDAD_CLASE: Clase[] = ["vino", "historia", "enoturismo", "contacto"];
const TIPOS_WP_IGNORADOS = /^(attachment|nav_menu_item|wp_|post$|jp_|elementor|e-landing|oembed|revision|customize|user_request|wpcf7|acf|br_|et_|ct_|fl-|mc4wp|product_variation|shop_)/;
const SUBSITEMAP_UTIL = /page|product|vino|wine|visita|experienc|enoturismo|portfolio|project|anada|pagina/i;
const SUBSITEMAP_INUTIL = /category|tag|author|attachment|post-sitemap|user|product_cat|product_tag|format|archive|news|noticia|blog/i;
const TITULO_NO_VINO = /^(?:d\.?\s?o\.?\s|denominaci[óo]n|gama\b|l[íi]nea\b|colecci[óo]n\b|bodegas?\b|grupo\b|castilla[ -]la[ -]mancha$|¿)|^(nota de cata|notas de cata|ficha t[ée]cnica|elaboraci[óo]n|vi[ñn]edos?|maridaje|vista|nariz|boca|crianza en barrica|variedad(es)?|descargar|premios|puntuaciones|comprar|añadas?|otros vinos|nuestros vinos|vinos?|wines?|tinto|blanco|rosado|caracter[ií]sticas|gastronom[ií]a|el vi[ñn]edo)$/i;
const CATEGORIA_NO_VINO = /gourmet|alimentaci[oó]n|delicatessen|merchandising|regalos?|packs?|lotes?|accesorios|aceites?|conservas|queso|otras bodegas|vinos de otras|otros vinos|importaci[oó]n|internacional|del mundo|champagne|oporto|porto|destilados|licores/i;
const RUTA_NOTICIA = /\/(noticias?\d*|news|blogs?|magazine|revista|historias|articulos?|actualidad|prensa|press|tag|category|categoria|author|[\w-]*en-los-medios|medios|premios-y-[\w-]+)(?:[\/._?-]|$)|\/(19|20)\d\d\/\d\d\/|[?&](add-to-cart|orderby|filter_|share|replytocom|add_to_wishlist)=|\/page\/\d+\/?$/i;
const RUTA_NO_VINO = /\/(destilados?|licores|aguardientes|aceites?|gourmet|merchandising|visitas?|visitar[\w-]*|enoturismo|experiencias?)(?:[\/._?-]|$)/i;
const RUTA_PRIVADA = /\/(wp-login|wp-admin|login|mi-cuenta|my-account|cuenta|account|carrito|cart|checkout|finalizar-compra)(?:[\/.?]|$)/i;
const PROTEGIDA = /class=["'][^"']*post-password-form|<title>[^<]*(protegid[oa] con contraseña|password protected)/i;
const LISTADO = /^(?:nuestros?\s+)?(?:vinos|wines|productos|gama|nuestra gama|tienda|shop|elaboraci[óo]n)$/i;
/** Página que lista varios vinos (se divide por encabezados); una ficha no se divide. */
function esListado(url: string, tituloPagina: string): boolean {
  const ultimo = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  // «nuestrosVinos.asp?sec=6» es una ficha aunque comparta ruta con el listado.
  const conQuery = [...new URL(url).searchParams.keys()].some((k) => !/^(lang|idioma|l)$/i.test(k));
  return (!conQuery && /^(?:nuestros?-?)?(?:vinos|wines|productos|gama|tienda|shop)(?:\.(?:asp|php|html?))?$/i.test(ultimo)) || LISTADO.test(tituloPagina.trim());
}

/** Producto de un catálogo de tienda (Store API de Woo o `/products.json` de Shopify), no una página HTML. */
const deTienda = (c: { origen: PaginaVista["origen"] }) => c.origen === "woo" || c.origen === "shopify";

const TITULO_PAGINA_GENERICO = TITULO_GENERICO;
/** Título: el de la API de WordPress, el `Product` del JSON-LD, og:title, h1 o <title>. */
function elegirTitulo(preferido: string | undefined, nodos: Record<string, unknown>[], $: ReturnType<typeof cargar>): string {
  const producto = nodos.find((n) => n["@type"] === "Product");
  const og = $('meta[property="og:title"]').attr("content");
  const candidatos = [preferido, typeof producto?.name === "string" ? producto.name : null, h1($), og ? limpiarTitulo(og) : null, titulo($)];
  for (const c of candidatos) {
    const t = c ? limpiarTitulo(decodificarEntidades(c)) : "";
    if (t.length >= 3 && !TITULO_PAGINA_GENERICO.test(t)) return t;
  }
  return limpiarTitulo(candidatos.find(Boolean) ?? "");
}

const REDES: [string, RegExp][] = [
  ["instagram", /instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/)[^/?#]+/i],
  ["facebook", /facebook\.com\/(?!sharer|share\.php|dialog|plugins|tr\b)[^?#]+/i],
  ["x", /(?:twitter|x)\.com\/(?!intent|share|home)[^/?#]+/i],
  ["youtube", /youtube\.com\/(?:@|c\/|channel\/|user\/)[^?#]+/i],
  ["tiktok", /tiktok\.com\/@[^/?#]+/i],
  ["linkedin", /linkedin\.com\/company\/[^/?#]+/i],
];

export class RastreadorSitio {
  private nuevoHttp: () => ClienteHttp;
  private http!: ClienteHttp;
  private o: OpcionesSitio;
  /** Peticiones de todos los sitios rastreados. */
  peticiones = 0;

  /** `nuevoHttp`: un cliente por sitio (cuenta sus peticiones) que comparte el limitador por host. */
  constructor(nuevoHttp: () => ClienteHttp, opciones: OpcionesSitio) {
    this.nuevoHttp = nuevoHttp;
    this.o = opciones;
  }

  async rastrear(entrada: EntradaSitio): Promise<ResultadoSitio> {
    // Una instancia por sitio: el rastreo de varios sitios en paralelo no comparte estado.
    const yo = Object.create(this) as RastreadorSitio;
    yo.http = this.nuevoHttp();
    const r = await yo.rastrearCon(entrada);
    this.peticiones += r.peticiones;
    return r;
  }

  private async rastrearCon(entrada: EntradaSitio): Promise<ResultadoSitio> {
    const inicio = Date.now();
    const peticionesAntes = this.http.peticiones;
    const ahora = (this.o.ahora ?? (() => new Date()))();
    const r: ResultadoSitio = {
      entrada,
      puerta: puertaInicial(entrada, ahora),
      huella: null,
      extractor: null,
      adaptador: null,
      paginas: [],
      bodega: null,
      vinos: [],
      servicios: [],
      imagen: null,
      sinCambios: [],
      hosts: [],
      verificacion: null,
      peticiones: 0,
      segundos: 0,
      avisos: [],
    };
    try {
      await this.ejecutar(entrada, r, ahora);
    } catch (e) {
      // Un 403/429 a mitad del rastreo detiene el sitio: no se insiste ni se guarda nada de él.
      if (e instanceof ParadaFuente) saltar(r.puerta, "bloqueo_http", e.message);
      else if (r.puerta.apta) {
        saltar(r.puerta, "inaccesible", (e as Error).message);
        this.o.log.debug(`${entrada.dominio}: ${(e as Error).stack ?? e}`);
      }
      r.paginas = [];
      r.bodega = null;
      r.vinos = [];
      r.servicios = [];
      r.imagen = null;
    }
    r.peticiones = this.http.peticiones - peticionesAntes;
    r.segundos = Math.round((Date.now() - inicio) / 1000);
    return r;
  }

  private async ejecutar(entrada: EntradaSitio, r: ResultadoSitio, ahora: Date) {
    const p = r.puerta;
    const ex = exclusionDe(this.o.exclusiones, entrada.dominio);
    if (ex) return saltar(p, "exclusion_manual", `${ex.motivo} (${ex.fecha})`);

    const buscar = this.o.adaptadorPara ?? adaptadorPara;
    let ad = this.o.adaptadores === false ? null : buscar(entrada.dominio);
    // 1. Portada (la única petición que puede seguir una redirección a otro dominio). Un adaptador
    // puede dar otra URL de inicio cuando la raíz redirige sin HTTP (meta refresh, frameset, JS).
    let portada: Respuesta;
    try {
      portada = await this.http.get(ad?.portada ?? entrada.url, { permitirOtroHost: true });
    } catch (e) {
      return saltar(p, ...motivoError(e));
    }
    const origen = new URL(portada.url).origin;
    const host = new URL(origen).host;
    p.host = host;
    const dominioFinal = dominioWeb(origen);
    if (dominioFinal !== entrada.dominio) p.redirigida_desde = entrada.dominio;
    // 2. El host final pasa la puerta completa: exclusión, robots (ya comprobado por get), señales, aviso legal.
    if (dominioFinal && dominioFinal !== entrada.dominio) {
      const ex2 = exclusionDe(this.o.exclusiones, dominioFinal);
      if (ex2) return saltar(p, "exclusion_manual", `${dominioFinal}: ${ex2.motivo}`);
      if (!ad && this.o.adaptadores !== false) ad = buscar(dominioFinal);
    }
    // Un adaptador nunca renderiza en esta ola: si alguno lo pidiera, se ignora y se avisa.
    if (ad?.renderizar) r.avisos.push("El adaptador pide navegador: no se renderiza (ola D)");
    const antiBot = detectarAntiBot(portada.texto);
    if (antiBot) return saltar(p, "anti_bot", antiBot);
    const tipo = portada.cabeceras?.get("content-type") ?? "text/html";
    if (!/html/i.test(tipo)) return saltar(p, "sin_html", tipo);

    const robotsTxt = await this.http.textoRobots(origen);
    p.robots.status = robotsTxt ? "ok" : "sin_robots";
    p.robots.content_signal = contentSignal(robotsTxt);
    const $home = cargar(portada.texto);
    const directivasHome = [...metaRobots($home), ...xRobotsTag(portada.cabeceras?.get("x-robots-tag"))];
    const senales = evaluarSenales(p.robots.content_signal, directivasHome);
    p.senales_ia = senales.ia;
    if (senales.bloquea) return saltar(p, "content_signal", "Content-Signal: search=no");

    // Web candidata de una bodega sin `web`: la portada tiene que nombrarla antes de seguir.
    if (entrada.candidata) {
      r.verificacion = verificarNombre($home, host, entrada.bodegas[0]?.nombre ?? "");
      if (r.verificacion.estado === "no_verificada") return saltar(p, "no_verificada", `la portada no nombra a «${entrada.bodegas[0]?.nombre}»`);
    }

    const baseHome = baseDe($home, portada.url);
    const enlacesHome = enlaces($home, baseHome);
    const sigueHome = !directivasHome.includes("nofollow") && !directivasHome.includes("none");
    // 3. Aviso legal.
    const legales = enlacesAvisoLegal(enlacesHome, host);
    if (legales.length === 0) legales.push(new URL("/aviso-legal/", origen).href);
    p.aviso_legal = { url: null, coincidencias: [], fragmento: null };
    for (const url of legales) {
      try {
        const res = await this.http.get(url);
        const texto = textoDe(bloques(cargar(res.texto)));
        if (texto.length < 300) continue;
        p.aviso_legal.url ??= res.url;
        const c = buscarClausulas(texto);
        if (c.coincidencias.length) {
          p.aviso_legal = { url: res.url, ...c };
          if (!permitidoManual(this.o.exclusiones, entrada.dominio)) {
            return saltar(p, "clausula_legal", `«${c.fragmento}» (${res.url})`);
          }
          r.avisos.push(`Cláusula en el aviso legal ignorada por la lista de permitidos: ${c.coincidencias.join(", ")}`);
        }
      } catch (e) {
        if (e instanceof ParadaFuente) return saltar(p, "bloqueo_http", (e as Error).message);
        this.o.log.debug(`${url}: ${(e as Error).message}`);
      }
    }

    // 4. Huella y descubrimiento.
    r.huella = huella(portada.texto, origen, portada.cabeceras);
    const base = dominioBase(host);
    const esDelSitio = (h: string) => h === host || h === base || h.endsWith(`.${base}`);
    const base0 = this.o.maxPeticiones ?? 40;
    const presupuesto = { quedan: base0, ampliado: false };
    const contenidos: Contenido[] = [];
    const indexable = !directivasHome.includes("noindex") && !directivasHome.includes("none");
    if (indexable) {
      contenidos.push({
        url: portada.url, clase: "historia", origen: "html", titulo: titulo($home) ?? "",
        bloques: bloques($home), enlaces: enlacesHome, imagenes: candidatasDePagina($home, baseHome),
      });
    }
    const ctx = this.contexto(origen, presupuesto, r, esDelSitio, entrada.dominio, ad);
    const extractor = EXTRACTORES[r.huella.plataforma];
    if (ad) r.adaptador = { dominio: ad.dominios[0]!, version: ad.version };
    try {
      const usados: string[] = [];
      let fichas = 0;
      if (ad) {
        r.extractor = `adaptador:${ad.dominios[0]}@v${ad.version}`;
        fichas = await descubrirAdaptador(ctx, contenidos, sigueHome ? enlacesHome : []);
        usados.push(r.extractor);
      }
      // «reemplaza» solo corre la plataforma si el adaptador no encontró fichas (cae al genérico).
      if (!ad || ad.modo === "completa" || fichas === 0) {
        if (ad && ad.modo === "reemplaza") r.avisos.push(`Adaptador sin fichas: se usa el extractor genérico`);
        usados.push(await extractor.descubrir(ctx, contenidos, sigueHome ? enlacesHome : []));
      }
      r.extractor = usados.join("+");
      if (ad?.fichaHtmlWoo) await fichasHtmlWoo(ctx, contenidos);
      // Subdominios del propio dominio enlazados desde la portada (tienda., enoturismo.): mismo trato.
      const subs = subdominiosEnlazados(sigueHome ? enlacesHome : [], host, esDelSitio).slice(0, 2);
      for (const sub of subs) {
        const usado = await descubrirSubdominio(ctx, sub, contenidos);
        if (usado) r.extractor += `+${new URL(sub).host}`;
      }
      await profundidad2(ctx, contenidos);
    } catch (e) {
      if (!(e instanceof PresupuestoAgotado)) throw e;
      r.extractor ??= r.huella.plataforma;
      r.avisos.push(`Presupuesto de ${presupuesto.ampliado ? this.o.maxPeticionesCatalogo ?? 120 : base0} peticiones agotado: se extrae lo descubierto`);
    }
    // Versión inglesa publicada sin prefijo de idioma (/los-vinos-3/sheet-x/): fuera por su texto. La
    // portada no se descarta (puede ser bilingüe) ni los productos de la Store API (idioma de la tienda).
    const enIngles = contenidos.filter((c) => !deTienda(c) && !isRaiz(c.url) && idiomaDeTexto(textoDe(c.bloques)) === "en");
    if (enIngles.length) {
      r.avisos.push(`${enIngles.length} páginas en inglés sin prefijo de idioma, descartadas (p. ej. ${enIngles[0]!.url})`);
      for (const c of enIngles) contenidos.splice(contenidos.indexOf(c), 1);
    }
    r.hosts = [...new Set([host, ...contenidos.map((c) => new URL(c.url).host)])];
    const vistaEn = ahora.toISOString();

    // 5. Hechos.
    r.bodega = this.hechosBodega(contenidos, enlacesHome);
    r.vinos = this.vinos(contenidos, ahora.getFullYear(), esDelSitio, ad);
    // Dueña de cada vino en dominios o tiendas de un grupo: por la ficha (extraerVino) o por marca.
    if (ad) for (const v of r.vinos) if (ad.marcas || v.bodega_marca) v.bodega_marca = bodegaDeMarca(v.nombre, ad, entrada, v.url, v.bodega_marca?.bodega);
    if (ad && r.vinos.length < (ad.minimoVinos ?? 1)) {
      r.avisos.push(`Adaptador ${ad.dominios[0]}@v${ad.version} por debajo de lo esperado (${r.vinos.length} vinos < ${ad.minimoVinos ?? 1}): revisar selectores`);
    }
    const conOferta = new Set(r.vinos.flatMap((v) => v.ofertas.filter((o) => o.precio != null).map((o) => normalizarUrl(o.url))));
    r.paginas = contenidos.map((c) => ({
      url: c.url, clase: c.clase, origen: c.origen, titulo: c.titulo || null, modificada: c.modificada ?? null, vista: vistaEn,
      oferta: conOferta.has(normalizarUrl(c.url)),
    }));
    r.servicios = this.servicios(contenidos, host, entrada.dominio);
    // Foto de la bodega: páginas de historia, luego las de enoturismo y la portada al final.
    const rangoFoto = (c: Contenido) => (isRaiz(c.url) ? 2 : c.clase === "historia" ? 0 : 1);
    const paginasFoto = contenidos
      .filter((c) => (c.clase === "historia" || c.clase === "enoturismo") && c.imagenes?.length)
      .sort((a, c) => rangoFoto(a) - rangoFoto(c))
      .map((c) => ({ url: c.url, candidatas: c.imagenes! }));
    r.imagen = elegirImagenBodega(paginasFoto, esDelSitio);
    if (r.imagen && !(await this.robotsPermite(r.imagen.url, esDelSitio))) r.imagen = null;
    for (const v of r.vinos) if (v.imagen && !(await this.robotsPermite(v.imagen.url, esDelSitio))) v.imagen = null;
    const eno = contenidos.find((c) => c.clase === "enoturismo" && !deTienda(c)) ?? contenidos.find((c) => c.clase === "enoturismo");
    if (eno || r.servicios.length) {
      r.bodega.enoturismo = true;
      r.bodega.enoturismo_web = eno?.url ?? r.servicios[0]!.url;
      r.bodega.enoturismo_email = r.servicios.find((s) => s.email)?.email ?? null;
      r.bodega.enoturismo_telefono = r.servicios.find((s) => s.telefono)?.telefono ?? null;
    }
  }

  /** Las imágenes de hosts del sitio deben estar permitidas por su robots.txt (ya descargado). */
  private async robotsPermite(url: string, esDelSitio: (h: string) => boolean): Promise<boolean> {
    if (!esDelSitio(new URL(url).host)) return true; // CDN de la plataforma: su robots no aplica a la web
    try {
      await this.http.comprobarRobots(url);
      return true;
    } catch {
      return false;
    }
  }

  private contexto(
    origen: string,
    presupuesto: { quedan: number; ampliado: boolean },
    r: ResultadoSitio,
    esDelSitio: (h: string) => boolean,
    dominio: string,
    adaptador: AdaptadorSitio | null = null,
  ): ContextoDescubrimiento {
    const hostPrincipal = new URL(origen).host;
    const bloqueados = new Set<string>();
    const tope = this.o.maxPeticionesCatalogo ?? 120;
    const base = this.o.maxPeticiones ?? 40;
    return {
      origen,
      adaptador,
      huella: r.huella!,
      log: this.o.log,
      avisos: r.avisos,
      esDelSitio,
      previas: this.o.previas?.(dominio) ?? new Map(),
      ahora: (this.o.ahora ?? (() => new Date()))(),
      sinCambios: r.sinCambios,
      pedir: async (url: string) => {
        const h = new URL(url).host;
        if (bloqueados.has(h)) throw new HostBloqueado(h);
        if (presupuesto.quedan <= 0) throw new PresupuestoAgotado();
        presupuesto.quedan--;
        try {
          const res = await this.http.get(url);
          // Un subdominio con desafío anti-bot se deja (el sitio principal ya pasó la puerta).
          if (h !== hostPrincipal && detectarAntiBot(res.texto)) {
            bloqueados.add(h);
            r.avisos.push(`${h}: desafío anti-bot; se deja ese subdominio`);
            throw new HostBloqueado(h);
          }
          return res;
        } catch (e) {
          // 403/429 en un subdominio: se deja ese host sin insistir; en el principal, se para el sitio.
          if (e instanceof ParadaFuente && h !== hostPrincipal) {
            bloqueados.add(h);
            r.avisos.push(`${h}: HTTP ${e.status}; se deja ese subdominio`);
            throw new HostBloqueado(h);
          }
          throw e;
        }
      },
      textoRobots: (o = origen) => this.http.textoRobots(o),
      quedan: () => presupuesto.quedan,
      ampliar: (candidatosVino: number) => {
        // Sitio con catálogo: más fichas de vino que presupuesto → se amplía una vez hasta el tope.
        if (presupuesto.ampliado || candidatosVino <= presupuesto.quedan) return;
        presupuesto.ampliado = true;
        presupuesto.quedan += Math.max(0, tope - base);
      },
    };
  }

  private hechosBodega(contenidos: Contenido[], enlacesHome: Enlace[]): BodegaSitio {
    const b: BodegaSitio = {
      ...bodegaVacia(), enoturismo: false, enoturismo_web: null, enoturismo_email: null, enoturismo_telefono: null,
      redes: redes(enlacesHome), urls: {},
    };
    // Páginas de historia primero y la portada al final (respaldo).
    const historia = contenidos.filter((c) => c.clase === "historia").sort((a, c) => Number(isRaiz(a.url)) - Number(isRaiz(c.url)));
    for (const c of historia) {
      const h = extraerBodega(textoDe(c.bloques), { municipios: this.o.municipios, esHistoria: !isRaiz(c.url) });
      for (const k of Object.keys(h) as (keyof HechosBodegaWeb)[]) {
        const v = h[k];
        const vacio = b[k] == null || (Array.isArray(b[k]) && (b[k] as unknown[]).length === 0);
        const tiene = v != null && !(Array.isArray(v) && v.length === 0);
        if (vacio && tiene) {
          (b as unknown as Record<string, unknown>)[k] = v;
          b.urls[k] = c.url;
        }
      }
    }
    return b;
  }

  private vinos(contenidos: Contenido[], hoy: number, esDelSitio: (h: string) => boolean, ad: AdaptadorSitio | null = null): VinoSitio[] {
    const r = this.o.denominaciones;
    const conDo = (v: VinoWeb, c: Contenido, url: string, texto: string, imagen: ImagenElegida | null, ofertas: OfertaWeb[] = []): VinoSitio => ({
      ...v,
      url,
      ofertas,
      denominacion: r ? detectarDenominacion({ titulo: v.nombre === c.titulo ? c.titulo : `${c.titulo}\n${v.nombre}`, texto, categorias: c.categorias, url }, r) : null,
      imagen,
    });
    const out = new Map<string, VinoSitio>();
    const meter = (v: VinoSitio) => {
      if (!v.nombre || v.nombre.length < 2 || v.nombre.length > 80 || !esNombreDeVino(v.nombre) || TITULO_NO_VINO.test(v.nombre)) return;
      // Noticias, blog, destilados y visitas nunca son la ficha de un vino, las descubra quien las descubra.
      if (RUTA_NOTICIA.test(v.url) || RUTA_NO_VINO.test(v.url)) return;
      const k = `${claveTexto(v.nombre)}|${v.anio ?? ""}`;
      const previo = out.get(k);
      // Mismo vino en otro formato (mágnum, caja) o en dos fichas: se queda la ficha con más datos y
      // se juntan sus ofertas.
      const ofertas = [...(previo?.ofertas ?? []), ...v.ofertas].filter((o, i, a) => a.findIndex((x) => x.url === o.url) === i);
      if (!previo || v.evidencias > previo.evidencias) out.set(k, { ...v, ofertas, imagen: v.imagen ?? previo?.imagen ?? null });
      else previo.ofertas = ofertas;
    };
    // Varias fichas en una página (adaptador con `selectores.fichas`): un vino por elemento.
    for (const c of contenidos.filter((x) => x.fichasAdaptador)) {
      const min = c.fichaAdaptador?.evidenciasMin ?? 2;
      for (const f of c.fichasAdaptador!) {
        const texto = textoDe(f.bloques);
        const { bodega: dueña, ...parcial } = f.parcial ?? {};
        const v: VinoWeb & { bodega_marca?: VinoSitio["bodega_marca"] } = { ...extraerVino(f.titulo, texto, { hoy }), ...parcial };
        if (dueña !== undefined) v.bodega_marca = { estado: "dudosa", bodega: dueña };
        if (v.evidencias >= min) meter(conDo(v, { ...c, titulo: f.titulo }, c.url, texto, imagenBotella(f.imagen?.url, f.imagen?.alt ?? null, c.url, esDelSitio)));
      }
    }
    // Con `patronFicha`, solo sus fichas dan vinos, vengan del HTML, de la API REST o de la tienda.
    const esFicha = (c: Contenido) => !ad?.rutas?.patronFicha || esFichaAdaptador(ad, c.url);
    for (const c of contenidos.filter((x) => x.clase === "vino" && !x.soloEnlaces && !x.fichasAdaptador && esFicha(x))) {
      if (c.producto) {
        const p = c.producto;
        // Con `fichaHtmlWoo` el texto de la ficha HTML se suma al de la Store API.
        const texto = [textoDe(bloquesDeFragmento(`${p.short_description ?? ""}\n${p.description ?? ""}`)), textoDe(c.bloques)].filter(Boolean).join("\n");
        const atributos = Object.fromEntries((p.attributes ?? []).map((a) => [a.name, (a.terms ?? []).map((t) => t.name).join(", ")]));
        const { bodega: dueña, ...parcial } = c.fichaAdaptador?.parcial ?? {};
        const v: VinoWeb & { bodega_marca?: VinoSitio["bodega_marca"] } = { ...extraerVino(decodificarEntidades(p.name), texto, { atributos, hoy, gtin: c.gtin ?? null }), ...parcial };
        if (dueña !== undefined) v.bodega_marca = { estado: "dudosa", bodega: dueña };
        const categoriaVino = (p.categories ?? []).some((x) => /vino|wine|tinto|blanco|rosado/i.test(x.name));
        const img = p.images?.[0];
        const atribTexto = Object.entries(atributos).map(([k, x]) => `${k}: ${x}`).join("\n");
        if (v.evidencias >= 1 || categoriaVino || (c.fichaAdaptador && v.evidencias >= c.fichaAdaptador.evidenciasMin)) {
          const oferta = ofertaDeWoo(p, v.ean);
          meter(conDo(v, c, p.permalink, `${texto}\n${atribTexto}`, imagenBotella(img?.src, img?.alt || null, p.permalink, esDelSitio), oferta ? [oferta] : []));
        }
        continue;
      }
      const texto = textoDe(c.bloques);
      if (c.fichaAdaptador) {
        // Ficha de un adaptador: una página = un vino, con su umbral de evidencias.
        const { bodega: dueña, ...parcial } = c.fichaAdaptador.parcial ?? {};
        const v: VinoWeb & { bodega_marca?: VinoSitio["bodega_marca"] } = { ...extraerVino(c.titulo, texto, { hoy, gtin: c.gtin ?? null }), ...parcial };
        if (dueña !== undefined) v.bodega_marca = { estado: "dudosa", bodega: dueña };
        if (v.evidencias >= c.fichaAdaptador.evidenciasMin && !TITULO_NO_VINO.test(v.nombre)) {
          const oferta = c.oferta ? { ...c.oferta, ean: c.oferta.ean ?? v.ean } : null;
          meter(conDo(v, c, c.url, texto, imagenBotella(c.imagenProducto?.url, c.imagenProducto?.alt ?? null, c.url, esDelSitio), oferta ? [oferta] : []));
        }
        continue;
      }
      const secs = secciones(c.bloques).filter((s) => !TITULO_NO_VINO.test(s.titulo.trim()) && esNombreDeVino(s.titulo));
      const vinosSecciones = secs.map((s) => extraerVino(s.titulo, s.texto, { hoy })).filter((v) => v.evidencias >= 2);
      // Página-listado con varias fichas: un vino por sección. Si no, la página es una ficha.
      if (vinosSecciones.length >= 2 && esListado(c.url, c.titulo)) {
        const textoDe2 = new Map(secs.map((s) => [s.titulo, s.texto]));
        for (const v of vinosSecciones) meter(conDo(v, c, c.url, textoDe2.get(secs.find((s) => nombreDeSeccion(s.titulo) === v.nombre)?.titulo ?? "") ?? "", null));
        continue;
      }
      // La portada nunca es la ficha de un vino para el genérico: su título es el de la web o el de
      // la plantilla («Laon Wine House», «Tienda de Vinos …»). Solo un adaptador saca vinos de ella.
      if (isRaiz(c.url)) continue;
      const v = extraerVino(c.titulo, texto, { hoy, gtin: c.gtin ?? null });
      if (v.evidencias >= 2 && !TITULO_NO_VINO.test(v.nombre) && !esListado(c.url, c.titulo)) {
        const oferta = c.oferta ? { ...c.oferta, ean: c.oferta.ean ?? v.ean } : null;
        meter(conDo(v, c, c.url, texto, imagenBotella(c.imagenProducto?.url, c.imagenProducto?.alt ?? null, c.url, esDelSitio), oferta ? [oferta] : []));
      }
    }
    return [...out.values()];
  }

  private servicios(contenidos: Contenido[], host: string, dominio: string): ServicioSitio[] {
    const out = new Map<string, ServicioSitio>();
    const meter = (s: ServicioSitio) => {
      const k = `${s.tipo}|${claveTexto(s.titulo)}`;
      if (!out.has(k) && out.size < MAX_SERVICIOS) out.set(k, s);
    };
    for (const c of contenidos.filter((x) => x.clase === "enoturismo")) {
      if (c.producto) {
        const p = c.producto;
        const texto = textoDe(bloquesDeFragmento(`${p.short_description ?? ""}\n${p.description ?? ""}`));
        const s = extraerServicio(decodificarEntidades(p.name), texto, [], host, dominio);
        const precio = p.prices?.price ? Number(p.prices.price) / 10 ** (p.prices.currency_minor_unit ?? 2) : null;
        meter({ ...s, precio_desde: precio != null && precio >= 0 && precio <= 1000 ? precio : s.precio_desde, url_reserva: p.permalink, url: p.permalink });
        continue;
      }
      const secs = secciones(c.bloques).filter((s) => ES_SERVICIO.test(s.titulo) || /\d\s*€|€\s*\d/.test(s.texto));
      if (secs.length >= 2) {
        for (const s of secs) meter({ ...extraerServicio(s.titulo, s.texto, c.enlaces, host, dominio), url: c.url });
      } else {
        meter({ ...extraerServicio(c.titulo, textoDe(c.bloques), c.enlaces, host, dominio), url: c.url });
      }
    }
    return [...out.values()];
  }
}

// ---------------------------------------------------------------------------
// Descubrimiento por plataforma (punto de extensión)
// ---------------------------------------------------------------------------

export interface ContextoDescubrimiento {
  origen: string;
  /** Adaptador del sitio (ola D), si lo hay. */
  adaptador: AdaptadorSitio | null;
  huella: Huella;
  log: Log;
  avisos: string[];
  /** Host principal, el dominio base o un subdominio suyo (tienda., enoturismo.). */
  esDelSitio(host: string): boolean;
  /** URL normalizada → modificación, lectura y oferta de la visita anterior. */
  previas: Map<string, PaginaPrevia>;
  /** Momento del rastreo (para la caducidad de las ofertas). */
  ahora: Date;
  /** Aquí se anotan las URLs que no se piden por no haber cambiado. */
  sinCambios: string[];
  /** GET que descuenta del presupuesto de páginas del sitio (lanza al agotarlo). */
  pedir(url: string): Promise<Respuesta>;
  textoRobots(origen?: string): Promise<string | null>;
  quedan(): number;
  /** Amplía el presupuesto una vez si hay más fichas de vino que peticiones. */
  ampliar(candidatosVino: number): void;
}

/** Un extractor añade a `contenidos` las páginas que descubre y devuelve su nombre. */
export interface Extractor {
  descubrir(ctx: ContextoDescubrimiento, contenidos: Contenido[], enlacesHome: Enlace[]): Promise<string>;
}

const wordpress: Extractor = {
  async descubrir(ctx, contenidos, enlacesHome) {
    const usados: string[] = [];
    let woo = false;
    if (ctx.huella.woocommerce) woo = await tiendaWoo(ctx, contenidos);
    if (woo) usados.push("woocommerce");
    const api = await wpRest(ctx, contenidos, woo);
    if (api) usados.unshift("wordpress");
    // Sitemap y enlaces siempre que quede presupuesto: cubren tipos que la API no lista y webs sin API.
    if (ctx.quedan() > 3) usados.push(await sitemapYEnlaces(ctx, contenidos, enlacesHome));
    return usados.join("+") || "wordpress";
  },
};

const generico: Extractor = {
  async descubrir(ctx, contenidos, enlacesHome) {
    return sitemapYEnlaces(ctx, contenidos, enlacesHome);
  },
};

// Shopify (10 webs a 2026-11): el catálogo público `/products.json` trae todo lo de la ficha (texto,
// tipo, etiquetas, variantes con precio y stock, EAN e imagen); el resto (historia, visitas,
// contacto) sigue por sitemap + HTML, sin volver a pedir las fichas `/products/…`.
const shopify: Extractor = {
  async descubrir(ctx, contenidos, enlacesHome) {
    const n = await catalogoShopify(ctx, contenidos);
    const resto = ctx.quedan() > 3 ? `+${await sitemapYEnlaces(ctx, contenidos, enlacesHome)}` : "";
    return `${n > 0 ? "shopify" : "shopify(sin catálogo)"}${resto}`;
  },
};

// Wix (4 webs): el HTML viene renderizado en servidor; su sitemap índice trae
// `store-products-sitemap.xml` y `pages-sitemap.xml`, y cada ficha de producto lleva JSON-LD
// `Product`. No se usa la API interna `/_api/` (no es pública).
const wix: Extractor = {
  async descubrir(ctx, contenidos, enlacesHome) {
    return `wix→${await sitemapYEnlaces(ctx, contenidos, enlacesHome)}`;
  },
};

export const EXTRACTORES: Record<Huella["plataforma"], Extractor> = {
  wordpress,
  generico,
  shopify,
  wix,
};

async function pedirJson<T>(ctx: ContextoDescubrimiento, url: string): Promise<{ datos: T; res: Respuesta } | null> {
  try {
    const res = await ctx.pedir(url);
    const t = res.texto.trimStart();
    if (!t.startsWith("{") && !t.startsWith("[")) return null;
    return { datos: JSON.parse(t) as T, res };
  } catch (e) {
    // Un 403 en la API REST es una restricción de la API (plugins de seguridad), no un bloqueo
    // de nuestro UA: se deja la API y se sigue por HTML. Un 429 sí detiene el sitio.
    if (e instanceof ParadaFuente && e.status === 403 && /\/wp-json\//.test(url)) {
      ctx.avisos.push(`API REST cerrada (HTTP 403): ${new URL(url).pathname}`);
      return null;
    }
    if (e instanceof HostBloqueado) return null;
    if (e instanceof PresupuestoAgotado || e instanceof ParadaFuente) throw e;
    ctx.log.debug(`${url}: ${(e as Error).message}`);
    return null;
  }
}

/** Store API de WooCommerce: vinos y experiencias con atributos y precio en una petición. */
async function tiendaWoo(ctx: ContextoDescubrimiento, contenidos: Contenido[]): Promise<boolean> {
  const productos: ProductoWoo[] = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const r = await pedirJson<ProductoWoo[]>(ctx, new URL(`/wp-json/wc/store/v1/products?per_page=100&page=${pagina}`, ctx.origen).href);
    if (!r || !Array.isArray(r.datos)) break;
    productos.push(...r.datos);
    const total = Number(r.res.cabeceras?.get("x-wp-totalpages") ?? 1);
    if (pagina >= total) break;
  }
  if (productos.length === 0) return false;
  for (const p of productos) {
    if (!p.permalink || esOtroIdioma(p.permalink) || ctx.adaptador?.rutas?.excluir?.test(p.permalink)) continue;
    try {
      if (!ctx.esDelSitio(new URL(p.permalink, ctx.origen).host)) continue;
    } catch {
      continue;
    }
    const nombre = decodificarEntidades(p.name ?? "");
    const cats = (p.categories ?? []).map((c) => c.name).join(" ");
    const servicio = ES_SERVICIO.test(nombre) || /visita|experienc|enoturismo|cata/i.test(cats);
    const clase: Clase = servicio ? "enoturismo" : "vino";
    // Reventa de otras bodegas («Otros vinos», «Oporto») o productos que no son vino: fuera.
    if (clase === "vino" && (!esNombreDeVino(nombre) || CATEGORIA_NO_VINO.test(cats) && (!/vino|wine/i.test(cats) || /otras bodegas|vinos de otras|otros vinos|importaci|internacional|del mundo/i.test(cats)))) continue;
    contenidos.push({
      url: p.permalink, clase, origen: "woo", titulo: nombre, bloques: [], enlaces: [], producto: p,
      categorias: (p.categories ?? []).map((c) => decodificarEntidades(c.name)),
    });
  }
  return true;
}

/**
 * `/products.json` de Shopify, en castellano si la portada está en otro idioma y la tienda tiene
 * `/es/`. Devuelve cuántos productos trae el catálogo.
 */
async function catalogoShopify(ctx: ContextoDescubrimiento, contenidos: Contenido[]): Promise<number> {
  const raiz = new URL("/", ctx.origen).href;
  // Portada en `/es/` (la versión castellana de una tienda en catalán) o en otro idioma: primero `/es/`.
  const portada = contenidos.find((c) => c.origen === "html" && c.clase === "historia")?.url;
  const enEs = !!portada && /^\/es(?:-[a-z]{2})?(?:\/|$)/i.test(new URL(portada).pathname);
  const bases = enEs || (ctx.huella.idioma && !/^es\b/i.test(ctx.huella.idioma)) ? [new URL("/es/", ctx.origen).href, raiz] : [raiz];
  let productos: ProductoShopify[] = [];
  let base = raiz;
  for (const b of bases) {
    productos = [];
    for (let pagina = 1; pagina <= 8; pagina++) {
      const r = await pedirJson<{ products?: ProductoShopify[] }>(ctx, new URL(`products.json?limit=250&page=${pagina}`, b).href);
      const lista = r?.datos?.products;
      if (!Array.isArray(lista) || lista.length === 0) break;
      productos.push(...lista);
      if (lista.length < 250) break;
    }
    base = b;
    if (productos.length) break;
  }
  // Fichas que ya leyó el adaptador del sitio (misma URL): manda el adaptador.
  const ya = new Set(contenidos.map((c) => normalizarUrl(c.url)));
  let n = 0;
  for (const p of productos) {
    const m = productoDeShopify(p, base);
    if (!m || ctx.adaptador?.rutas?.excluir?.test(m.producto.permalink) || ya.has(normalizarUrl(m.producto.permalink))) continue;
    contenidos.push({
      url: m.producto.permalink, clase: m.clase, origen: "shopify", titulo: m.producto.name, bloques: [], enlaces: [],
      producto: m.producto, gtin: m.gtin, categorias: m.categorias,
    });
    n++;
  }
  if (productos.length) ctx.log.info(`${new URL("products.json", base).href}: ${productos.length} productos, ${n} nuevos útiles`);
  return productos.length;
}

interface TipoWp {
  slug: string;
  rest_base?: string;
  rest_namespace?: string;
}

interface ItemWp {
  id: number;
  link: string;
  slug?: string;
  type?: string;
  title?: { rendered?: string };
  content?: { rendered?: string; protected?: boolean };
  modified?: string;
}

/** API REST de WordPress: páginas y tipos personalizados, clasificados por enlace y título. */
async function wpRest(ctx: ContextoDescubrimiento, contenidos: Contenido[], conWoo: boolean): Promise<boolean> {
  const base = ctx.huella.wpJson ?? new URL("/wp-json/", ctx.origen).href;
  const tipos = await pedirJson<Record<string, TipoWp>>(ctx, `${base.replace(/\/$/, "")}/wp/v2/types`);
  if (!tipos || typeof tipos.datos !== "object" || Array.isArray(tipos.datos)) return false;
  const utiles = Object.values(tipos.datos).filter(
    (t) => t && t.rest_base && (t.rest_namespace ?? "wp/v2") === "wp/v2" && !TIPOS_WP_IGNORADOS.test(t.slug) && !(conWoo && t.slug === "product"),
  );
  // Primero las páginas, después los tipos de vino/visitas y el resto.
  utiles.sort((a, b) => peso(a.slug) - peso(b.slug));
  const candidatos: { item: ItemWp; clase: Clase; tipo: TipoWp }[] = [];
  for (const t of utiles.slice(0, 6)) {
    const items: ItemWp[] = [];
    for (let pagina = 1; pagina <= 3; pagina++) {
      const lista = await pedirJson<ItemWp[]>(ctx, `${base.replace(/\/$/, "")}/wp/v2/${t.rest_base}?per_page=100&page=${pagina}&_fields=id,link,slug,type,title,modified`);
      if (!lista || !Array.isArray(lista.datos)) break;
      items.push(...lista.datos);
      if (pagina >= Number(lista.res.cabeceras?.get("x-wp-totalpages") ?? 1)) break;
    }
    for (const item of items) {
      // Enlaces relativos y páginas que apuntan a otro sitio (tienda o reservas de un tercero): fuera.
      try {
        item.link = new URL(item.link, ctx.origen).href;
      } catch {
        continue;
      }
      if (!ctx.esDelSitio(new URL(item.link).host) || RUTA_NOTICIA.test(item.link)) continue;
      if (!item.link || esOtroIdioma(item.link)) continue;
      const tituloItem = decodificarEntidades(item.title?.rendered ?? "");
      const clase = clasificar({ url: item.link, titulo: tituloItem, tipoWp: t.slug === "page" ? null : t.slug });
      if (MAX_POR_CLASE[clase] > 0 && !isRaiz(item.link)) candidatos.push({ item, clase, tipo: t });
    }
  }
  if (candidatos.length === 0) return true;
  ctx.ampliar(candidatos.filter((c) => c.clase === "vino").length);
  const elegidos = sinCambiar(ctx, elegir(candidatos.map((c) => ({ ...c, url: c.item.link, modificada: c.item.modified ?? null })), contenidos));
  // Contenido en bloque por tipo (?include=…): una petición por tipo en vez de una por página.
  const porTipo = new Map<TipoWp, typeof elegidos>();
  for (const e of elegidos) porTipo.set(e.tipo, [...(porTipo.get(e.tipo) ?? []), e]);
  for (const [t, lista] of porTipo) {
    const ids = lista.map((e) => e.item.id).join(",");
    const r = await pedirJson<ItemWp[]>(ctx, `${base.replace(/\/$/, "")}/wp/v2/${t.rest_base}?include=${ids}&per_page=100&_fields=id,link,title,content`);
    const porId = new Map((r?.datos ?? []).map((i) => [i.id, i]));
    for (const e of lista) {
      const item = porId.get(e.item.id);
      if (item?.content?.protected) {
        ctx.avisos.push(`Página protegida con contraseña (no se lee): ${e.item.link}`);
        continue;
      }
      const html = item?.content?.rendered ?? "";
      const bs = bloquesDeFragmento(html);
      const tituloItem = decodificarEntidades(e.item.title?.rendered ?? "");
      // Constructores que no exponen el contenido por la API (o tipos sin editor): HTML de la página.
      if (textoDe(bs).length < 200) {
        const c = await paginaHtml(ctx, e.item.link, e.clase, tituloItem);
        if (c) contenidos.push({ ...c, modificada: e.modificada });
        continue;
      }
      const $f = cargar(`<html><body><main>${html}</main></body></html>`);
      contenidos.push({
        url: e.item.link, clase: e.clase, origen: "wp", titulo: tituloItem, bloques: bs, enlaces: enlacesDeFragmento(html, e.item.link),
        imagenes: (e.clase === "historia" || e.clase === "enoturismo") ? candidatasDePagina($f, e.item.link) : undefined,
        imagenProducto: e.clase === "vino" ? primeraImagen($f, e.item.link) : undefined,
        modificada: e.modificada,
      });
    }
  }
  return true;
}

function peso(slug: string): number {
  if (slug === "page") return 0;
  if (/vino|wine|anada|product/.test(slug)) return 1;
  if (/visita|experien|enoturismo|tour/.test(slug)) return 2;
  return 3;
}

function enlacesDeFragmento(html: string, base: string): Enlace[] {
  return enlaces(cargar(`<html><body>${html}</body></html>`), base);
}

/** Elige, por clase y con tope, las URLs que aún no están en `contenidos`. */
function elegir<T extends { url: string; clase: Clase }>(candidatos: T[], contenidos: Contenido[]): T[] {
  const ya = new Set(contenidos.map((c) => normalizarUrl(c.url)));
  const out: T[] = [];
  for (const clase of PRIORIDAD_CLASE) {
    const deClase = contenidos.filter((c) => c.clase === clase).length;
    const lista = candidatos
      .filter((c) => c.clase === clase && !ya.has(normalizarUrl(c.url)))
      .sort((a, b) => prioridadUrl(a.url, clase) - prioridadUrl(b.url, clase));
    for (const c of lista.slice(0, Math.max(0, MAX_POR_CLASE[clase] - deClase))) {
      ya.add(normalizarUrl(c.url));
      out.push(c);
    }
  }
  return out;
}

/** Dentro de una clase, primero las URLs más típicas (historia, nuestros vinos/<vino>…). */
function prioridadUrl(url: string, clase: Clase): number {
  let ruta: string;
  try {
    ruta = new URL(url).pathname.toLowerCase();
  } catch {
    return 99;
  }
  const prof = ruta.split("/").filter(Boolean).length;
  if (clase === "historia") return /historia|nosotros|quienes|la-bodega|about|familia/.test(ruta) ? prof : 10 + prof;
  if (clase === "vino") return prof >= 2 ? 0 : 1; // fichas antes que listados
  return prof;
}

/** Clave de URL para no repetir páginas: sin #, sin / final y sin parámetros de seguimiento. */
export function normalizarUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|lang$)/i.test(k)) url.searchParams.delete(k);
    return (url.origin + url.pathname.replace(/\/$/, "") + url.search).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}
function isRaiz(u: string): boolean {
  try {
    return new URL(u).pathname.replace(/\/(?:es\/?)?$/, "") === "";
  } catch {
    return false;
  }
}

async function paginaHtml(ctx: ContextoDescubrimiento, url: string, clasePrevia?: Clase, tituloPreferido?: string): Promise<Contenido | null> {
  try {
    const res = await ctx.pedir(url);
    if (!/html/i.test(res.cabeceras?.get("content-type") ?? "text/html")) return null;
    // Nada tras login ni contraseña.
    if (RUTA_PRIVADA.test(new URL(res.url).pathname) || PROTEGIDA.test(res.texto)) {
      ctx.avisos.push(`Página protegida o tras login (no se lee): ${res.url}`);
      return null;
    }
    const $ = cargar(res.texto);
    const directivas = [...metaRobots($), ...xRobotsTag(res.cabeceras?.get("x-robots-tag"))];
    const nodos = jsonLd($);
    const tipos = tiposJsonLd(nodos);
    const ad = ctx.adaptador;
    const ficha = esFichaAdaptador(ad, res.url) || esFichaAdaptador(ad, url);
    const sel = ficha ? ad!.selectores ?? {} : {};
    if (sel.quitar) $(sel.quitar).remove();
    // Guiones blandos (U+00AD) que algunas tiendas meten en los nombres: fuera.
    const nodoNombre = sel.nombre ? $(sel.nombre).first() : null;
    nodoNombre?.find("br").replaceWith(" ");
    const nombreSel = nodoNombre ? limpiarEspacios(nodoNombre.text().replace(/\u00ad/g, "")) : "";
    const t = nombreSel.length >= 2 ? limpiarTitulo(nombreSel) : elegirTitulo(tituloPreferido, nodos, $);
    let clase = clasePrevia ?? clasificar({ url: res.url, titulo: titulo($), h1: h1($), migas: migas($, nodos), tiposJsonLd: tipos });
    // Con `patronFicha`, las fichas son vino aunque el genérico no lo vea, y el resto de páginas
    // «vino» (listados, legales bajo /vinos/) no dan vinos.
    if (ficha) clase = "vino";
    const soloEnlaces = !ficha && !!ad?.rutas?.patronFicha && clase === "vino";
    const sigue = !directivas.includes("nofollow") && !directivas.includes("none");
    // noindex: la página no se extrae (pero puede seguir sus enlaces si no es nofollow).
    const indexable = !directivas.includes("noindex") && !directivas.includes("none");
    const producto = nodos.find((n) => n["@type"] === "Product" || (Array.isArray(n["@type"]) && (n["@type"] as unknown[]).includes("Product")));
    const gtin = producto ? (["gtin13", "gtin", "gtin14", "gtin12", "gtin8"].map((k) => producto[k]).find((v) => typeof v === "string" || typeof v === "number") ?? null) : null;
    // JSON-LD Product en cualquier plataforma (PrestaShop, Magento, Wix, a medida): categoría e imagen.
    const categoriaLd = producto && typeof producto.category === "string" ? [producto.category] : [];
    const imagenLd = producto ? primeraUrl(producto.image) : null;
    // Contenedor de la ficha del adaptador: su texto en lugar del de <main>.
    const contenido = sel.contenido ? $(sel.contenido) : null;
    const bloquesFicha = contenido?.length
      ? bloquesDeContenedor(contenido.toArray().map((el) => $.html(el)).join("\n"))
      : null;
    const bs = indexable ? bloquesFicha ?? bloques($) : [];
    const imagenSel = sel.imagen ? $(sel.imagen).first() : null;
    const srcSel = imagenSel ? srcDe(imagenSel) : undefined;
    // <base href> (p. ej. «/es/»): las rutas relativas de enlaces e imágenes se resuelven contra él.
    const base = baseDe($, res.url);
    let parcial: (Partial<VinoWeb> & { bodega?: string | null }) | null = null;
    const fichasAdaptador = ficha && indexable && sel.fichas
      ? $(sel.fichas).toArray().map((el): FichaEnPagina => {
          const $el = $(el);
          const n = sel.nombre ? $el.find(sel.nombre).first() : null;
          n?.find("br").replaceWith(" ");
          const nombre = limpiarEspacios((n?.text() ?? "").replace(/\u00ad/g, ""));
          const img = sel.imagen ? $el.find(sel.imagen).first() : null;
          const src = img?.length ? srcDe(img) : undefined;
          const bs1 = bloquesDeContenedor($.html(el));
          const texto = textoDe(bs1);
          return {
            titulo: nombre,
            bloques: bs1,
            imagen: src ? urlImagen(src, base, img?.attr("alt")) : null,
            parcial: ad?.extraerVino ? ad.extraerVino({ $, url: res.url, texto, vino: extraerVino(nombre, texto, { hoy: ctx.ahora.getFullYear() }) }) : null,
          };
        }).filter((f) => f.titulo.length >= 2)
      : undefined;
    if (ficha && ad?.extraerVino && !fichasAdaptador) {
      const texto = textoDe(bs);
      parcial = ad.extraerVino({ $, url: res.url, texto, vino: extraerVino(t, texto, { hoy: ctx.ahora.getFullYear() }) });
    }
    return {
      url: res.url,
      clase: indexable ? clase : "otra",
      origen: "html",
      titulo: t,
      fichaAdaptador: ficha && indexable ? { evidenciasMin: ad!.evidenciasMin ?? 2, parcial } : undefined,
      fichasAdaptador: fichasAdaptador?.length ? fichasAdaptador : undefined,
      soloEnlaces: soloEnlaces || undefined,
      bloques: bs,
      enlaces: sigue ? enlaces($, base) : [],
      gtin: gtin == null ? null : String(gtin),
      categorias: [...categoriaLd, ...migas($, nodos)],
      imagenes: indexable && (clase === "historia" || clase === "enoturismo") ? candidatasDePagina($, base) : undefined,
      imagenProducto: clase === "vino"
        ? srcSel ? urlImagen(srcSel, base, imagenSel?.attr("alt")) : imagenLd ? { url: new URL(imagenLd, base).href, alt: null } : primeraImagen($, base)
        : undefined,
      oferta: producto && clase === "vino"
        ? ofertaDeJsonLd(producto, res.url, t, gtin == null ? null : String(gtin))
        : ficha && sel.precio ? ofertaDeSelector($, sel.precio, sel.formato, res.url, t) : null,
    };
  } catch (e) {
    if (e instanceof HostBloqueado) return null;
    if (e instanceof PresupuestoAgotado || e instanceof ParadaFuente) throw e;
    ctx.log.debug(`${url}: ${(e as Error).message}`);
    return null;
  }
}

/** Oferta de los selectores de precio y formato de un adaptador (fichas sin JSON-LD `Offer`). */
export function ofertaDeSelector($: ReturnType<typeof cargar>, selPrecio: string, selFormato: string | undefined, url: string, nombre: string): OfertaWeb | null {
  const t = limpiarEspacios($(selPrecio).first().text());
  const m = t.match(/(\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*€|€\s*(\d{1,4}(?:[.,]\d{1,2})?)|^(\d{1,4}(?:[.,]\d{1,2})?)$/);
  const bruto = m?.[1] ?? m?.[2] ?? m?.[3];
  if (!bruto) return null;
  // «1.250,00» y «36.00»: el último separador con dos cifras es el decimal.
  const precio = Number(bruto.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(precio) || precio <= 0 || precio > 20_000) return null;
  const formato = `${nombre} ${selFormato ? limpiarEspacios($(selFormato).first().text()) : ""}`;
  return {
    url, precio, precio_regular: null, moneda: "EUR", disponible: null, formato_ml: formatoMl(formato), unidades: unidades(formato),
    ean: null, sku: null, precio_max: null,
  };
}

/** URL contra la que se resuelven las rutas relativas de la página: su <base href> o la propia URL. */
export function baseDe($: ReturnType<typeof cargar>, url: string): string {
  const href = $("base[href]").first().attr("href")?.trim();
  if (!href) return url;
  try {
    return new URL(href, url).href;
  } catch {
    return url;
  }
}

/** URL de una imagen: atributos de carga diferida, `src` o el `background-image` de su `style`. */
function srcDe(img: ReturnType<ReturnType<typeof cargar>>): string | undefined {
  const fondo = img.attr("style")?.match(/background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1];
  return img.attr("data-large_image") ?? img.attr("data-src") ?? img.attr("src") ?? fondo;
}

function urlImagen(src: string, base: string, alt: string | undefined): { url: string; alt: string | null } | null {
  try {
    return { url: new URL(src, base).href, alt: alt?.trim() || null };
  } catch {
    return null;
  }
}

/** ¿Es una ficha de vino según el adaptador del sitio? */
function esFichaAdaptador(ad: AdaptadorSitio | null, url: string): boolean {
  const r = ad?.rutas;
  return !!r?.patronFicha && r.patronFicha.test(url) && !r.excluir?.test(url);
}

/**
 * Descubrimiento del adaptador: fichas de sus sitemaps, de sus listados y de la portada que casan
 * `patronFicha`. Devuelve cuántas fichas encontró (descargadas o sin cambios).
 */
async function descubrirAdaptador(ctx: ContextoDescubrimiento, contenidos: Contenido[], enlacesHome: Enlace[]): Promise<number> {
  const ad = ctx.adaptador!;
  const rutas = ad.rutas ?? {};
  // Clave normalizada → URL tal cual y lastmod del sitemap.
  const fichas = new Map<string, { url: string; lastmod: string | null }>();
  let vistas = 0;
  const abs = (u: string) => new URL(u, ctx.origen).href;
  const anotar = (u0: string, lastmod: string | null) => {
    const u = rutas.canonica ? rutas.canonica(u0) : u0;
    if (!u) return;
    const k = normalizarUrl(u);
    if (!fichas.has(k) && urlDelSitio(ctx, u) && esFichaAdaptador(ad, u)) fichas.set(k, { url: u, lastmod });
  };
  for (const sm of rutas.sitemaps ?? []) {
    const xml = await xmlDe(ctx, abs(sm));
    if (!xml) continue;
    for (const u of urlsDeSitemap(xml)) anotar(u.url, u.lastmod);
  }
  for (const l of rutas.listados ?? []) {
    const c = await paginaHtml(ctx, abs(l), "vino");
    if (!c) continue;
    for (const e of c.enlaces) anotar(e.url, null);
    // El listado se queda como página vista (y la profundidad 2 sigue sus enlaces), pero no da vinos.
    if (!esFichaAdaptador(ad, c.url)) contenidos.push({ ...c, clase: "vino", soloEnlaces: true });
  }
  for (const e of enlacesHome) anotar(e.url, null);
  // Fichas en la portada (o en otra página ya vista como historia): se lee otra vez con los
  // selectores del adaptador y sus vinos se añaden a esa página, que conserva su clase.
  if (ad.selectores?.fichas) {
    anotar(abs("/"), null);
    for (const [k, f] of fichas) {
      const previa = contenidos.find((c) => normalizarUrl(c.url) === k && !c.fichasAdaptador);
      if (!previa) continue;
      fichas.delete(k);
      const c = await paginaHtml(ctx, f.url, previa.clase);
      if (c?.fichasAdaptador) Object.assign(previa, { fichasAdaptador: c.fichasAdaptador, fichaAdaptador: c.fichaAdaptador });
      vistas += c?.fichasAdaptador ? 1 : 0;
    }
  }
  const ya = new Set(contenidos.map((c) => normalizarUrl(c.url)));
  const lista = [...fichas]
    .filter(([k]) => !ya.has(k))
    .map(([, f]) => ({ url: f.url, clase: "vino" as Clase, modificada: f.lastmod }))
    .slice(0, rutas.maxFichas ?? MAX_POR_CLASE.vino);
  ctx.ampliar(lista.length);
  const pendientes = sinCambiar(ctx, lista);
  for (const e of pendientes) {
    const c = await paginaHtml(ctx, e.url, "vino");
    if (c) contenidos.push({ ...c, modificada: e.modificada });
  }
  return lista.length + vistas;
}

/** `fichaHtmlWoo`: el HTML de cada producto de la Store API completa su texto (y la imagen y el JSON-LD). */
async function fichasHtmlWoo(ctx: ContextoDescubrimiento, contenidos: Contenido[]): Promise<void> {
  const productos = contenidos.filter((c) => c.producto && c.clase === "vino" && c.bloques.length === 0);
  ctx.ampliar(productos.length);
  for (const c of productos) {
    const h = await paginaHtml(ctx, c.url, "vino");
    if (!h) continue;
    c.bloques = h.bloques;
    c.fichaAdaptador = h.fichaAdaptador;
    c.gtin ??= h.gtin;
  }
}

/** Dueña de un vino por su marca en un dominio compartido por un grupo de bodegas. */
export function bodegaDeMarca(
  nombre: string, ad: AdaptadorSitio, entrada: EntradaSitio, url?: string, deLaFicha?: string | null,
): NonNullable<VinoSitio["bodega_marca"]> {
  const dueña = deLaFicha ?? ad.marcas?.find((x) => x.patron.test(nombre) || (!!url && x.patron.test(url)))?.bodega;
  if (!dueña) return { estado: "dudosa", bodega: null };
  const m = { bodega: dueña };
  const clave = claveNombreBodega(m.bodega);
  const propia = entrada.bodegas.some((b) => {
    const k = claveNombreBodega(b.nombre);
    return !!k && !!clave && (k === clave || similitud(k, clave) >= 0.8);
  });
  return { estado: propia ? "propia" : "otra", bodega: m.bodega };
}

/** Sitemap (robots → índices habituales) y enlaces de portada, clasificados y con tope por clase. */
async function sitemapYEnlaces(ctx: ContextoDescubrimiento, contenidos: Contenido[], enlacesHome: Enlace[]): Promise<string> {
  const urls = await sitemap(ctx);
  const candidatos: { url: string; clase: Clase; modificada: string | null }[] = [];
  const delSitio = (u: string) => urlDelSitio(ctx, u);
  for (const u of urls.filter((x) => delSitio(x.url))) candidatos.push({ url: u.url, clase: clasificar({ url: u.url }), modificada: u.lastmod });
  for (const e of enlacesHome.filter((x) => delSitio(x.url))) {
    candidatos.push({ url: e.url, clase: clasificar({ url: e.url, titulo: e.texto }), modificada: null });
  }
  // Con la Store API de Woo o `/products.json` el catálogo ya está completo: sus fichas no se vuelven
  // a pedir por HTML. En Shopify, tampoco las del idioma por defecto (`/products/x` frente a `/es/products/x`).
  const prefijosWoo = new Set(
    contenidos.filter(deTienda).map((c) => new URL(c.url).pathname.split("/").filter(Boolean).slice(0, -1).join("/")),
  );
  const conShopify = contenidos.some((c) => c.origen === "shopify");
  const deWoo = (u: string) => prefijosWoo.has(new URL(u).pathname.split("/").filter(Boolean).slice(0, -1).join("/")) ||
    (conShopify && /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\//i.test(new URL(u).pathname));
  // Fichas cuyo slug ya dice que no es un vino (estuche, sacacorchos, lote…): ni se piden.
  const slugNoVino = (u: string) => !esNombreDeVino(decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " "));
  const unicos = [...new Map(
    candidatos
      // Con el catálogo de Shopify, ninguna página HTML da vinos (colecciones, carrito, eventos).
      .filter((c) => MAX_POR_CLASE[c.clase] > 0 && !isRaiz(c.url) && !(c.clase === "vino" && (conShopify || deWoo(c.url) || slugNoVino(c.url))))
      .map((c) => [normalizarUrl(c.url), c]),
  ).values()];
  ctx.ampliar(unicos.filter((c) => c.clase === "vino").length);
  for (const e of sinCambiar(ctx, elegir(unicos, contenidos))) {
    const c = await paginaHtml(ctx, e.url, e.clase);
    if (c) contenidos.push({ ...c, modificada: e.modificada });
  }
  return urls.length ? "sitemap" : "enlaces";
}

function urlDelSitio(ctx: ContextoDescubrimiento, u: string): boolean {
  try {
    const url = new URL(u);
    return ctx.esDelSitio(url.host) && !esOtroIdioma(u) && !/\.(pdf|jpe?g|png|webp|gif|zip|docx?|xml)$/i.test(url.pathname) &&
      !RUTA_NOTICIA.test(u) && !RUTA_PRIVADA.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Profundidad 2: fichas de vino enlazadas desde los listados de vinos (de la API, del sitemap o del
 * HTML) y experiencias enlazadas desde la página de enoturismo.
 */
async function profundidad2(ctx: ContextoDescubrimiento, contenidos: Contenido[]): Promise<void> {
  const ya = new Set(contenidos.map((c) => normalizarUrl(c.url)));
  const candidatos: { url: string; clase: Clase }[] = [];
  for (const l of contenidos.filter((c) => (c.clase === "vino" || c.clase === "enoturismo") && c.enlaces.length && !c.producto)) {
    let prefijo = "";
    try {
      prefijo = new URL(l.url).pathname.replace(/\/$/, "");
    } catch {
      continue;
    }
    for (const e of l.enlaces) {
      if (!urlDelSitio(ctx, e.url) || ya.has(normalizarUrl(e.url)) || isRaiz(e.url)) continue;
      const ruta = new URL(e.url).pathname;
      const debajo = prefijo.length > 1 && ruta.startsWith(prefijo + "/");
      if (l.clase === "vino" && ctx.adaptador?.rutas?.patronFicha) {
        // Con adaptador: desde un listado solo se siguen sus fichas (en su forma canónica).
        const canonica = ctx.adaptador.rutas.canonica ? ctx.adaptador.rutas.canonica(e.url) : e.url;
        if (!canonica || !esFichaAdaptador(ctx.adaptador, canonica) || ya.has(normalizarUrl(canonica))) continue;
        candidatos.push({ url: canonica, clase: "vino" });
        ya.add(normalizarUrl(canonica));
        continue;
      }
      if (l.clase === "vino") {
        const pareceVino = /\b(tinto|blanco|rosado|clarete|crianza|reserva|roble|joven|vendimia|cosecha|verdejo|albillo)\b/i.test(e.texto) && e.texto.length <= 60;
        if (!(debajo || /\/(vinos?|wines?|productos?|producto|product)\//i.test(ruta) || pareceVino)) continue;
        if (!esNombreDeVino(decodeURIComponent(ruta.split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " ")) || !esNombreDeVino(e.texto)) continue;
        if (wooCubre(contenidos, e.url)) continue;
        candidatos.push({ url: e.url, clase: "vino" });
      } else {
        const pareceServicio = ES_SERVICIO.test(e.texto) && e.texto.length <= 80;
        if (!(debajo || pareceServicio || clasificar({ url: e.url, titulo: e.texto }) === "enoturismo")) continue;
        candidatos.push({ url: e.url, clase: "enoturismo" });
      }
      ya.add(normalizarUrl(e.url));
    }
  }
  ctx.ampliar(candidatos.filter((c) => c.clase === "vino").length + contenidos.filter((c) => c.clase === "vino").length);
  for (const e of elegir(candidatos, contenidos)) {
    const c = await paginaHtml(ctx, e.url, e.clase);
    if (c) contenidos.push(c);
  }
}

/** ¿Esta URL es una ficha de un catálogo que ya trajo la Store API de Woo? */
function wooCubre(contenidos: Contenido[], u: string): boolean {
  const carpeta = (x: string) => new URL(x).pathname.split("/").filter(Boolean).slice(0, -1).join("/");
  const c = carpeta(u);
  return c !== "" && contenidos.some((x) => deTienda(x) && carpeta(x.url) === c);
}

/** Subdominios del propio dominio enlazados desde la portada (tienda., enoturismo., shop.). */
function subdominiosEnlazados(lista: Enlace[], host: string, esDelSitio: (h: string) => boolean): string[] {
  const out = new Set<string>();
  for (const e of lista) {
    try {
      const u = new URL(e.url);
      if (u.host !== host && esDelSitio(u.host) && SUBDOMINIO_UTIL.test(u.host)) out.add(u.origin);
    } catch {
      /* enlace roto */
    }
  }
  return [...out];
}

/** Tienda Woo y sitemap de un subdominio del sitio; robots.txt, 403 y anti-bot por host (en `pedir`). */
async function descubrirSubdominio(ctx: ContextoDescubrimiento, origenSub: string, contenidos: Contenido[]): Promise<boolean> {
  const sub: ContextoDescubrimiento = { ...ctx, origen: origenSub, textoRobots: (o = origenSub) => ctx.textoRobots(o) };
  const antes = contenidos.length;
  const woo = await tiendaWoo(sub, contenidos);
  if (!woo && ctx.quedan() > 3) await sitemapYEnlaces(sub, contenidos, []);
  return contenidos.length > antes;
}

/**
 * Rastreo incremental: una página cuya fecha de modificación no ha cambiado desde la última visita
 * no se pide (sus registros siguen valiendo). Sin fecha, se pide siempre.
 */
function sinCambiar<T extends { url: string; modificada?: string | null }>(ctx: ContextoDescubrimiento, lista: T[]): T[] {
  return lista.filter((e) => {
    const previa = ctx.previas.get(normalizarUrl(e.url));
    // Una ficha de la tienda se relee cada DIAS_REFRESCO_OFERTA días aunque no cambie: el precio y
    // el stock no tocan el lastmod en muchas webs.
    const caducada = previa?.oferta && (!previa.vista || ctx.ahora.getTime() - Date.parse(previa.vista) > DIAS_REFRESCO_OFERTA * 86_400_000);
    if (e.modificada && previa && e.modificada <= previa.modificada && !caducada) {
      ctx.sinCambios.push(e.url);
      return false;
    }
    return true;
  });
}

async function sitemap(ctx: ContextoDescubrimiento): Promise<{ url: string; lastmod: string | null }[]> {
  const robots = (await ctx.textoRobots()) ?? "";
  const declarados = [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]!).filter((u) => hostDelSitio(ctx, u));
  const candidatos = declarados.length ? declarados.slice(0, 2) : ["/sitemap_index.xml", "/wp-sitemap.xml", "/sitemap.xml"].map((p) => new URL(p, ctx.origen).href);
  const urlsDe = urlsDeSitemap;
  for (const url of candidatos) {
    const xml = await xmlDe(ctx, url);
    if (!xml) continue;
    const subs = [...xml.matchAll(/<sitemap>\s*<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/gi)].map((m) => decodificarEntidades(m[1]!));
    if (subs.length === 0) return urlsDe(xml);
    const out: { url: string; lastmod: string | null }[] = [];
    // Primero los de producto o vino (el catálogo), después páginas y el resto útil.
    const catalogo = (x: string) => /product|vino|wine|anada|store/i.test(x);
    const utiles = subs.filter((x) => SUBSITEMAP_UTIL.test(x) && !SUBSITEMAP_INUTIL.test(x)).sort((a, b) => Number(!catalogo(a)) - Number(!catalogo(b)));
    for (const sm of utiles.slice(0, 6)) {
      const sub = await xmlDe(ctx, sm);
      if (sub) out.push(...urlsDe(sub));
    }
    return out;
  }
  return [];
}

function urlsDeSitemap(xml: string): { url: string; lastmod: string | null }[] {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].flatMap((m) => {
    const loc = m[1]!.match(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/i)?.[1];
    const lastmod = m[1]!.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)?.[1] ?? null;
    return loc ? [{ url: decodificarEntidades(loc), lastmod }] : [];
  });
}

function hostDelSitio(ctx: ContextoDescubrimiento, u: string): boolean {
  try {
    return ctx.esDelSitio(new URL(u).host);
  } catch {
    return false;
  }
}

async function xmlDe(ctx: ContextoDescubrimiento, url: string): Promise<string | null> {
  try {
    const res = await ctx.pedir(url);
    return /<(urlset|sitemapindex)\b/i.test(res.texto.slice(0, 2000)) ? res.texto : null;
  } catch (e) {
    if (e instanceof HostBloqueado) return null;
    if (e instanceof PresupuestoAgotado || e instanceof ParadaFuente) throw e;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export { dominioBase };

function primeraUrl(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return primeraUrl(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return typeof o.url === "string" ? o.url : typeof o.contentUrl === "string" ? o.contentUrl : null;
  }
  return null;
}

/** Primera imagen de producto plausible de una ficha de vino. */
function primeraImagen($: ReturnType<typeof cargar>, base: string): { url: string; alt: string | null } | null {
  const sel = $(".woocommerce-product-gallery img, .product img, .wp-post-image, main img, article img").first();
  const src = sel.attr("data-large_image") ?? sel.attr("data-src") ?? sel.attr("src") ?? $('meta[property="og:image"]').attr("content");
  if (!src) return null;
  try {
    return { url: new URL(src, base).href, alt: sel.attr("alt")?.trim() || null };
  } catch {
    return null;
  }
}

const nombreDeSeccion = (t: string) => nombreVino(t);

/**
 * ¿La portada nombra a la bodega? Clave de nombre contra <title>, og:site_name, h1 y
 * `Organization.name` (trigramas), o la clave contenida en el dominio.
 */
export function verificarNombre($: ReturnType<typeof cargar>, host: string, nombre: string): Verificacion {
  const clave = claveNombreBodega(nombre);
  if (!clave) return { estado: "no_verificada", puntuacion: 0, texto: null };
  const nodos = jsonLd($);
  const org = nodos.find((n) => n["@type"] === "Organization" || n["@type"] === "Winery" || n["@type"] === "LocalBusiness");
  const textos = [
    $("title").first().text(), $('meta[property="og:site_name"]').attr("content"), $("h1").first().text(),
    typeof org?.name === "string" ? org.name : null,
  ].filter((t): t is string => !!t && t.trim() !== "");
  let mejor: { puntuacion: number; texto: string | null } = { puntuacion: 0, texto: null };
  for (const t of textos) {
    for (const trozo of [t, ...t.split(/\s+[|–—·•»-]\s+/)]) {
      const k = claveNombreBodega(trozo);
      if (!k) continue;
      // Contenida en un sentido u otro («Pérez Pascuas» ⊂ «Hermanos Pérez Pascuas»), con al menos dos palabras.
      const contenida = ` ${k} `.includes(` ${clave} `) || (k.split(" ").length >= 2 && ` ${clave} `.includes(` ${k} `));
      const p = k === clave ? 1 : contenida ? 0.9 : similitud(clave, k);
      if (p > mejor.puntuacion) mejor = { puntuacion: Math.round(p * 1000) / 1000, texto: limpiarEspacios(trozo).slice(0, 120) };
    }
  }
  const compacta = clave.replace(/\s+/g, "");
  const enDominio = compacta.length >= 5 && host.replace(/[^a-z0-9]/gi, "").toLowerCase().includes(compacta);
  if (enDominio && mejor.puntuacion < 0.9) mejor = { puntuacion: 0.9, texto: host };
  const estado = mejor.puntuacion >= 0.8 ? "verificada" : mejor.puntuacion >= 0.5 ? "dudosa" : "no_verificada";
  return { estado, ...mejor };
}

function puertaInicial(entrada: EntradaSitio, ahora: Date): ResultadoPuerta {
  return {
    apta: true, motivo: null, detalle: null, fecha: ahora.toISOString(), host: new URL(entrada.url).host,
    redirigida_desde: null, robots: { status: "sin_robots", content_signal: null }, aviso_legal: null, senales_ia: [],
  };
}

function saltar(p: ResultadoPuerta, motivo: MotivoSalto, detalle: string | null) {
  p.apta = false;
  p.motivo = motivo;
  p.detalle = detalle ? limpiarEspacios(detalle).slice(0, 300) : null;
}

function motivoError(e: unknown): [MotivoSalto, string] {
  if (e instanceof ParadaFuente) return ["bloqueo_http", `HTTP ${e.status}`];
  if (e instanceof RobotsDenegado) return ["robots", e.message];
  if (e instanceof ErrorHttp) return [e.status === 401 || e.status === 403 ? "bloqueo_http" : "inaccesible", `HTTP ${e.status}`];
  return ["inaccesible", (e as Error).message];
}

function redes(lista: Enlace[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of lista) {
    for (const [red, re] of REDES) {
      if (!out[red] && re.test(e.url)) out[red] = e.url.replace(/\/$/, "");
    }
  }
  return out;
}
