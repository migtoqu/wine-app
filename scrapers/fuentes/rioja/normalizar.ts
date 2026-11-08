// C.R. DOCa Rioja: de ficha cruda a campos del catálogo + `datos` de registros_fuente.
import { normalizarCodigoPostal, normalizarEmail, normalizarTelefono, normalizarWeb } from "../../lib/contacto.ts";
import { comunidadDeProvincia, puntoEnEspana, puntoEwkt } from "../../lib/geo.ts";
import { capitalizarSiMayusculas, claveNombreBodega, claveTexto, limpiarEspacios, nombreBodegaParaMostrar } from "../../lib/texto.ts";
import { parsearPrecio, type FichaBodega, type FichaExperiencia, type FichaVino, type Filas } from "./parsear.ts";

// ---------------------------------------------------------------------------
// Provincia y comunidad: la D.O.Ca. abarca La Rioja, Álava (Rioja Alavesa), Navarra y algo de Burgos.
// Nunca se da La Rioja por defecto: se deduce del código postal, de una tabla de municipios o de la zona.
// ---------------------------------------------------------------------------

const PROVINCIA_POR_CP: Record<string, string> = { "01": "Álava", "09": "Burgos", "26": "La Rioja", "31": "Navarra" };

// Municipios de la D.O.Ca. que no están en La Rioja (el resto se deduce del código postal).
const MUNICIPIOS_ALAVA = [
  "Laguardia", "Oyón", "Oyón-Oion", "Elciego", "Labastida", "Samaniego", "Leza", "Navaridas", "Baños de Ebro",
  "Mañueta", "Villabuena de Álava", "Elvillar", "Lanciego", "Yécora", "Moreda de Álava", "Cripán", "Kripan",
  "Lapuebla de Labarca", "Barriobusto", "Salinillas de Buradón", "Paganos", "Páganos",
];
const MUNICIPIOS_NAVARRA = [
  "Viana", "Aras", "Los Arcos", "Mendavia", "Lodosa", "Sartaguda", "Andosilla", "San Adrián", "Azagra",
  "Cárcar", "Lerín", "Sesma", "Cabredo", "Desojo", "Torres del Río", "Sansol", "Armañanzas", "Bargota",
  "Falces", "Funes", "Marcilla", "Peralta", "Milagro", "Cadreita", "Villafranca", "Ablitas", "Cintruénigo",
];
const MUNICIPIOS_BURGOS = ["Berantevilla", "Miranda de Ebro", "Bañuelos de Bureba", "Briviesca"];

const PROVINCIA_POR_MUNICIPIO = new Map<string, string>([
  ...MUNICIPIOS_ALAVA.map((m) => [claveTexto(m), "Álava"] as const),
  ...MUNICIPIOS_NAVARRA.map((m) => [claveTexto(m), "Navarra"] as const),
  ...MUNICIPIOS_BURGOS.map((m) => [claveTexto(m), "Burgos"] as const),
]);

export function provinciaDe(codigoPostal: string | null, municipio: string | null, zona: string | null): string | null {
  const porCp = codigoPostal ? PROVINCIA_POR_CP[codigoPostal.slice(0, 2)] : undefined;
  if (porCp) return porCp;
  if (municipio) {
    const p = PROVINCIA_POR_MUNICIPIO.get(claveTexto(municipio));
    if (p) return p;
  }
  // «Rioja Alavesa» es, por definición, Álava. Rioja Alta y Oriental no bastan: pueden ser La Rioja o Navarra.
  if (zona && /alavesa/i.test(zona)) return "Álava";
  return null;
}

// ---------------------------------------------------------------------------
// Bodegas
// ---------------------------------------------------------------------------

export interface CamposBodega {
  nombre: string;
  direccion: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  provincia: string | null;
  comunidad: string | null;
  ubicacion: string | null; // EWKT
  web: string | null;
  telefono: string | null;
  email: string | null;
  anio_fundacion: number | null;
}

export interface BodegaNormalizada {
  idExterno: string;
  url: string;
  campos: CamposBodega;
  /** Hechos del registro (los convierte `guardar.ts` a `Hecho` con fuente y fecha). */
  hechos: { clave: "bodega.nombre" | "bodega.municipio" | "bodega.provincia" | "bodega.denominacion" | "bodega.fundacion_anio" | "bodega.enoturismo"; valor: string | number | boolean }[];
  clave_nombre: string;
  datos: FichaBodega & { campos: CamposBodega; clave_nombre: string };
}

