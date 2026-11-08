// Rastreo de un sitio: puerta legal → huella → descubrimiento (extractor por
// plataforma) → páginas clasificadas → hechos de bodega, vinos y servicios.
// Sin BD: el resultado lo guarda guardar.ts o va al JSON del dry-run.
import { dominioWeb } from "../../lib/contacto.ts";
import { ClienteHttp, ErrorHttp, ParadaFuente, type Respuesta } from "../../lib/http.ts";
import type { Log } from "../../lib/log.ts";
import { RobotsDenegado } from "../../lib/robots.ts";
import { claveTexto, limpiarEspacios } from "../../lib/texto.ts";
import { clasificar, esOtroIdioma, huella, type Clase, type Huella } from "./clasificar.ts";
import {
  bodegaVacia,
  ES_SERVICIO,
  esNombreDeVino,
  extraerBodega,
  extraerServicio,
  extraerVino,
  secciones,
  type HechosBodegaWeb,
  type ServicioWeb,
  type VinoWeb,
} from "./extraer.ts";
import {
  bloques,
  bloquesDeFragmento,
  cargar,
  decodificarEntidades,
  enlaces,
  h1,
  jsonLd,
  limpiarTitulo,
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
}

export interface PaginaVista {
  url: string;
  clase: Clase;
  origen: "html" | "wp" | "woo";
  titulo: string | null;
}

export interface VinoSitio extends VinoWeb {
  url: string;
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
  paginas: PaginaVista[];
  bodega: BodegaSitio | null;
  vinos: VinoSitio[];
  servicios: ServicioSitio[];
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
  ahora?: () => Date;
}

class PresupuestoAgotado extends Error {}

/** Contenido de una página lista para extraer. */
interface Contenido {
  url: string;
  clase: Clase;
  origen: PaginaVista["origen"];
  titulo: string;
  bloques: Bloque[];
  enlaces: Enlace[];
  /** Ficha de producto de la Store API de WooCommerce. */
  producto?: ProductoWoo;
  gtin?: string | null;
}

interface ProductoWoo {
  id: number;
  name: string;
  permalink: string;
  description?: string;
  short_description?: string;
  categories?: { name: string; slug: string }[];
  attributes?: { name: string; terms?: { name: string }[] }[];
  prices?: { price?: string; currency_minor_unit?: number };
}

const MAX_POR_CLASE: Record<Clase, number> = { vino: 25, historia: 4, enoturismo: 5, contacto: 1, legal: 0, otra: 0 };
const PRIORIDAD_CLASE: Clase[] = ["vino", "historia", "enoturismo", "contacto"];
const TIPOS_WP_IGNORADOS = /^(attachment|nav_menu_item|wp_|post$|jp_|elementor|e-landing|oembed|revision|customize|user_request|wpcf7|acf|br_|et_|ct_|fl-|mc4wp|product_variation|shop_)/;
const SUBSITEMAP_UTIL = /page|product|vino|wine|visita|experienc|enoturismo|portfolio|project|anada|pagina/i;
const SUBSITEMAP_INUTIL = /category|tag|author|attachment|post-sitemap|user|product_cat|product_tag|format|archive|news|noticia|blog/i;
const TITULO_NO_VINO = /^(?:d\.?\s?o\.?\s|denominaci[óo]n|gama\b|l[íi]nea\b|colecci[óo]n\b)|^(nota de cata|notas de cata|ficha t[ée]cnica|elaboraci[óo]n|vi[ñn]edos?|maridaje|vista|nariz|boca|crianza en barrica|variedad(es)?|descargar|premios|puntuaciones|comprar|añadas?|otros vinos|nuestros vinos|vinos?|wines?|tinto|blanco|rosado)$/i;
const CATEGORIA_NO_VINO = /gourmet|alimentaci[oó]n|delicatessen|merchandising|regalos?|packs?|lotes?|accesorios|aceites?|conservas|queso/i;
const RUTA_NOTICIA = /\/(noticias?\d*|news|blog|actualidad|prensa|press|tag|category|categoria|author)(?:[\/._?-]|$)/i;
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

