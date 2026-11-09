// Enoturismo (fase B): qué incluye cada experiencia, número de vinos de la cata,
// personas, días y temporada, todo con vocabulario cerrado, y una descripción
// propia por plantilla. Nunca se copia el texto de la web.
import { plano } from "./diccionarios.ts";

/** Vocabulario cerrado de «qué incluye». */
export type Incluye =
  | "visita_vinedo" | "visita_bodega" | "sala_barricas" | "calado" | "cata" | "cata_comentada" | "aperitivo"
  | "maridaje" | "comida" | "menu_degustacion" | "copa_regalo" | "botella_regalo" | "guia" | "transporte"
  | "actividad_vendimia" | "paseo";

const INCLUYE: [Incluye, RegExp][] = [
  ["visita_vinedo", /\b(visita (?:a|al|a los|por el|por los) vinedos?|recorrido (?:por|entre) (?:el|los|las) (?:vinedos?|vinas)|paseo (?:por|entre) (?:el|los|las) (?:vinedos?|vinas)|en el vinedo)\b/],
  ["visita_bodega", /\b(visita (?:a|de) (?:la|nuestra) bodega|visita (?:a|de) las instalaciones|recorrido por (?:la|nuestra) bodega|sala de elaboracion|zona de elaboracion|depositos)\b/],
  ["sala_barricas", /\b(sala de barricas|nave de barricas|parque de barricas|sala de crianza)\b/],
  ["calado", /\b(calados?|cueva|bodega subterranea|galerias subterraneas)\b/],
  ["cata_comentada", /\b(cata (?:comentada|guiada|dirigida)|dirigida por (?:el|nuestro|nuestra) enolog[oa])\b/],
  ["cata", /\b(cata|catas|degustacion|tasting)\b/],
  ["aperitivo", /\b(aperitivo|picoteo|tapas?|pinchos?|embutidos?|quesos?)\b/],
  ["maridaje", /\b(maridaje|maridada|maridado|maridar)\b/],
  ["menu_degustacion", /\b(menu degustacion)\b/],
  ["comida", /\b(comida|almuerzo|cena|menu|lechazo|asado)\b/],
  ["copa_regalo", /\b(copa de regalo|regalo de (?:la|una) copa|te llevas la copa|copa en propiedad)\b/],
  ["botella_regalo", /\b(botella de regalo|regalo de una botella|te llevas una botella)\b/],
  ["guia", /\b(guiad[ao]s?|guia)\b/],
  ["transporte", /\b(transporte|traslados?|autobus|recogida en)\b/],
  ["actividad_vendimia", /\b(vendimia|vendimiar)\b/],
  ["paseo", /\b(paseo|ruta a pie|bicicleta|senderismo|e-bike)\b/],
];

const NUM: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const num = (s: string) => NUM[s] ?? Number(s);

export interface DetalleServicio {
  incluye: Incluye[];
  vinos_cata: number | null;
  personas_min: number | null;
  personas_max: number | null;
  /** Días y forma de reserva en vocabulario cerrado («sábados y domingos · con reserva previa»). */
  horario: string | null;
  /** «todo el año», «de abril a octubre»… */
  temporada: string | null;
}

export function extraerDetalle(texto: string): DetalleServicio {
  const p = plano(texto);
  const incluye: Incluye[] = [];
  for (const [k, re] of INCLUYE) if (re.test(p)) incluye.push(k);
  // «cata comentada» implica cata; «menú degustación» no es además «comida» genérica.
  if (incluye.includes("cata_comentada") && !incluye.includes("cata")) incluye.push("cata");
  const iComida = incluye.indexOf("comida");
  if (incluye.includes("menu_degustacion") && iComida >= 0) incluye.splice(iComida, 1);

  const vc = p.match(/\b(?:cata|degustacion|catamos|probaras|probamos|prueba)\s+(?:comentada\s+|guiada\s+)?de\s+(\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho)\s+(?:de\s+nuestros\s+)?vinos\b/) ??
    p.match(/\b(\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho)\s+(?:de\s+nuestros\s+)?vinos\b(?=[^.]{0,40}\b(?:cata|degust|probar))/);
  const vinos = vc ? num(vc[1]!) : NaN;

  const min = p.match(/\b(?:minimo|desde|a partir de)\s+(?:de\s+)?(\d{1,3}|dos|tres|cuatro|cinco|seis|ocho|diez)\s+(?:personas|pax|participantes|adultos)\b/);
  const max = p.match(/\b(?:maximo|hasta|aforo(?: maximo)?(?: de)?)\s+(?:de\s+)?(\d{1,3})\s+(?:personas|pax|participantes|plazas)\b/);
  const rango = p.match(/\bgrupos?\s+(?:de\s+)?(\d{1,3})\s+(?:a|-)\s+(\d{1,3})\s+(?:personas|pax)\b/);
  let pmin = rango ? Number(rango[1]) : min ? num(min[1]!) : null;
  let pmax = rango ? Number(rango[2]) : max ? Number(max[1]) : null;
  if (pmin != null && (pmin < 1 || pmin > 100)) pmin = null;
  if (pmax != null && (pmax < 1 || pmax > 500 || (pmin != null && pmax < pmin))) pmax = null;

  return {
    incluye,
    vinos_cata: vinos >= 1 && vinos <= 15 ? vinos : null,
    personas_min: pmin,
    personas_max: pmax,
    horario: horario(p),
    temporada: temporada(p),
  };
}