/** «Bodega familiar desde 1932 - …» / «fundada en 1932»: solo patrones inequívocos y años plausibles. */
export function anioFundacion(destacado: string | null): number | null {
  if (!destacado) return null;
  const m = /\b(?:desde|fundad[ao]s?(?:\s+en)?|fundaci[oó]n\s+en|en)\s+(1[5-9]\d\d|20[0-2]\d)\b/i.exec(destacado);
  if (!m || !/(?:desde|fundad|fundaci)/i.test(m[0])) return null;
  const n = Number(m[1]);
  return n >= 1500 && n <= new Date().getFullYear() ? n : null;
}

/** «Avda. Vizcaya, 2, 26200 Haro» → calle y código postal. El municipio sale del encabezado. */
export function partirDireccion(texto: string | null): { calle: string | null; cp: string | null } {
  if (!texto) return { calle: null, cp: null };
  const m = /^(.*?),?\s*\b(\d{5})\b/.exec(texto);
  if (!m) return { calle: limpiarEspacios(texto) || null, cp: null };
  const calle = limpiarEspacios(m[1]!).replace(/,$/, "");
  return { calle: calle ? capitalizarSiMayusculas(calle) : null, cp: normalizarCodigoPostal(m[2]!) };
}

export function normalizarBodega(f: FichaBodega): BodegaNormalizada {
  const { calle, cp } = partirDireccion(f.contacto.direccion_texto);
  const municipio = f.municipio ? capitalizarSiMayusculas(f.municipio) : null;
  const provincia = provinciaDe(cp, municipio, f.zona);
  const campos: CamposBodega = {
    nombre: nombreBodegaParaMostrar(f.nombre),
    direccion: calle,
    codigo_postal: cp,
    municipio,
    provincia,
    comunidad: comunidadDeProvincia(provincia),
    ubicacion: f.ubicacion && puntoEnEspana(f.ubicacion) ? puntoEwkt(f.ubicacion) : null,
    web: normalizarWeb(f.contacto.web),
    telefono: normalizarTelefono(f.contacto.telefono),
    email: normalizarEmail(f.contacto.email),
    anio_fundacion: anioFundacion(f.destacado),
  };
  const visitas = f.servicios_destacados.some((s) => /visita/i.test(s));
  const hechos: BodegaNormalizada["hechos"] = [{ clave: "bodega.nombre", valor: campos.nombre }];
  if (campos.municipio) hechos.push({ clave: "bodega.municipio", valor: campos.municipio });
  if (campos.provincia) hechos.push({ clave: "bodega.provincia", valor: campos.provincia });
  hechos.push({ clave: "bodega.denominacion", valor: "Rioja" });
  if (campos.anio_fundacion) hechos.push({ clave: "bodega.fundacion_anio", valor: campos.anio_fundacion });
  if (visitas) hechos.push({ clave: "bodega.enoturismo", valor: true });
  const clave_nombre = claveNombreBodega(f.nombre);
  return { idExterno: `bodega:${f.slug_fuente}`, url: f.url, campos, hechos, clave_nombre, datos: { ...f, campos, clave_nombre } };
}

// ---------------------------------------------------------------------------
// Vinos
// ---------------------------------------------------------------------------

export type TipoVino = "tinto" | "blanco" | "rosado" | "espumoso" | "generoso" | "dulce" | "naranja";
export type Crianza = "joven" | "roble" | "crianza" | "reserva" | "gran_reserva" | "otra";

const TIPOS: Record<string, TipoVino> = {
  tinto: "tinto", blanco: "blanco", rosado: "rosado", espumoso: "espumoso", generoso: "generoso",
  dulce: "dulce", naranja: "naranja", clarete: "rosado",
};

export function tipoVino(texto: string | null): TipoVino | null {
  const c = claveTexto(texto ?? "");
  return TIPOS[c] ?? Object.entries(TIPOS).find(([k]) => c.split(" ").includes(k))?.[1] ?? null;
}

