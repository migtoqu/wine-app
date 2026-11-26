// Extracción de hechos atómicos del texto de una web de bodega (reglas y
// expresiones regulares en español, con diccionarios cerrados). Nunca se
// devuelve una frase de la web: solo números, nombres propios cortos y
// descriptores del vocabulario de diccionarios.ts.
import { limpiarEspacios } from "../../lib/texto.ts";
import {
  CATA_BOCA,
  CATA_NARIZ,
  CATA_VISTA,
  descriptores,
  FORMAS_VARIEDAD,
  IDIOMAS,
  MARIDAJE,
  plano,
  PLATAFORMAS_RESERVA,
} from "./diccionarios.ts";
import { descripcionServicio, extraerDetalle, type DetalleServicio } from "./enoturismo.ts";
import type { Bloque, Enlace } from "./html.ts";

const ANIO = "(1[89]\\d{2}|20[0-4]\\d)";
const anioValido = (n: number, hoy: number) => n >= 1800 && n <= hoy;

/** «14,5» / «14.5» → 14.5; «1.200» → 1200. */
export function numero(s: string): number {
  const t = s.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t.replace(",", "."));
}

// ---------------------------------------------------------------------------
// Bodega
// ---------------------------------------------------------------------------

export interface HechosBodegaWeb {
  fundacion_anio: number | null;
  fundadores: string[];
  familia: string | null;
  generacion: number | null;
  hectareas: number | null;
  altitud: number | null;
  vinedo_municipios: string[];
  primera_anada: number | null;
  inauguracion: number | null;
  produccion_botellas: number | null;
}

export function bodegaVacia(): HechosBodegaWeb {
  return {
    fundacion_anio: null, fundadores: [], familia: null, generacion: null, hectareas: null, altitud: null,
    vinedo_municipios: [], primera_anada: null, inauguracion: null, produccion_botellas: null,
  };
}

const FUNDACION_FUERTE = [
  new RegExp(`\\b(?:fundad[ao]s?|cread[ao]s?|establecid[ao]s?|constituid[ao]s?|fundamos|creamos)\\s+(?:en\\s+)?(?:el\\s+)?(?:año\\s+)?${ANIO}\\b`, "i"),
  new RegExp(`\\b(?:se\\s+fund[óo]|fue\\s+fundad[ao]|nace|se\\s+cre[óo]|se\\s+constituy[óo]|se\\s+funda|se\\s+crea|tiene\\s+su\\s+origen|comenz[óo]\\s+su\\s+(?:andadura|actividad|historia))\\b[^.\\n]{0,50}?\\b(?:en|de)\\s+(?:el\\s+)?(?:año\\s+)?${ANIO}\\b`, "i"),
  new RegExp(`\\b(?:fundaci[óo]n|founded(?:\\s+in)?|año\\s+de\\s+fundaci[óo]n)\\s*(?:en\\s+|:\\s*|-\\s*)?(?:el\\s+)?(?:año\\s+)?${ANIO}\\b`, "i"),
  new RegExp(`\\bbodega\\b[^.\\n()]{0,30}\\(${ANIO}\\)`, "i"),
  new RegExp(`\\ben\\s+(?:el\\s+)?(?:año\\s+)?${ANIO}\\s*,?\\s+(?:se\\s+fund[óo]|se\\s+funda|fund[óo]|nace|fundamos|se\\s+crea|se\\s+cre[óo]|creamos|comienza\\s+(?:la|nuestra)\\s+(?:historia|andadura))`, "i"),
];
// «desde 1987» solo en la página de historia y junto a palabras de la bodega.
const FUNDACION_DEBIL = new RegExp(`\\b(?:bodega|familia|elaborando|elaboramos|cultivando|viticultores)\\b[^.\\n]{0,40}?\\bdesde\\s+(?:el\\s+)?(?:año\\s+)?${ANIO}\\b|\\bdesde\\s+(?:el\\s+)?(?:año\\s+)?${ANIO}\\s*,?\\s+(?:la\\s+familia|elaboramos|cultivamos|la\\s+bodega)`, "i");

const MAYUS = "[A-ZÁÉÍÓÚÑÜ]";
const PALABRA = `${MAYUS}[a-záéíóúñü]+`;
const NOMBRE = `${PALABRA}(?:\\s+(?:de\\s+(?:la\\s+)?|del\\s+)?${PALABRA}){0,3}`;
const NO_NOMBRES = new Set(["gente", "unida", "numerosa", "real", "entera", "propietaria", "fundadora", "bodega", "bodegas", "grupo", "su", "sus", "un", "una", "el", "la", "los", "las", "nuestro", "nuestra", "familia", "don", "doña", "vinos", "viñedos", "ribera", "duero", "españa"]);

function nombresPropios(s: string): string[] {
  return s
    .split(/\s*(?:,|\by\b|\be\b)\s*/)
    .map((x) => limpiarEspacios(x.replace(/^(?:don|doña|d\.|dña\.)\s+/i, "")))
    .filter((x) => x.split(" ").length >= 2 && x.split(" ").length <= 5 && x.length <= 50)
    .filter((x) => !NO_NOMBRES.has(x.split(" ")[0]!.toLowerCase()));
}

const ORDINALES: Record<string, number> = { primera: 1, segunda: 2, tercera: 3, cuarta: 4, quinta: 5, sexta: 6, septima: 7, octava: 8 };
const CARDINALES: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8 };