const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabados?", "domingos?"];
const DIA_LEGIBLE: Record<string, string> = { lunes: "lunes", martes: "martes", miercoles: "miércoles", jueves: "jueves", viernes: "viernes", sabado: "sábado", sabados: "sábados", domingo: "domingo", domingos: "domingos" };

function horario(p: string): string | null {
  const partes: string[] = [];
  const rango = p.match(new RegExp(`\\bde (${DIAS.join("|")}) a (${DIAS.join("|")})\\b`));
  if (rango) partes.push(`de ${DIA_LEGIBLE[rango[1]!]} a ${DIA_LEGIBLE[rango[2]!]}`);
  else if (/\btodos los dias\b|\bcada dia\b|\b365 dias\b/.test(p)) partes.push("todos los días");
  else if (/\bfines? de semana\b/.test(p)) partes.push("fines de semana");
  else if (/\bsabados? y domingos?\b/.test(p)) partes.push("sábados y domingos");
  else if (/\bsabados?\b/.test(p) && /\b(visita|cata|horario)/.test(p)) partes.push("sábados");
  if (/\b(cita previa|previa reserva|reserva previa|con reserva|bajo reserva|imprescindible reservar|necesario reservar)\b/.test(p)) partes.push("con reserva previa");
  return partes.length ? partes.join(" · ") : null;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function temporada(p: string): string | null {
  if (/\btodo el ano\b|\bdurante todo el ano\b/.test(p)) return "todo el año";
  const m = p.match(new RegExp(`\\bde (${MESES.join("|")}) a (${MESES.join("|")})\\b`));
  if (m) return `de ${m[1]} a ${m[2]}`;
  if (/\b(solo|unicamente) (en|durante) (la )?vendimia\b|\bepoca de vendimia\b/.test(p)) return "en vendimia";
  return null;
}

const INCLUYE_TEXTO: Record<Incluye, string> = {
  visita_vinedo: "visita al viñedo", visita_bodega: "visita a la bodega", sala_barricas: "sala de barricas",
  calado: "calado o cueva", cata: "cata", cata_comentada: "cata comentada", aperitivo: "aperitivo",
  maridaje: "maridaje", comida: "comida", menu_degustacion: "menú degustación", copa_regalo: "copa de regalo",
  botella_regalo: "botella de regalo", guia: "guía", transporte: "transporte", actividad_vendimia: "actividad de vendimia",
  paseo: "paseo",
};
const IDIOMA_TEXTO: Record<string, string> = { es: "español", en: "inglés", fr: "francés", de: "alemán", it: "italiano", pt: "portugués", zh: "chino", ja: "japonés", ru: "ruso", nl: "neerlandés" };

function lista(items: string[]): string {
  return items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Descripción propia del servicio (para `servicios_bodega.descripcion`): solo enuncia hechos
 * extraídos. null si no hay nada que decir.
 */
export function descripcionServicio(s: { duracion_minutos: number | null; idiomas: string[]; precio_desde: number | null } & DetalleServicio): string | null {
  const frases: string[] = [];
  const inc = s.incluye.filter((k) => !(k === "cata" && s.incluye.includes("cata_comentada")) && k !== "guia");
  const piezas = inc.map((k) => (k === "cata" || k === "cata_comentada") && s.vinos_cata ? `${INCLUYE_TEXTO[k]} de ${s.vinos_cata} vinos` : INCLUYE_TEXTO[k]);
  if (piezas.length) frases.push(`Incluye ${lista(piezas)}${s.incluye.includes("guia") ? ", con guía" : ""}.`);
  const datos: string[] = [];
  if (s.duracion_minutos) datos.push(`unos ${s.duracion_minutos} min`);
  if (s.idiomas.length) datos.push(`en ${lista(s.idiomas.map((i) => IDIOMA_TEXTO[i] ?? i))}`);
  if (datos.length) frases.push(`${datos.join(", ").replace(/^./, (c) => c.toUpperCase())}.`);
  if (s.personas_min && s.personas_max) frases.push(`Grupos de ${s.personas_min} a ${s.personas_max} personas.`);
  else if (s.personas_min && s.personas_min > 1) frases.push(`Mínimo ${s.personas_min} personas.`);
  else if (s.personas_max) frases.push(`Hasta ${s.personas_max} personas.`);
  if (s.horario) frases.push(`${s.horario.replace(/^./, (c) => c.toUpperCase()).replace(" · ", ", ")}.`);
  if (s.temporada) frases.push(`Disponible ${s.temporada}.`);
  return frases.length ? frases.join(" ") : null;
}