/** Crianza por palabras («Gran Reserva», «Crianza», «Roble», «Joven»); «Genérico» no dice nada. */
export function crianzaDe(...textos: (string | null)[]): Crianza | null {
  for (const texto of textos) {
    const c = ` ${claveTexto(texto ?? "")} `;
    if (/ gran reserva /.test(c)) return "gran_reserva";
    if (/ reserva /.test(c)) return "reserva";
    if (/ crianza /.test(c)) return "crianza";
    if (/ (roble|semicrianza|semi crianza|barrica) /.test(c)) return "roble";
    if (/ (joven|sin crianza|cosecha) /.test(c)) return "joven";
  }
  return null;
}

/** Quita una añada final del nombre («Irujo Crianza 2018» → «Irujo Crianza», 2018). */
export function separarAnada(nombre: string, anadaTexto: string | null): { nombre: string; anio: number | null } {
  const limpio = limpiarEspacios(nombre);
  const m = /^(.*\S)\s+((?:19|20)\d\d)$/.exec(limpio);
  const delCampo = /^(?:19|20)\d\d$/.test((anadaTexto ?? "").trim()) ? Number(anadaTexto!.trim()) : null;
  if (m) return { nombre: m[1]!, anio: delCampo ?? Number(m[2]) };
  return { nombre: limpio, anio: delCampo };
}

export interface VinoNormalizado {
  idExterno: string;
  url: string;
  vino: { nombre: string; tipo: TipoVino | null; crianza: Crianza | null };
  anada: { anio: number | null };
  variedades: { nombre: string; porcentaje: number | null }[];
  /** Nombre de la bodega tal como lo da la ficha (para resolver la bodega). */
  bodega_texto: string | null;
  clave_bodega: string;
  hechos: { clave: "vino.nombre" | "vino.tipo" | "vino.crianza" | "vino.denominacion" | "anada.anio" | "anada.variedad"; valor: string | number | null; sujeto?: string }[];
  datos: FichaVino & { vino: { nombre: string; tipo: TipoVino | null; crianza: Crianza | null }; anio: number | null };
}

export function normalizarVino(f: FichaVino): VinoNormalizado {
  const { nombre, anio } = separarAnada(f.nombre, f.anada_texto);
  const tipo = tipoVino(f.tipo_texto);
  const crianza = crianzaDe(f.envejecimiento_texto, nombre);
  const variedades = f.uvas.map((u) => ({ nombre: u, porcentaje: null }));
  const hechos: VinoNormalizado["hechos"] = [{ clave: "vino.nombre", valor: nombre }];
  if (tipo) hechos.push({ clave: "vino.tipo", valor: tipo });
  if (crianza) hechos.push({ clave: "vino.crianza", valor: crianza });
  hechos.push({ clave: "vino.denominacion", valor: "Rioja" });
  if (anio) hechos.push({ clave: "anada.anio", valor: anio });
  for (const v of variedades) hechos.push({ clave: "anada.variedad", valor: null, sujeto: v.nombre });
  return {
    idExterno: `vino:${f.slug_fuente}`,
    url: f.url,
    vino: { nombre, tipo, crianza },
    anada: { anio },
    variedades,
    bodega_texto: f.bodega_texto,
    clave_bodega: claveNombreBodega(f.bodega_texto ?? ""),
    hechos,
    datos: { ...f, vino: { nombre, tipo, crianza }, anio },
  };
}

// ---------------------------------------------------------------------------
// Experiencias → servicios_bodega
// ---------------------------------------------------------------------------

export type TipoServicio = "cata" | "visita" | "restaurante" | "alojamiento" | "evento" | "otra" | "actividad";

const reglas: [TipoServicio, RegExp][] = [
  ["alojamiento", /alojamiento|hotel|duerm|pernoct|noche en/],
  ["visita", /\bvisita/],
  ["cata", /\b(cata|catas|degustaci|maridaje)/],
  ["restaurante", /comida|restaurante|gastronom|almuerzo|men[uú]|cena|brunch|desayuno/],
  ["evento", /evento|mice|empresa|boda|celebraci|team|incentivo|profesional/],
];

/** Tipo a partir del título (manda) y de lo que incluye; sin pistas, «actividad». */
export function tipoServicio(titulo: string, incluye: string[]): TipoServicio {
  for (const texto of [claveTexto(titulo), claveTexto(incluye.join(" "))]) {
    for (const [tipo, re] of reglas) if (re.test(texto)) return tipo;
  }
  return "actividad";
}