const TITULO_PAGINA_GENERICO = /^(d\.?\s?o\.?\s|inicio|home|vinos?$|wines?$|tienda$|shop$)/i;
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
      paginas: [],
      bodega: null,
      vinos: [],
      servicios: [],
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
    }
    r.peticiones = this.http.peticiones - peticionesAntes;
    r.segundos = Math.round((Date.now() - inicio) / 1000);
    return r;
  }

  private async ejecutar(entrada: EntradaSitio, r: ResultadoSitio, ahora: Date) {
    const p = r.puerta;
    const ex = exclusionDe(this.o.exclusiones, entrada.dominio);
    if (ex) return saltar(p, "exclusion_manual", `${ex.motivo} (${ex.fecha})`);

    // 1. Portada (la única petición que puede seguir una redirección a otro dominio).
    let portada: Respuesta;
    try {
      portada = await this.http.get(entrada.url, { permitirOtroHost: true });
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
    }
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

    const enlacesHome = enlaces($home, portada.url);
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
    const presupuesto = { quedan: this.o.maxPeticiones ?? 40 };
    const contenidos: Contenido[] = [];
    const indexable = !directivasHome.includes("noindex") && !directivasHome.includes("none");
    if (indexable) {
      contenidos.push({
        url: portada.url, clase: "historia", origen: "html", titulo: titulo($home) ?? "",
        bloques: bloques($home), enlaces: enlacesHome,
      });
    }
    const extractor = EXTRACTORES[r.huella.plataforma];
    try {
      r.extractor = await extractor.descubrir(this.contexto(origen, presupuesto, r), contenidos, sigueHome ? enlacesHome : []);
    } catch (e) {
      if (!(e instanceof PresupuestoAgotado)) throw e;
      r.extractor = r.huella.plataforma;
      r.avisos.push(`Presupuesto de ${this.o.maxPeticiones ?? 40} peticiones agotado: se extrae lo descubierto`);
    }
    r.paginas = contenidos.map((c) => ({ url: c.url, clase: c.clase, origen: c.origen, titulo: c.titulo || null }));

    // 5. Hechos.
    r.bodega = this.hechosBodega(contenidos, enlacesHome);
    r.vinos = this.vinos(contenidos, ahora.getFullYear());
    r.servicios = this.servicios(contenidos, host, entrada.dominio);
    const eno = contenidos.find((c) => c.clase === "enoturismo" && c.origen !== "woo") ?? contenidos.find((c) => c.clase === "enoturismo");
    if (eno || r.servicios.length) {
      r.bodega.enoturismo = true;
      r.bodega.enoturismo_web = eno?.url ?? r.servicios[0]!.url;
      r.bodega.enoturismo_email = r.servicios.find((s) => s.email)?.email ?? null;
      r.bodega.enoturismo_telefono = r.servicios.find((s) => s.telefono)?.telefono ?? null;
    }
  }

  private contexto(origen: string, presupuesto: { quedan: number }, r: ResultadoSitio): ContextoDescubrimiento {
    return {
      origen,
      huella: r.huella!,
      log: this.o.log,
      avisos: r.avisos,
      pedir: async (url: string) => {
        if (presupuesto.quedan <= 0) throw new PresupuestoAgotado();
        presupuesto.quedan--;
        return this.http.get(url);
      },
      textoRobots: () => this.http.textoRobots(origen),
      quedan: () => presupuesto.quedan,
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

  private vinos(contenidos: Contenido[], hoy: number): VinoSitio[] {
    const out = new Map<string, VinoSitio>();
    const meter = (v: VinoSitio) => {
      if (!v.nombre || v.nombre.length < 2 || v.nombre.length > 80 || !esNombreDeVino(v.nombre) || TITULO_NO_VINO.test(v.nombre)) return;
      const k = `${claveTexto(v.nombre)}|${v.anio ?? ""}`;
      const previo = out.get(k);
      if (!previo || v.evidencias > previo.evidencias) out.set(k, v);
    };
    for (const c of contenidos.filter((x) => x.clase === "vino")) {
      if (c.producto) {
        const p = c.producto;
        const texto = textoDe(bloquesDeFragmento(`${p.short_description ?? ""}\n${p.description ?? ""}`));
        const atributos = Object.fromEntries((p.attributes ?? []).map((a) => [a.name, (a.terms ?? []).map((t) => t.name).join(", ")]));
        const v = extraerVino(decodificarEntidades(p.name), texto, { atributos, hoy, gtin: c.gtin ?? null });
        const categoriaVino = (p.categories ?? []).some((x) => /vino|wine|tinto|blanco|rosado/i.test(x.name));
        if (v.evidencias >= 1 || categoriaVino) meter({ ...v, url: p.permalink });
        continue;
      }
      const texto = textoDe(c.bloques);
      const secs = secciones(c.bloques).filter((s) => !TITULO_NO_VINO.test(s.titulo.trim()) && esNombreDeVino(s.titulo));
      const vinosSecciones = secs.map((s) => extraerVino(s.titulo, s.texto, { hoy })).filter((v) => v.evidencias >= 2);
      // Página-listado con varias fichas: un vino por sección. Si no, la página es una ficha.
      if (vinosSecciones.length >= 2 && esListado(c.url, c.titulo)) {
        for (const v of vinosSecciones) meter({ ...v, url: c.url });
        continue;
      }
      const v = extraerVino(c.titulo, texto, { hoy, gtin: c.gtin ?? null });
      if (v.evidencias >= 2 && !TITULO_NO_VINO.test(v.nombre) && !esListado(c.url, c.titulo)) meter({ ...v, url: c.url });
    }
    return [...out.values()];
  }

  private servicios(contenidos: Contenido[], host: string, dominio: string): ServicioSitio[] {
    const out = new Map<string, ServicioSitio>();
    const meter = (s: ServicioSitio) => {
      const k = `${s.tipo}|${claveTexto(s.titulo)}`;
      if (!out.has(k) && out.size < 8) out.set(k, s);
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
  huella: Huella;
  log: Log;
  avisos: string[];
  /** GET que descuenta del presupuesto de páginas del sitio (lanza al agotarlo). */
  pedir(url: string): Promise<Respuesta>;
  textoRobots(): Promise<string | null>;
  quedan(): number;
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
    // Sin API (401/404) o con poco contenido: sitemap y enlaces.
    if (!api || contenidos.filter((c) => c.clase !== "historia").length < 2) {
      usados.push(await sitemapYEnlaces(ctx, contenidos, enlacesHome));
    }
    return usados.join("+") || "wordpress";
  },
};

const generico: Extractor = {
  async descubrir(ctx, contenidos, enlacesHome) {
    return sitemapYEnlaces(ctx, contenidos, enlacesHome);
  },
};

// Shopify (/products.json, /collections/*.json) y Wix: no hay casos en Ribera (SOURCES §3).
// Punto de extensión: hoy usan sitemap + enlaces y lo dejan dicho en el log.
const pendiente = (nombre: string): Extractor => ({
  async descubrir(ctx, contenidos, enlacesHome) {
    ctx.log.info(`${ctx.origen}: plataforma ${nombre} sin extractor propio todavía; se usa sitemap + HTML`);
    return `${nombre}→${await sitemapYEnlaces(ctx, contenidos, enlacesHome)}`;
  },
});

export const EXTRACTORES: Record<Huella["plataforma"], Extractor> = {
  wordpress,
  generico,
  shopify: pendiente("shopify"),
  wix: pendiente("wix"),
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
    if (e instanceof PresupuestoAgotado || e instanceof ParadaFuente) throw e;
    ctx.log.debug(`${url}: ${(e as Error).message}`);
    return null;
  }
}

/** Store API de WooCommerce: vinos y experiencias con atributos y precio en una petición. */
async function tiendaWoo(ctx: ContextoDescubrimiento, contenidos: Contenido[]): Promise<boolean> {
  const productos: ProductoWoo[] = [];
  for (let pagina = 1; pagina <= 3; pagina++) {
    const r = await pedirJson<ProductoWoo[]>(ctx, new URL(`/wp-json/wc/store/v1/products?per_page=100&page=${pagina}`, ctx.origen).href);
    if (!r || !Array.isArray(r.datos)) break;
    productos.push(...r.datos);
    const total = Number(r.res.cabeceras?.get("x-wp-totalpages") ?? 1);
    if (pagina >= total) break;
  }
  if (productos.length === 0) return false;
  for (const p of productos) {
    if (!p.permalink || esOtroIdioma(p.permalink)) continue;
    try {
      if (new URL(p.permalink, ctx.origen).host !== new URL(ctx.origen).host) continue;
    } catch {
      continue;
    }
    const nombre = decodificarEntidades(p.name ?? "");
    const cats = (p.categories ?? []).map((c) => c.name).join(" ");
    const servicio = ES_SERVICIO.test(nombre) || /visita|experienc|enoturismo|cata/i.test(cats);
    const clase: Clase = servicio ? "enoturismo" : "vino";
    if (clase === "vino" && (!esNombreDeVino(nombre) || CATEGORIA_NO_VINO.test(cats) && !/vino|wine/i.test(cats))) continue;
    contenidos.push({ url: p.permalink, clase, origen: "woo", titulo: nombre, bloques: [], enlaces: [], producto: p });
  }
  return true;
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
      const lista = await pedirJson<ItemWp[]>(ctx, `${base.replace(/\/$/, "")}/wp/v2/${t.rest_base}?per_page=100&page=${pagina}&_fields=id,link,slug,type,title`);
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
      if (new URL(item.link).host !== new URL(ctx.origen).host || RUTA_NOTICIA.test(item.link)) continue;
      if (!item.link || esOtroIdioma(item.link)) continue;
      const tituloItem = decodificarEntidades(item.title?.rendered ?? "");
      const clase = clasificar({ url: item.link, titulo: tituloItem, tipoWp: t.slug === "page" ? null : t.slug });
      if (MAX_POR_CLASE[clase] > 0 && !isRaiz(item.link)) candidatos.push({ item, clase, tipo: t });
    }
  }
  if (candidatos.length === 0) return true;
  const elegidos = elegir(candidatos.map((c) => ({ ...c, url: c.item.link })), contenidos);
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
        if (c) contenidos.push(c);
        continue;
      }
      contenidos.push({ url: e.item.link, clase: e.clase, origen: "wp", titulo: tituloItem, bloques: bs, enlaces: enlacesDeFragmento(html, e.item.link) });
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
function normalizarUrl(u: string): string {
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
    const t = elegirTitulo(tituloPreferido, nodos, $);
    const clase = clasePrevia ?? clasificar({ url: res.url, titulo: titulo($), h1: h1($), migas: migas($, nodos), tiposJsonLd: tipos });
    const sigue = !directivas.includes("nofollow") && !directivas.includes("none");
    // noindex: la página no se extrae (pero puede seguir sus enlaces si no es nofollow).
    const indexable = !directivas.includes("noindex") && !directivas.includes("none");
    const producto = nodos.find((n) => n["@type"] === "Product");
    const gtin = producto ? (["gtin13", "gtin", "gtin14", "gtin12", "gtin8"].map((k) => producto[k]).find((v) => typeof v === "string" || typeof v === "number") ?? null) : null;
    return {
      url: res.url,
      clase: indexable ? clase : "otra",
      origen: "html",
      titulo: t,
      bloques: indexable ? bloques($) : [],
      enlaces: sigue ? enlaces($, res.url) : [],
      gtin: gtin == null ? null : String(gtin),
    };
  } catch (e) {
    if (e instanceof PresupuestoAgotado || e instanceof ParadaFuente) throw e;
    ctx.log.debug(`${url}: ${(e as Error).message}`);
    return null;
  }
}