/** Hechos de la bodega en un texto. `esHistoria` habilita las reglas débiles («desde 1987»). */
export function extraerBodega(
  texto: string,
  opciones: { municipios: string[]; esHistoria: boolean; anioActual?: number },
): HechosBodegaWeb {
  const hoy = opciones.anioActual ?? new Date().getFullYear();
  const h = bodegaVacia();

  for (const re of FUNDACION_FUERTE) {
    const m = texto.match(re);
    const anio = m ? Number(m.slice(1).find(Boolean)) : NaN;
    if (anioValido(anio, hoy)) {
      h.fundacion_anio = anio;
      break;
    }
  }
  if (!h.fundacion_anio && opciones.esHistoria) {
    const m = texto.match(FUNDACION_DEBIL);
    const anio = m ? Number(m[1] ?? m[2]) : NaN;
    if (anioValido(anio, hoy)) h.fundacion_anio = anio;
  }

  const fund = texto.match(new RegExp(`\\bfundad[ao]\\s+(?:en\\s+(?:el\\s+(?:año\\s+)?)?\\d{4}\\s+)?por\\s+((?:(?:don|doña|D\\.)\\s+)?${NOMBRE}(?:\\s*(?:,|\\by\\b|\\be\\b)\\s*(?:(?:don|doña|D\\.)\\s+)?${NOMBRE})*)`));
  if (fund && !/^(?:la|su)\s+familia/i.test(fund[1]!)) h.fundadores = nombresPropios(fund[1]!).slice(0, 4);

  const familias = new Map<string, number>();
  for (const m of texto.matchAll(new RegExp(`\\b[Ff]amilia[ \\t]+(${PALABRA}(?:[ \\t-]+${PALABRA}){0,2})`, "g"))) {
    const f = m[1]!;
    if (NO_NOMBRES.has(f.split(/[\s-]/)[0]!.toLowerCase())) continue;
    familias.set(f, (familias.get(f) ?? 0) + 1);
  }
  h.familia = [...familias].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? null;

  const p = plano(texto);
  const generaciones: number[] = [];
  for (const m of p.matchAll(/\b(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|[1-8])\s*(?:a|ª)?\s+generacion\b/g)) {
    generaciones.push(ORDINALES[m[1]!] ?? Number(m[1]));
  }
  for (const m of p.matchAll(/\b(dos|tres|cuatro|cinco|seis|siete|ocho|[2-8])\s+generaciones\b/g)) {
    generaciones.push(CARDINALES[m[1]!] ?? Number(m[1]));
  }
  h.generacion = generaciones.length ? Math.max(...generaciones) : null;

  for (const m of texto.matchAll(/(\d{1,3}(?:\.\d{3})+|\d{1,4}(?:[.,]\d{1,2})?)\s*(?:ha\b|has\b|hect[áa]reas?\b)/gi)) {
    const i = m.index!;
    // Contexto dentro de la misma frase: «un jardín de 2 hectáreas. El viñedo…» no cuenta.
    const ini = Math.max(...[".", "\n", "…", "!", "?"].map((c) => texto.lastIndexOf(c, i) + 1), i - 70);
    const finFrase = texto.slice(i).search(/[.\n…!?](?!\d)/);
    const contexto = plano(texto.slice(ini, Math.min(i + (finFrase < 0 ? texto.length : finFrase), i + m[0].length + 70)));
    if (!/vin(e|a)|vides|cultiv|plantad|propias|parcelas|finca/.test(contexto)) continue;
    const n = numero(m[1]!);
    if (n >= 0.5 && n <= 3000) {
      h.hectareas = n;
      break;
    }
  }

  h.altitud = extraerAltitud(texto);
  h.vinedo_municipios = municipiosVinedo(texto, opciones.municipios);

  const primera = texto.match(new RegExp(`\\bprimera\\s+(?:añada|cosecha|vendimia|elaboraci[óo]n)\\b[^.\\n]{0,30}?\\b${ANIO}\\b|\\ben\\s+${ANIO}\\s*,?\\s+(?:sale|sali[óo]|lanzamos|elaboramos|se\\s+elabor[óo]|se\\s+elabora|elabor[óo])\\s+(?:la|su|nuestra)\\s+primera\\s+(?:añada|cosecha)`, "i"));
  // «elaboró su primera cosecha en 1968 en Vega Sicilia» es la de una persona en otra bodega.
  const enOtra = primera ? /^\s+en\s+(?:la\s+bodega\s+)?\p{Lu}/u.test(texto.slice(primera.index! + primera[0].length)) : false;
  if (primera && !enOtra) {
    const n = Number(primera[1] ?? primera[2]);
    if (anioValido(n, hoy) && (!h.fundacion_anio || n >= h.fundacion_anio)) h.primera_anada = n;
  }

  const inaug = texto.match(new RegExp(`\\b(?:se\\s+inaugur[óo]|inauguramos|se\\s+construy[óo]|construimos|se\\s+levant[óo])\\s+(?:la\\s+|nuestra\\s+|una\\s+)?(?:nueva\\s+|actual\\s+)?bodega\\b[^.\\n]{0,30}?\\b${ANIO}\\b|\\ben\\s+${ANIO}\\s*,?\\s+(?:se\\s+inaugura|se\\s+construye|inauguramos|construimos)\\s+(?:la\\s+|nuestra\\s+)?(?:nueva\\s+|actual\\s+)?bodega\\b`, "i"));
  if (inaug) {
    const n = Number(inaug[1] ?? inaug[2]);
    if (anioValido(n, hoy)) h.inauguracion = n;
  }

  const prod = texto.match(/(\d{1,3}(?:\.\d{3})+|\d{3,8})\s+botellas\s+(?:al\s+año|anuales|por\s+año|cada\s+año)|producci[óo]n\s+(?:anual\s+)?(?:de\s+|media\s+de\s+)?(?:unas\s+|alrededor\s+de\s+)?(\d{1,3}(?:\.\d{3})+|\d{3,8})\s+botellas/i);
  if (prod) {
    const n = numero(prod[1] ?? prod[2]!);
    if (n >= 500 && n <= 20_000_000) h.produccion_botellas = n;
  }
  return h;
}

export function extraerAltitud(texto: string): number | null {
  const m =
    texto.match(/(\d{3,4}|\d\.\d{3})\s*(?:m\b|metros|msnm|m\.s\.n\.m)\.?\s*(?:de\s+altitud|de\s+altura|sobre\s+el\s+nivel\s+del\s+mar|s\.\s?n\.\s?m)/i) ??
    texto.match(/altitud\s+(?:media\s+)?(?:de\s+|entre\s+|superior\s+a\s+|de\s+más\s+de\s+)?(?:unos\s+)?(\d{3,4}|\d\.\d{3})\s*(?:m\b|metros)/i);
  if (!m) return null;
  const n = numero(m[1]!);
  return n >= 300 && n <= 1500 ? n : null;
}

/** Municipios de la lista que aparecen en frases sobre viñedos. */
export function municipiosVinedo(texto: string, municipios: string[]): string[] {
  const frases = texto.split(/(?<=[.!?\n])\s+/).filter((f) => /viñ(e|a)|parcela|paraje|finca|vides/i.test(f));
  if (frases.length === 0 || municipios.length === 0) return [];
  const p = ` ${plano(frases.join(" ")).replace(/[^a-z0-9 ]+/g, " ")} `;
  const out: { nombre: string; pos: number }[] = [];
  for (const m of [...new Set(municipios)].sort((a, b) => b.length - a.length)) {
    const clave = plano(m).replace(/[^a-z0-9 ]+/g, " ").trim();
    if (clave.length < 3) continue;
    const pos = p.indexOf(` ${clave} `);
    if (pos >= 0 && !out.some((o) => plano(o.nombre).includes(clave))) out.push({ nombre: m, pos });
  }
  return out.sort((a, b) => a.pos - b.pos).slice(0, 6).map((o) => o.nombre);
}

// ---------------------------------------------------------------------------
// Vino
// ---------------------------------------------------------------------------

export type TipoVino = "tinto" | "blanco" | "rosado" | "espumoso" | "dulce";
export type Crianza = "joven" | "roble" | "crianza" | "reserva" | "gran_reserva";

export interface VariedadWeb {
  nombre: string;
  porcentaje: number | null;
}

export interface VinoWeb {
  nombre: string;
  tipo: TipoVino | null;
  crianza: Crianza | null;
  anio: number | null;
  variedades: VariedadWeb[];
  barrica_meses: number | null;
  grado: number | null;
  temp_min: number | null;
  temp_max: number | null;
  cata_vista: string[];
  cata_nariz: string[];
  cata_boca: string[];
  maridaje: string[];
  ean: string | null;
  /** Marcadores de ficha técnica encontrados (uvas, grado, barrica, añada, cata, temperatura). */
  evidencias: number;
}