/** Precio más bajo de una fila PVP («Desde 25€», «Niños: 8€», «Adultos: 26€»). Gratuito = 0. */
export function precioDesde(filas: string[] | undefined): number | null {
  if (!filas || filas.length === 0) return null;
  if (filas.every((f) => /gratuit|gratis/i.test(f))) return 0;
  const precios = filas.map((f) => parsearPrecio(f.replace(/^[^:]*:/, ""))).filter((n): n is number => n != null && n >= 0);
  return precios.length ? Math.min(...precios) : null;
}

/** «2h», «1h 30min», «90 min», «2 horas» → minutos. */
export function duracionMinutos(filas: string[] | undefined): number | null {
  const texto = (filas ?? []).join(" ").toLowerCase();
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h\b|hs?\b|horas?)/.exec(texto);
  const m = /(\d+)\s*(?:min|m\b|minutos?)/.exec(texto);
  let min = 0;
  if (h) min += Math.round(Number(h[1]!.replace(",", ".")) * 60);
  if (m) min += Number(m[1]);
  if (!h && !m) return null;
  return min > 0 && min <= 24 * 60 ? min : null;
}

const IDIOMAS: Record<string, string> = {
  castellano: "es", espanol: "es", spanish: "es", ingles: "en", english: "en", frances: "fr", aleman: "de",
  italiano: "it", portugues: "pt", euskera: "eu", vasco: "eu", catalan: "ca", chino: "zh", japones: "ja",
  ruso: "ru", holandes: "nl", neerlandes: "nl",
};

export function idiomasDe(filas: string[] | undefined): string[] {
  const out: string[] = [];
  for (const parte of (filas ?? []).join(",").split(/[,/;]|\s+y\s+/)) {
    const codigo = IDIOMAS[claveTexto(parte)];
    if (codigo && !out.includes(codigo)) out.push(codigo);
  }
  return out;
}

/** Horario/temporada como texto corto: «Todo el año · Sábados, Domingos: 10:30 a 12:30». */
export function horarioDe(info: Filas): string | null {
  const temporada = (info["Temporada"] ?? []).join(", ");
  const horario = (info["Horario"] ?? info["Horarios"] ?? []).join("; ");
  const texto = [temporada && temporada[0]!.toUpperCase() + temporada.slice(1), horario].filter(Boolean).join(" · ");
  return texto ? limpiarEspacios(texto) : null;
}

export interface CamposServicio {
  precio_desde: number | null;
  duracion_minutos: number | null;
  idiomas: string[];
  horario: string | null;
  url_reserva: string | null;
}

export interface ServicioNormalizado {
  idExterno: string;
  url: string;
  titulo: string;
  tipo: TipoServicio;
  /** Slug de la bodega (id externo `bodega:<slug>`) o null si la ficha no la enlaza. */
  bodega_slug: string | null;
  campos: CamposServicio;
  datos: FichaExperiencia & { tipo: TipoServicio; campos: CamposServicio };
}

export function normalizarExperiencia(f: FichaExperiencia): ServicioNormalizado {
  const titulo = limpiarEspacios(f.titulo);
  const tipo = tipoServicio(titulo, f.incluye);
  const reserva = f.url_reserva && /^https?:\/\//i.test(f.url_reserva) ? f.url_reserva : null;
  const campos: CamposServicio = {
    precio_desde: precioDesde(f.info["PVP"]),
    duracion_minutos: duracionMinutos(f.info["Duración"]),
    idiomas: idiomasDe(f.info["Idiomas"]),
    horario: horarioDe(f.info),
    url_reserva: reserva,
  };
  return {
    idExterno: `exp:${f.slug_fuente}`,
    url: f.url,
    titulo,
    tipo,
    bodega_slug: f.bodega_slug,
    campos,
    datos: { ...f, tipo, campos },
  };
}

// ---------------------------------------------------------------------------
// Vino → bodega (la ficha del vino solo trae el nombre de la bodega)
// ---------------------------------------------------------------------------

export interface BodegaClave {
  idExterno: string;
  clave: string;
}

export type MotivoResolucion = "enlace" | "nombre" | "hermano" | "ambigua" | "sin_candidata";

export interface ResolucionBodega {
  idExterno: string | null;
  motivo: MotivoResolucion;
  candidatos: string[];
}