/** Sitemap (robots → índices habituales) y, si no hay, enlaces de portada a profundidad 2. */
async function sitemapYEnlaces(ctx: ContextoDescubrimiento, contenidos: Contenido[], enlacesHome: Enlace[]): Promise<string> {
  const host = new URL(ctx.origen).host;
  const urls = await sitemap(ctx);
  const candidatos: { url: string; clase: Clase }[] = [];
  const delSitio = (u: string) => {
    try {
      return new URL(u).host === host && !esOtroIdioma(u) && !/\.(pdf|jpe?g|png|webp|gif|zip|docx?|xml)$/i.test(u) && !RUTA_NOTICIA.test(u) && !RUTA_PRIVADA.test(new URL(u).pathname);
    } catch {
      return false;
    }
  };
  for (const u of urls.filter(delSitio)) candidatos.push({ url: u, clase: clasificar({ url: u }) });
  for (const e of enlacesHome.filter((x) => delSitio(x.url))) {
    candidatos.push({ url: e.url, clase: clasificar({ url: e.url, titulo: e.texto }) });
  }
  const unicos = [...new Map(candidatos.filter((c) => MAX_POR_CLASE[c.clase] > 0 && !isRaiz(c.url)).map((c) => [normalizarUrl(c.url), c])).values()];
  const elegidos = elegir(unicos, contenidos);
  const listados: Contenido[] = [];
  for (const e of elegidos) {
    const c = await paginaHtml(ctx, e.url, e.clase);
    if (!c) continue;
    contenidos.push(c);
    if (c.clase === "vino") listados.push(c);
  }
  // Profundidad 2: fichas de vino enlazadas desde un listado de vinos (misma sección de la web).
  if (urls.length === 0 || listados.length > 0) {
    const ya = new Set(contenidos.map((c) => normalizarUrl(c.url)));
    for (const l of listados) {
      const prefijo = new URL(l.url).pathname.replace(/\/$/, "");
      for (const e of l.enlaces) {
        if (contenidos.filter((c) => c.clase === "vino").length >= MAX_POR_CLASE.vino || ctx.quedan() <= 0) break;
        const ruta = new URL(e.url).pathname;
        const pareceVino = /\b(tinto|blanco|rosado|clarete|crianza|reserva|roble|joven|vendimia|cosecha)\b/i.test(e.texto) && e.texto.length <= 60;
        if (!delSitio(e.url) || ya.has(normalizarUrl(e.url)) || !(ruta.startsWith(prefijo + "/") || /\/(vinos?|wines?|productos?)\//i.test(ruta) || pareceVino)) continue;
        ya.add(normalizarUrl(e.url));
        const c = await paginaHtml(ctx, e.url, "vino");
        if (c) contenidos.push(c);
      }
    }
  }
  return urls.length ? "sitemap" : "enlaces";
}

async function sitemap(ctx: ContextoDescubrimiento): Promise<string[]> {
  const robots = (await ctx.textoRobots()) ?? "";
  const declarados = [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]!);
  const candidatos = declarados.length ? declarados.slice(0, 2) : ["/sitemap_index.xml", "/wp-sitemap.xml", "/sitemap.xml"].map((p) => new URL(p, ctx.origen).href);
  for (const url of candidatos) {
    const xml = await xmlDe(ctx, url);
    if (!xml) continue;
    const locs = (etiqueta: string) => [...xml.matchAll(new RegExp(`<${etiqueta}>\\s*<loc>\\s*([^<\\s]+)\\s*</loc>`, "gi"))].map((m) => decodificarEntidades(m[1]!));
    const subs = locs("sitemap");
    if (subs.length === 0) return locs("url");
    const out: string[] = [];
    for (const s of subs.filter((x) => SUBSITEMAP_UTIL.test(x) && !SUBSITEMAP_INUTIL.test(x)).slice(0, 4)) {
      const sub = await xmlDe(ctx, s);
      if (sub) out.push(...[...sub.matchAll(/<url>\s*<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodificarEntidades(m[1]!)));
    }
    return out;
  }
  return [];
}

async function xmlDe(ctx: ContextoDescubrimiento, url: string): Promise<string | null> {
  try {
    const res = await ctx.pedir(url);
    return /<(urlset|sitemapindex)\b/i.test(res.texto.slice(0, 2000)) ? res.texto : null;
  } catch (e) {
    if (e instanceof PresupuestoAgotado || e instanceof ParadaFuente) throw e;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

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