/** Productos de tienda que no son un vino. */
const NO_VINO = /\b(estuches?|cajas?|lotes?|packs?|regalos?|tarjetas?|bonos?|cheques?|copas?|sacacorchos|camisetas?|libros?|aceites?|vermut|vermouth|gin|ginebra|orujo|aguardiente|licor(es)?|mosto|vinagre|miel|gorras?|delantal|bolsas?|abridor|decantador|suscripci[oó]n|club|entradas?|visitas?|catas?|experiencias?|cursos?|eventos?|box|bottles|botellas|selecci[oó]n de|surtido|degustaci[oó]n|tour|reserva tu|pedido|quesos?|garbanzos|legumbres|cofres?|jam[oó]n|conservas|chocolates?|embutidos?|visit|tasting|shop|online|wines|tours?|antigoteo|abrebotellas|enfriador|cubitera|tarjeta regalo|gift|jab[oó]n|cosm[eé]tica|cremas?|vinoterapia|aove|mayor de edad|age verification|bienvenid[oa]s?)\b|\d\s*\+\s*\d|\bx\s?\d+\b/i;
/** Productos que son experiencias de enoturismo (van a servicios). */
export const ES_SERVICIO = /\b(visitas?|catas?|experiencias?|entradas?|tour|enoturismo|cursos?|talleres?|eventos?)\b/i;

/** Estilos y regiones extranjeras: en la tienda de una bodega española son reventa. */
const EXTRANJERO = /\b(tawny|late bottled|ruby port|oporto|porto|port wine|champagne|prosecco|bordeaux|bourgogne|burgundy|chianti|barolo|brunello|chablis|sancerre|riesling kabinett|malbec mendoza|whisk(?:e)?y|ginebra|ron|vodka|brandy|cognac)\b/i;

/** Denominaciones y regiones de fuera de España (reventa en la tienda de una bodega). */
const EXTRANJERO_DO = /\b(joseph perrier|igt|aoc|doc|docg|sicilia|toscana|piemonte|paraje altamira|santa maria valley|napa valley|sonoma)\b/i;

/**
 * Titulares que no son el nombre de un vino: entradas de blog, noticias de premios, listados,
 * tiendas, visitas y menús («Cómo conservar el vino en casa…», «96 puntos para Elías Mora…»,
 * «Descubre los Vinos de Bodega X», «Nuestra Tienda», «Sabores del Ebro… (80 €/persona»).
 * Se mira el título original, antes de limpiarlo: «Verdejo: qué es…» limpio sería «Verdejo».
 */
export function esTitularEditorial(titulo: string): boolean {
  const t = limpiarEspacios(titulo).replace(/^[\s▷►»→•·|\-–]+/, "");
  if (/[?¿!¡]/.test(t)) return true;
  if (/^(?:c[oó]mo|qu[eé]\s+(?:es|son|significa|hacer|vino|tipo)|por\s+qu[eé]|cu[aá]nto|cu[aá]l|d[oó]nde|cu[aá]ndo|descubre\s+(?:los|las|nuestr)|descubre\s+(?!el\s+vino\b)|descubriendo|explora(?:ndo)?|conoce|bienvenid|nuestr[oa]s?\s+(?:tienda|proceso|tradici[oó]n|historia|vinos?|bodega|nuevo|viñedos?)|(?:la\s+)?tienda\b|blog\b|los\s+mejores|el\s+mejor|lo\s+mejor|mejor(?:es)?\s+vinos?|tus?\s|sin\s+reservas|todo\s+(?:sobre|empieza)|elige|hechos\s+con|concours|concurso|tipos\s+de|el\s+vino\b|la\s+vendimia\b|el\s+cultivo|temperatura|men[uú]\b|brinda|(?:dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+)\s+(?:vinos|mitos|consejos|claves|razones))/i.test(t)) return true;
  if (/\b(?:\d{2,3}\s+puntos|\d{2}\s*ptos|puntuaciones|premios?\s+al|premiad[oa]|galard[oó]n|p[oó]dium|reconoce|reconocid[oa]s?|gu[ií]a\s+de\s+compra|consejos|mitos|libro|historia\s+de|picnic|almuerzo|€\s*\/\s*persona|por\s+persona|qu[eé]\s+es|en\s+casa)\b/i.test(t)) return true;
  // Frases largas: ningún vino se llama con doce palabras (los hay de diez: «Para Muestra, un Botón…»).
  return t.split(/\s+/).filter((w) => /\p{L}{2}/u.test(w)).length >= 12;
}

export function esNombreDeVino(nombre: string): boolean {
  if (EXTRANJERO.test(nombre) || EXTRANJERO_DO.test(nombre)) return false;
  // Sin «\b» al final: en «Barón» la «ó» cuenta como frontera y «\bbar\b» casaría.
  if (/(?:^|[\s(«"'])(?:tienda|blog|magazine|destilados?|wine\s+bar|bar|restaurante)(?=$|[\s,.:;)»"'])/i.test(nombre)) return false;
  // Categorías y páginas de D.O.: «Tintos de Rioja», «vino de Toro», «del Priorat».
  if (/^(?:tintos|blancos|rosados|espumosos|vinos)\s+de\b/i.test(nombre)) return false;
  if (/^(?:vinos?\s+)?del?\s+(?:toro|rioja|rueda|ribera|priorat|bierzo|navarra|cigales|castilla)\b/i.test(nombre)) return false;
  // Plantillas de ficha y etiquetado que algunas webs ponen como título.
  if (/\b(fichas?\s+(?:de\s+)?(?:productos?|t[eé]cnicas?)|nutricional(?:es)?|etiquetado|ingredientes|declaraci[oó]n|al[eé]rgenos|sheets?|nutritional|nutrition facts)\b/i.test(nombre)) return false;
  if (/^\s*(fichas?|productos?|t[eé]cnicas?|detalles?|technical|data)\s*$/i.test(nombre)) return false;
  // «Reserva» es una crianza, no «reserva tu visita».
  return !NO_VINO.test(nombre.replace(/\bgran\s+reserva\b|\breserva\b(?!\s+tu)/gi, ""));
}

const FORMATOS = /\b(?:\d{2,4}\s?(?:cl|ml)|\d(?:[.,]\d)?\s?l(?:itros?)?|m[áa]gnum|magnum|jeroboam|doble\s+m[áa]gnum|imperial|botella(?:\s+individual)?|media\s+botella|benjam[ií]n)\b/gi;

/** Nombre del vino sin añada, formato ni D.O. («Aalto 2021 Mágnum» → «Aalto»). */
// Español e inglés («Ficha X», «Sheet X», «Technical sheet X», «X – Nutritional information»).
const PLANTILLA = "fichas?(?:\\s+de)?(?:\\s+(?:productos?|t[eé]cnicas?|vinos?))?|info(?:rmaci[oó]n)?\\s+nutricional|etiquetado(?:\\s+nutricional)?|valores\\s+nutricionales|(?:product|technical|tech|data|fact|wine)\\s+sheets?|sheets?|nutritional\\s+(?:information|info|facts)|nutrition\\s+facts";
const PLANTILLA_PREFIJO = new RegExp(`^\\s*(?:${PLANTILLA})\\s*[:\\-–|]?\\s+(?=\\S)`, "i");
const PLANTILLA_SUFIJO = new RegExp(`[\\s\\-–|:(+]+(?:${PLANTILLA})\\)?\\s*$`, "i");

/**
 * Quita las palabras de plantilla que algunas webs ponen en el título de la ficha: «Ficha X»,
 * «Ficha técnica X», «Info nutricional X», «X – Etiquetado nutricional», «X + Ficha Técnica». Con un
 * sufijo quitado, también el año de dos cifras que lo precede («TresMatas Reserva 22- Etiquetado…»).
 * Lo que queda puede ser vacío o genérico («Fichas de producto»): no es un vino.
 */
export function limpiarPlantilla(nombre: string): string {
  let s = limpiarEspacios(nombre);
  for (let i = 0; i < 2; i++) {
    const antes = s;
    s = s.replace(PLANTILLA_PREFIJO, "");
    const sinSufijo = s.replace(PLANTILLA_SUFIJO, "");
    if (sinSufijo !== s) s = sinSufijo.replace(/\s+\d{2}\s*[-–]?\s*$/, "");
    if (s === antes) break;
  }
  return limpiarEspacios(s.replace(/[\s\-–|·,:+(]+$/g, ""));
}

/** Restos de títulos SEO que quedan al final del nombre: «, y», « de», «: de», « en de». */
const COLGANTE = /[\s,:;.\-–]+(?:y|e|o|de|del|en|con|a|al|para|la|el|los|las)$/i;

/**
 * Limpia el título de una ficha: precio («• precio 7,20€»), cantidad («12 x …», «(6 bot»), nombre
 * de la web tras un separador («. Vinos de Bodegas Izadi», «| Bodegas Ilurce»), tipo como sufijo
 * («– Vino tinto»), frases añadidas tras « , » o tras «: » y «. » con varias palabras, comillas y
 * palabras sueltas al final. «Descubre el vino X de Celler Y» → «X».
 */
export function limpiarTituloSeo(titulo: string): string {
  let s = limpiarEspacios(titulo)
    .replace(/^[\s▷►»→•·|]+/, "")
    .replace(/^descubre\s+(?:el|nuestro)\s+vino\s+(.+?)\s+de\s+(?:celler|cellers|bodegas?|viñedos)\b.*$/i, "$1")
    .replace(/^compra(?:r)?\s+(?:vino\s+)?/i, "")
    .replace(/^\d{1,2}\s*x\s+/i, "")
    .replace(/\s*[•·|–-]?\s*precio\s*:?\s*\d+(?:[.,]\d{1,2})?\s*€.*$/i, "")
    .replace(/\s*\(\s*\d{1,2}\s*(?:b|bot\.?|botellas?|uds?\.?|unidades)\b\.?\)?\s*$/i, "")
    .replace(/\s*[.|–-]\s*(?:los\s+)?vinos?\s+de\s+(?:bodegas?|celler)\s+.*$/i, "")
    .replace(/\s*[|]\s*(?:bodegas?|celler|viñedos)\b.*$/i, "")
    .replace(/\s*\.\s*(?:bodegas?|celler)\s+\p{Lu}.*$/u, "")
    .replace(/\s+[–-]\s+vino\s+(?:tinto|blanco|rosado|dulce|espumoso|de\s+autor)(?:\s+\p{L}+)?\s*$/iu, "")
    .replace(/\s*[.]\s*vino\s+(?:tinto|blanco|rosado)\b.*$/i, "")
    .replace(/[.\s]*nueva\s+añada\s*$/i, "")
    .replace(/\s*[,–-]\s*(?:el\s+)?mejor\s+.*$/i, "")
    // « , » de concatenación SEO: fuera si sigue una frase («, verdejo de Rueda», «, y», «, Vino de La
    // Rioja»); si sigue un nombre («Muedra , Gran Reserva»), se une.
    .replace(/\s+,\s+(?=\p{Ll}|(?:[Vv]ino|[Tt]into|[Bb]lanco|[Rr]osado)\b)(?:.*)$/u, "")
    .replace(/\s+,\s+/g, " ")
    // «X: el vino que…», «X: No es “otro vino”», «X : Viura y Garnacha»: fuera la frase. «Alvia: Livius
    // Rosado Gran Reserva» es marca y vino: se une.
    .replace(/\s*:\s+(?=(?:\S+\s+)*(?:el|la|los|las|un|una|no|es|y|de|del|en|con|nuestr[oa]s?)\s)(?:\S+\s+){1,}\S+$/iu, "")
    .replace(/\s*:\s+(?=\p{Ll})(?:\S+\s+){2,}\S+$/u, "")
    .replace(/^(\p{L}[\p{L}\d'’.-]*):\s+/u, "$1 ")
    // Frase tras un punto («CUBANEGRA. Primer reserva de…»), pero no el de una sigla («D.O. Toro»).
    .replace(/(?<!(?:^|[\s.])\p{L})\.\s+\p{L}+(?:\s+\S+){3,}$/u, "")
    .replace(/\s+bodegas?\s+(?:rioja|ribera|toro|rueda)$/i, "")
    .replace(/^(?:vino\s+)?de\s+autor\s+[–-]\s+/i, "")
    .replace(/["“”«»]/g, "");
  for (let i = 0; i < 3; i++) s = s.replace(COLGANTE, "");
  return limpiarEspacios(s);
}

export function nombreVino(titulo: string): string {
  if (esTitularEditorial(titulo)) return "";
  let s = limpiarPlantilla(limpiarEspacios(titulo))
    // Producto duplicado en WooCommerce: «El Sueco 2021 (copia)», «… - copia».
    .replace(/[\s\-–(]*\bcopia\b\)?\s*$/i, "")
    .replace(/\bD\.?\s?O\.?(?:\s?Ca\.?)?\s+Ribera\s+del\s+Duero\b/gi, "")
    .replace(/(?:\bde\s+la\s+)?\bRibera\s+del\s+Duero\b/gi, "")
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
    .replace(/\b(?:19[5-9]\d|20[0-4]\d)\b/g, "")
    .replace(FORMATOS, "")
    .replace(/^\s*(?:vinos?|wines?|comprar)\s+/i, "")
    // «Ficha producto: X», «X – Ficha técnica», «X (etiquetado nutricional)»
    .replace(/^\s*fichas?(?:\s+de)?\s+(?:productos?|t[eé]cnicas?|vinos?)\s*[:\-–|]?\s+(?=\S)/i, "")
    .replace(/[\s\-–|:(]+(?:fichas?(?:\s+de)?\s+(?:productos?|t[eé]cnicas?)|(?:etiquetado|info(?:rmaci[oó]n)?)\s+nutricional|valores\s+nutricionales)\)?\s*$/i, "")
    .replace(/[\s\-–|·,.:()]+$/g, "")
    .replace(/^[\s\-–|·,.:()]+/g, "")
    .replace(/\(\s*\)/g, "");
  s = limpiarTituloSeo(s);
  if (!/\p{Lu}/u.test(s)) s = s.replace(/(^|\s)(\p{Ll})/gu, (_m, a: string, c: string) => a + c.toUpperCase());
  if (!/\p{Ll}/u.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s-])(\p{Ll})/gu, (_m, a: string, c: string) => a + c.toUpperCase());
  }
  return s;
}

export function crianzaDe(nombre: string, texto = ""): Crianza | null {
  const desde = (s: string): Crianza | null => {
    const p = plano(s);
    if (/\bgran reserva\b/.test(p)) return "gran_reserva";
    if (/\breserva\b/.test(p)) return "reserva";
    if (/\bcrianza\b/.test(p)) return "crianza";
    if (/\broble\b/.test(p)) return "roble";
    if (/\bjoven\b/.test(p)) return "joven";
    return null;
  };
  const n = desde(nombre);
  if (n) return n;
  // Solo una etiqueta explícita («Tipo: Crianza»); «Crianza: 12 meses en barrica» no es la categoría.
  const etiqueta = texto.match(/\b(?:tipo(?:\s+de\s+vino)?|categor[íi]a|clasificaci[óo]n)\s*:\s*([^\n.;]{2,40})/i);
  return etiqueta ? desde(etiqueta[1]!) : null;
}

export function tipoDe(nombre: string, texto: string, variedades: VariedadWeb[]): TipoVino | null {
  const n = plano(nombre);
  if (/\b(rosado|clarete|rose)\b/.test(n)) return "rosado";
  if (/\b(espumoso|brut|cava|ancestral)\b/.test(n)) return "espumoso";
  if (/\b(blanco|white|albillo|verdejo)\b/.test(n)) return "blanco";
  if (/\b(dulce)\b/.test(n)) return "dulce";
  if (/\b(tinto|red)\b/.test(n)) return "tinto";
  const p = plano(texto);
  const etiqueta = p.match(/\btipo(?: de vino)?\s*:\s*([a-z ]{3,30})/);
  if (etiqueta) {
    const e = etiqueta[1]!;
    if (/rosado|clarete/.test(e)) return "rosado";
    if (/blanco/.test(e)) return "blanco";
    if (/espumoso/.test(e)) return "espumoso";
    if (/tinto/.test(e)) return "tinto";
  }
  const cuenta = (re: RegExp) => (p.match(re) ?? []).length;
  const c = {
    tinto: cuenta(/\bvinos? tintos?\b|\btinto\b/g),
    blanco: cuenta(/\bvinos? blancos?\b/g),
    rosado: cuenta(/\bvinos? rosados?\b|\brosado\b|\bclarete\b/g),
  };
  const max = Math.max(c.tinto, c.blanco, c.rosado);
  if (max > 0) {
    const ganadores = (Object.keys(c) as (keyof typeof c)[]).filter((k) => c[k] === max);
    if (ganadores.length === 1) return ganadores[0]!;
  }
  if (variedades.length > 0) {
    const colores = new Set(variedades.map((v) => FORMAS_VARIEDAD.find((f) => f.variedad.nombre === v.nombre)?.variedad.color));
    if (colores.size === 1 && colores.has("tinta")) return "tinto";
    if (colores.size === 1 && colores.has("blanca")) return "blanco";
  }
  return null;
}

/** Variedades con porcentaje; si ninguna lo trae, las mencionadas sin porcentaje. */
export function extraerVariedades(texto: string): VariedadWeb[] {
  const p = plano(texto);
  const conPct = new Map<string, number>();
  const menciones: { nombre: string; pos: number }[] = [];
  let resto = ` ${p} `;
  for (const { forma, variedad } of FORMAS_VARIEDAD) {
    const re = new RegExp(`(?<![a-z])${forma.replace(/[-\s]/g, "[-\\s]")}(?![a-z])`, "g");
    for (const m of resto.matchAll(re)) {
      const i = m.index!;
      if (!menciones.some((x) => x.nombre === variedad.nombre)) menciones.push({ nombre: variedad.nombre, pos: i });
      const antes = resto.slice(Math.max(0, i - 14), i);
      const despues = resto.slice(i + m[0].length, i + m[0].length + 14);
      const a = antes.match(/(\d{1,3}(?:[.,]\d)?)\s*%\s*(?:de\s+)?$/);
      const d = despues.match(/^\s*(?:\(|:|-|–)?\s*(\d{1,3}(?:[.,]\d)?)\s*%/);
      const pct = a ? numero(a[1]!) : d ? numero(d[1]!) : null;
      if (pct != null && pct > 0 && pct <= 100 && !conPct.has(variedad.nombre)) conPct.set(variedad.nombre, pct);
    }
    // Se consume la forma para que «garnacha» no cuente dentro de «garnacha tintorera».
    resto = resto.replace(re, (x) => " ".repeat(x.length));
  }
  if (conPct.size > 0) {
    const total = [...conPct.values()].reduce((a, b) => a + b, 0);
    if (total <= 100.5) {
      const out: VariedadWeb[] = [...conPct].map(([nombre, porcentaje]) => ({ nombre, porcentaje })).sort((a, b) => b.porcentaje! - a.porcentaje!);
      // «98 % Verdejo, Sauvignon Blanc 2 %» ya está; si faltan uvas mencionadas y no se llega al 100 %, van sin porcentaje.
      if (total < 99.5) for (const m of menciones) if (!conPct.has(m.nombre)) out.push({ nombre: m.nombre, porcentaje: null });
      return out.slice(0, 6);
    }
  }
  return menciones.sort((a, b) => a.pos - b.pos).slice(0, 5).map((m) => ({ nombre: m.nombre, porcentaje: null }));
}

export function extraerBarrica(texto: string): number | null {
  const valores = new Set<number>();
  const res = [
    /(\d{1,2})\s*meses\s+(?:de\s+crianza\s+)?(?:en\s+)?(?:barricas?|roble|madera)\b/gi,
    /(?:barricas?|roble\s+(?:franc[ée]s|americano))[^.\n]{0,70}?(?:durante|por|de)\s+(\d{1,2})\s+meses/gi,
    /\bcrianza\s*(?:de|durante|:)\s*(\d{1,2})\s+meses/gi,
  ];
  for (const re of res) {
    for (const m of texto.matchAll(re)) {
      // «12 a 14 meses» / «12-14 meses»: no es un número único.
      const antes = texto.slice(Math.max(0, m.index! - 8), m.index! + m[0].indexOf(m[1]!));
      if (/\d\s*(?:a|-|–|y)\s*$/.test(antes)) return null;
      const n = Number(m[1]);
      if (n >= 1 && n <= 60) valores.add(n);
    }
  }
  return valores.size === 1 ? [...valores][0]! : null;
}

export function extraerGrado(texto: string): number | null {
  const m =
    texto.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:vol|alc|v\/v|abv)/i) ??
    texto.match(/(?:grado(?:\s+alcoh[óo]lico)?|alcohol|graduaci[óo]n(?:\s+alcoh[óo]lica)?)\s*[:\-]?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:%|º|°|grados)/i);
  if (!m) return null;
  const n = numero(m[1]!);
  return n >= 5 && n <= 20 ? n : null;
}

export function extraerTemperatura(texto: string): { min: number; max: number } | null {
  const ventana = (i: number) => plano(texto.slice(Math.max(0, i - 60), i));
  for (const m of texto.matchAll(/(\d{1,2})\s*(?:[ºo°]\s*C?)?\s*(?:-|–|a|y)\s*(\d{1,2})\s*(?:[ºo°]|grados)/gi)) {
    if (!/temperatura|servir|servicio|consumir/.test(ventana(m.index! + 1))) continue;
    const a = Number(m[1]), b = Number(m[2]);
    if (a >= 4 && b <= 22 && a <= b) return { min: a, max: b };
  }
  const m = texto.match(/(?:temperatura(?:\s+de\s+servicio)?|servir\s+a|servicio)\s*(?:de|:|entre)?\s*(?:los\s+)?(\d{1,2})\s*(?:[ºo°]|grados)/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 4 && n <= 22) return { min: n, max: n };
  }
  return null;
}

/** Año de añada en el título o en una etiqueta («Añada: 2019»). */
export function extraerAnio(titulo: string, texto: string, hoy = new Date().getFullYear()): number | null {
  const t = titulo.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  const e = texto.match(/\b(?:añada|cosecha|vendimia|vintage)\s*:?\s*(19[5-9]\d|20[0-4]\d)\b/i);
  const n = Number((t ?? e)?.[1]);
  return n >= 1950 && n <= hoy ? n : null;
}

const EAN_RE = /\b(?:EAN(?:-13)?|GTIN(?:-13)?|c[óo]digo\s+de\s+barras)\s*:?\s*(\d{8}|\d{12,14})\b/i;

/** Dígito de control GS1. */
export function eanValido(ean: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(ean)) return false;
  const d = ean.split("").map(Number);
  const control = d.pop()!;
  const suma = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === control;
}

// Etiquetas de las fases de cata y del maridaje: al principio de línea o de frase, o seguidas de «:».
const ETIQUETAS: { fase: "vista" | "nariz" | "boca" | "maridaje"; re: RegExp }[] = [
  { fase: "vista", re: /(?:^|[.\n:;]\s*|\bcata\s+)(?:a la vista|en vista|vista|fase visual|visual|color|aspecto|appearance)\b\s*[:.,]?/gi },
  { fase: "nariz", re: /(?:^|[.\n:;]\s*|\bcata\s+)(?:en nariz|nariz|fase olfativa|aromas?|olfato|nose)\b\s*[:.,]?/gi },
  { fase: "boca", re: /(?:^|[.\n:;]\s*|\bcata\s+)(?:en boca|boca|fase gustativa|paladar|en paladar|gusto|taste|palate)\b\s*[:.,]?/gi },
  { fase: "maridaje", re: /(?:^|[.\n:;]\s*)(?:maridaje|marida(?:r)?\s+(?:con|bien)|ideal para acompañar|acompaña(?:r)?|recomendado con|pairing|sugerencias?)\b\s*[:.,]?/gi },
];

export function extraerCata(texto: string): { vista: string[]; nariz: string[]; boca: string[]; maridaje: string[] } {
  const marcas: { fase: (typeof ETIQUETAS)[number]["fase"]; inicio: number; fin: number }[] = [];
  for (const { fase, re } of ETIQUETAS) {
    for (const m of texto.matchAll(re)) marcas.push({ fase, inicio: m.index!, fin: m.index! + m[0].length });
  }
  marcas.sort((a, b) => a.inicio - b.inicio);
  const out = { vista: [] as string[], nariz: [] as string[], boca: [] as string[], maridaje: [] as string[] };
  const fases = new Set(marcas.map((m) => m.fase));
  // Una sola etiqueta suelta («color») no basta para leer cata; el maridaje sí vale solo.
  const hayCata = fases.has("nariz") || fases.has("boca") || [...fases].filter((f) => f !== "maridaje").length >= 2;
  for (let i = 0; i < marcas.length; i++) {
    const m = marcas[i]!;
    if (m.fase !== "maridaje" && !hayCata) continue;
    const fin = Math.min(marcas[i + 1]?.inicio ?? texto.length, m.fin + 400);
    const seccion = texto.slice(m.fin, fin);
    const dic = m.fase === "vista" ? CATA_VISTA : m.fase === "nariz" ? CATA_NARIZ : m.fase === "boca" ? CATA_BOCA : MARIDAJE;
    for (const d of descriptores(seccion, dic)) if (!out[m.fase].includes(d)) out[m.fase].push(d);
  }
  // Cata en prosa bajo «Notas de cata» («de intenso color cereza…, en nariz aromas de…, su paladar es…»):
  // sin etiquetas al principio de frase, la fase la marca la palabra clave de cada trozo.
  if (!out.vista.length && !out.nariz.length && !out.boca.length) {
    const prosa = cataEnProsa(texto);
    for (const f of ["vista", "nariz", "boca"] as const) out[f] = prosa[f];
  }
  for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = out[k].slice(0, 6);
  return out;
}

const PISTA_FASE: [Exclude<(typeof ETIQUETAS)[number]["fase"], "maridaje">, RegExp][] = [
  ["vista", /\b(color|colou?r|capa|ribete|reflejos|tonos|tonalidad|aspecto|lagrima|brillo|limpio y brillante)\b/],
  ["nariz", /\b(nariz|aromas?|aromatic[oa]|olfat\w*|bouquet|nose)\b/],
  ["boca", /\b(boca|paladar|gusto|retrogusto|postgusto|taninos?|final|palate|en boca)\b/],
];
const BLOQUE_CATA = /\b(notas? de cata|nota de cata|cata\s*:|tasting notes?)\b\s*:?/i;
const FIN_BLOQUE = /\n\s*(maridaje|premios?|elaboraci|ficha|vinificaci|crianza|temperatura|servicio|puntuaci|descripci|comprar|anadir|añadir)/i;

/** Fases de una cata escrita como prosa dentro de un bloque «Notas de cata». */
export function cataEnProsa(texto: string): { vista: string[]; nariz: string[]; boca: string[] } {
  const out = { vista: [] as string[], nariz: [] as string[], boca: [] as string[] };
  const m = texto.match(BLOQUE_CATA);
  if (!m) return out;
  let bloque = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 1200);
  const corte = bloque.slice(1).search(FIN_BLOQUE);
  if (corte >= 0) bloque = bloque.slice(0, corte + 1);
  const frases = bloque.split(/[.;\n]+/).map((f) => f.trim()).filter(Boolean);
  const dic = { vista: CATA_VISTA, nariz: CATA_NARIZ, boca: CATA_BOCA };
  let previa: keyof typeof out | null = null;
  for (const frase of frases) {
    const trozos = frase.split(/,\s+|\s+y\s+(?=(?:en|su|un|una|con)\s)/);
    const fases = trozos.map((t) => PISTA_FASE.find(([, re]) => re.test(plano(t)))?.[0] ?? null);
    for (let i = 0; i < trozos.length; i++) {
      // Un trozo sin pista toma la fase del siguiente con pista en la misma frase («Suave, redondo… en paladar»)
      // o, si no hay, la del anterior.
      const fase = fases[i] ?? fases.slice(i + 1).find((f) => f) ?? fases.slice(0, i).reverse().find((f) => f) ?? previa;
      if (!fase) continue;
      for (const d of descriptores(trozos[i]!, dic[fase])) if (!out[fase].includes(d)) out[fase].push(d);
    }
    previa = fases.filter(Boolean).at(-1) ?? previa;
  }
  // Una sola fase suelta no es una cata (p. ej. «color» en una frase de marketing).
  return [out.vista, out.nariz, out.boca].filter((x) => x.length).length >= 2 ? out : { vista: [], nariz: [], boca: [] };
}

/** Hechos de un vino a partir de su título, el texto de su ficha y, si hay, JSON-LD/atributos. */
export function extraerVino(
  titulo: string,
  texto: string,
  extra: { gtin?: string | null; atributos?: Record<string, string>; hoy?: number } = {},
): VinoWeb {
  const atributos = Object.entries(extra.atributos ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n");
  const todo = `${texto}\n${atributos}`;
  const variedades = extraerVariedades(todo);
  const nombre = nombreVino(titulo);
  const temp = extraerTemperatura(todo);
  const cata = extraerCata(texto);
  const eanTexto = todo.match(EAN_RE)?.[1] ?? null;
  const ean = [extra.gtin, eanTexto].find((e): e is string => !!e && eanValido(e)) ?? null;
  const v: VinoWeb = {
    nombre,
    tipo: tipoDe(nombre, todo, variedades),
    crianza: crianzaDe(nombre, todo),
    anio: extraerAnio(titulo, todo, extra.hoy),
    variedades,
    barrica_meses: extraerBarrica(todo),
    grado: extraerGrado(todo),
    temp_min: temp?.min ?? null,
    temp_max: temp?.max ?? null,
    cata_vista: cata.vista,
    cata_nariz: cata.nariz,
    cata_boca: cata.boca,
    maridaje: cata.maridaje,
    ean,
    evidencias: 0,
  };
  v.evidencias = [
    v.variedades.length > 0,
    v.grado != null,
    v.barrica_meses != null || /\bbarricas?\b/i.test(todo),
    /\b(?:añada|cosecha|vendimia)\b/i.test(todo),
    v.cata_nariz.length + v.cata_boca.length + v.cata_vista.length > 0 || /\bnotas?\s+de\s+cata\b/i.test(todo),
    v.temp_min != null,
    /\bficha\s+t[ée]cnica\b|\belaboraci[óo]n\b/i.test(todo),
  ].filter(Boolean).length;
  return v;
}

// ---------------------------------------------------------------------------
// Enoturismo
// ---------------------------------------------------------------------------

export type TipoServicio = "visita" | "cata" | "actividad" | "evento" | "restaurante" | "alojamiento";

export interface ServicioWeb extends DetalleServicio {
  tipo: TipoServicio;
  titulo: string;
  precio_desde: number | null;
  duracion_minutos: number | null;
  idiomas: string[];
  url_reserva: string | null;
  email: string | null;
  telefono: string | null;
  /** Descripción propia por plantilla (servicios_bodega.descripcion). */
  descripcion: string | null;
}

export function tipoServicio(titulo: string, texto = ""): TipoServicio {
  const probar = (s: string): TipoServicio | null => {
    const p = plano(s);
    if (/\b(restaurante|menu degustacion|gastronom\w*|comida|almuerzo|cena)\b/.test(p)) return "restaurante";
    if (/\b(alojamiento|hotel|habitacion(es)?|casa rural|hospederia|dormir)\b/.test(p)) return "alojamiento";
    if (/\b(paseo|bicicleta|bici|vendimia|picnic|globo|senderismo|taller|curso|ruta|segway|4x4)\b/.test(p)) return "actividad";
    if (/\b(evento|eventos|concierto|feria|festival|celebracion(es)?|bodas?)\b/.test(p)) return "evento";
    if (/\b(cata|catas|degustacion|tasting)\b/.test(p) && !/\bvisita\b/.test(p)) return "cata";
    if (/\b(visita|visitas|tour|recorrido|enoturismo)\b/.test(p)) return "visita";
    return null;
  };
  return probar(titulo) ?? probar(texto.slice(0, 400)) ?? "visita";
}

const TITULO_GENERICO = /^(enoturismo|visitas?|experiencias?|wine tourism|visit(s)?|tours?|reservas?|actividades|eventos?|enoturismo y visitas|visita la bodega|visitanos|visítanos|ven a vernos|nuestras experiencias)$/i;
const TITULO_POR_TIPO: Record<TipoServicio, string> = {
  visita: "Visita a la bodega", cata: "Cata de vinos", actividad: "Actividad en el viñedo", evento: "Eventos en la bodega",
  restaurante: "Restaurante", alojamiento: "Alojamiento",
};

export function tituloServicio(titulo: string, tipo: TipoServicio): string {
  const t = limpiarEspacios(titulo).replace(/[.:]+$/, "");
  // Frases de reclamo («¿Eres un apasionado del vino?», «Vive una experiencia única…») no son un nombre.
  if (!t || TITULO_GENERICO.test(t) || t.length > 70 || /[?¿!¡]/.test(t) || /^(vive|descubre|ven|disfruta|conoce|te invitamos)\b/i.test(t)) {
    return TITULO_POR_TIPO[tipo];
  }
  return t;
}

const CONTEXTO_PRECIO = /persona|pers\b|pax|p\.p\.|adulto|precio|pvp|desde|tarifa|entrada|ticket|por visita|\/ ?pers|iva|cada uno|importe|coste|cuesta|reserva|visita|cata|experiencia|tour/;
const NO_PRECIO = /envio|gastos|pedido|compra minima|botella|caja|descuento|ahorra|tarjeta regalo|cheque regalo|bono regalo/;

export function extraerPrecio(texto: string): number | null {
  if (/\b(gratuit[ao]s?|gratis|sin coste|free of charge)\b/i.test(texto) && !/\d\s*€/.test(texto)) return 0;
  const precios: number[] = [];
  const re = /(?:€\s*(\d{1,3}(?:[.,]\d{1,2})?)|(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|euros?\b|eur\b))/gi;
  for (const m of texto.matchAll(re)) {
    const i = m.index!;
    const antes = plano(texto.slice(Math.max(0, i - 60), i));
    const despues = plano(texto.slice(i + m[0].length, i + m[0].length + 40));
    const contexto = `${antes} ${plano(m[0])} ${despues}`;
    if (!CONTEXTO_PRECIO.test(contexto)) continue;
    // Lo que va pegado al importe manda: «6 € de gastos de envío», «botella 18 €».
    const ini = Math.max(texto.lastIndexOf(".", i - 1), texto.lastIndexOf("\n", i - 1), texto.lastIndexOf(";", i - 1), i - 60);
    const fin = i + m[0].length;
    const clausula = `${texto.slice(Math.max(ini + 1, texto.lastIndexOf(",", i - 1) + 1), i)} ${texto.slice(fin, fin + 30).split(/[.;,\n]/)[0]}`;
    if (NO_PRECIO.test(plano(clausula))) continue;
    const n = numero(m[1] ?? m[2]!);
    if (n >= 3 && n <= 500) precios.push(n);
  }
  return precios.length ? Math.min(...precios) : null;
}

const PALABRAS_NUM: Record<string, number> = { una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
const CONTEXTO_DURACION = /duracion|dura\b|duran|aproximad|aprox|tiempo|de unos|de unas|alrededor de|en torno a|visita de|cata de|experiencia de|tour de|ruta de|actividad de|recorrido de/;

/**
 * Duración en minutos: «dura 2 horas», «Duración: 1h 30 min», «1h30», «1,5 h», «hora y media»,
 * «90 minutos aprox.», «Duración: 1.20» (formato h.mm). Nunca horarios («de 10:00 h a 14:00 h»).
 */
export function extraerDuracion(texto: string): number | null {
  const p = plano(texto);
  if (/\b(duracion|dura)\b[^.\n]{0,20}\bhora y media\b|\bhora y media de (visita|cata|duracion|recorrido)/.test(p)) return 90;
  if (/\b(duracion|dura)\b[^.\n]{0,20}\bmedia hora\b/.test(p)) return 30;
  const fm = p.match(/\bduracion\s*:?\s*(\d)[.:](\d{2})\b(?!\s*(?:h\b|horas?))/);
  if (fm) {
    const min = Number(fm[1]) * 60 + Number(fm[2]);
    if (Number(fm[2]) < 60 && min >= 15 && min <= 600) return min;
  }
  const re = /(\d{1,2}(?:[.,]5)?|una|un|dos|tres|cuatro|cinco)\s*(?:h(?=\d|\b)|hrs?\b|horas?\b|hours?\b)(?:\s*(?:y\s*)?(\d{1,2})\s*(?:min\w*|')?|\s+y\s+media)?|\b(\d{2,3})\s*(?:min\b|mins\b|minutos\b|minutes\b|')/g;
  for (const m of p.matchAll(re)) {
    const i = m.index!;
    const antes = p.slice(Math.max(0, i - 40), i);
    const despues = p.slice(i + m[0].length, i + m[0].length + 25);
    // Horarios: «de 10:00 h a 14:00», «a las 12 h», «10 h».
    if (/(\d[:.]\d{2}\s*$)|\b(a las|de las|desde las|hasta las|horario|abierto|apertura|cierre)\b[^.]{0,15}$/.test(antes) || /^\s*(a|-)\s*\d/.test(despues) || /\d[:.]$/.test(antes)) continue;
    if (!CONTEXTO_DURACION.test(antes) && !/^\s*(de duracion|aprox|aproximad|de visita|de cata|de recorrido)/.test(despues)) continue;
    let min: number;
    if (m[3]) min = Number(m[3]);
    else {
      const h = PALABRAS_NUM[m[1]!] ?? numero(m[1]!);
      min = h * 60 + (m[2] ? Number(m[2]) : /y media/.test(m[0]) ? 30 : 0);
    }
    if (min >= 15 && min <= 600) return Math.round(min);
  }
  return null;
}

const NOMBRES_IDIOMA = Object.keys(IDIOMAS).join("|");
/** Frase que habla del idioma de la visita (no de mercados de exportación ni de la web). */
const FRASE_IDIOMA = new RegExp(
  `idioma|language|disponible(s)? en|visitas? (guiadas? )?en|guiad[ao]s? en|realiza(n|mos)? en|tours? in|en (${NOMBRES_IDIOMA})( (y|e|o|,) ?(${NOMBRES_IDIOMA}))+|in (${NOMBRES_IDIOMA})( (and|or|,) ?(${NOMBRES_IDIOMA}))+|^(${NOMBRES_IDIOMA})( ?(\\/|,|y|e|-) ?(${NOMBRES_IDIOMA}))+$`,
);

export function extraerIdiomas(texto: string): string[] {
  const frases = plano(texto)
    .split(/[.\n;|]/)
    .map((f) => f.trim())
    .filter((f) => FRASE_IDIOMA.test(f) && !/export|mercados?|paises|web|pagina|traduc/.test(f));
  const out: string[] = [];
  for (const f of frases) {
    for (const [palabra, iso] of Object.entries(IDIOMAS)) {
      if (new RegExp(`\\b${palabra}\\b`).test(f) && !out.includes(iso)) out.push(iso);
    }
  }
  return out;
}

export function urlReserva(enlacesPagina: Enlace[], host: string): string | null {
  const candidatos = enlacesPagina.filter((e) => {
    const u = e.url.toLowerCase();
    if (PLATAFORMAS_RESERVA.some((p) => u.includes(p))) return true;
    return /\b(reserv\w*|book(ing)?|comprar entradas?|comprar visita|tickets?|entradas)\b/i.test(e.texto) && !/\b(vinos|tienda|carrito)\b/i.test(e.texto);
  });
  // Una plataforma externa de reservas pesa más que un enlace interno «Reservar».
  candidatos.sort((a, b) => Number(new URL(a.url).host === host) - Number(new URL(b.url).host === host));
  return candidatos[0]?.url ?? null;
}

export function extraerContacto(texto: string, dominio: string): { email: string | null; telefono: string | null } {
  const emails = [...texto.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((m) => m[0].toLowerCase());
  const email =
    emails.find((e) => /enoturismo|visitas?|reservas?|turismo|experiencias?/.test(e)) ??
    emails.find((e) => e.endsWith(`@${dominio}`) || e.endsWith(`.${dominio}`)) ??
    null;
  const tel = texto.match(/(?:\+34\s?)?\b([6789]\d{2})[\s.-]?(\d{2,3})[\s.-]?(\d{2,3})[\s.-]?(\d{0,3})\b/);
  let telefono: string | null = null;
  if (tel) {
    const d = (tel[1]! + tel[2]! + tel[3]! + (tel[4] ?? "")).replace(/\D/g, "");
    if (d.length === 9) telefono = `+34 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return { email, telefono };
}

/** Un servicio a partir del título y el texto de su página o sección. */
export function extraerServicio(titulo: string, texto: string, enlacesPagina: Enlace[], host: string, dominio: string): ServicioWeb {
  const tipo = tipoServicio(titulo, texto);
  const contacto = extraerContacto(texto, dominio);
  const detalle = extraerDetalle(`${titulo}\n${texto}`);
  const s = {
    tipo,
    titulo: tituloServicio(titulo, tipo),
    precio_desde: extraerPrecio(texto),
    duracion_minutos: extraerDuracion(texto),
    idiomas: extraerIdiomas(texto),
    url_reserva: urlReserva(enlacesPagina, host),
    email: contacto.email,
    telefono: contacto.telefono,
    ...detalle,
  };
  return { ...s, descripcion: descripcionServicio(s) };
}

/** Secciones de una página por encabezados h2–h4 (título + texto). */
export function secciones(bs: Bloque[]): { titulo: string; texto: string }[] {
  const out: { titulo: string; texto: string[] }[] = [];
  for (const b of bs) {
    if (/^h[2-4]$/.test(b.tipo) && b.texto.length <= 90) out.push({ titulo: b.texto, texto: [] });
    else if (out.length) out[out.length - 1]!.texto.push(b.texto);
  }
  return out.map((s) => ({ titulo: s.titulo, texto: s.texto.join("\n") }));
}
