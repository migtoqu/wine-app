// Puerta legal por sitio (SCOPE §7.3, SOURCES §3): lista de exclusión manual,
// bloqueos HTTP y anti-bot, robots.txt (incluido Content-Signal) y cláusulas
// del aviso legal que prohíban el rastreo o la extracción automatizada. Un
// sitio que no la pasa se marca y se salta: nunca se insiste ni se elude.
import { readFileSync } from "node:fs";
import { plano } from "./diccionarios.ts";
import type { Enlace } from "./html.ts";

export type MotivoSalto =
  | "exclusion_manual"
  | "desactivada"
  | "bloqueo_http"
  | "anti_bot"
  | "inaccesible"
  | "robots"
  | "content_signal"
  | "clausula_legal"
  | "sin_html"
  | "otro_dominio_compartido"
  | "no_verificada";

export interface ResultadoPuerta {
  apta: boolean;
  motivo: MotivoSalto | null;
  detalle: string | null;
  /** Fecha ISO de la comprobación. */
  fecha: string;
  host: string;
  /** Host inicial si la portada redirigió a otro dominio. */
  redirigida_desde: string | null;
  robots: { status: "ok" | "sin_robots"; content_signal: Record<string, string> | null };
  aviso_legal: { url: string | null; coincidencias: string[]; fragmento: string | null } | null;
  /** Señales que hoy no bloquean pero hay que respetar si los resúmenes pasan a un LLM. */
  senales_ia: string[];
}

// ---------------------------------------------------------------------------
// Exclusiones manuales
// ---------------------------------------------------------------------------

export interface Exclusiones {
  excluidos: { dominio: string; motivo: string; fecha: string }[];
  /** Falsos positivos de la heurística revisados a mano: se rastrean igualmente. */
  permitidos: { dominio: string; motivo: string; fecha: string }[];
}

export function cargarExclusiones(ruta = new URL("./exclusiones.json", import.meta.url)): Exclusiones {
  return JSON.parse(readFileSync(ruta, "utf8")) as Exclusiones;
}

export function exclusionDe(ex: Exclusiones, dominio: string) {
  return ex.excluidos.find((e) => dominio === e.dominio || dominio.endsWith(`.${e.dominio}`)) ?? null;
}

export function permitidoManual(ex: Exclusiones, dominio: string): boolean {
  return ex.permitidos.some((e) => dominio === e.dominio || dominio.endsWith(`.${e.dominio}`));
}

// ---------------------------------------------------------------------------
// Anti-bot
// ---------------------------------------------------------------------------

const DESAFIOS: [RegExp, string][] = [
  [/<title>\s*just a moment\.{0,3}\s*<\/title>|cf-browser-verification|challenges\.cloudflare\.com|cf_chl_opt|__cf_chl_/i, "Cloudflare"],
  [/sgcaptcha|\.well-known\/sgcaptcha/i, "SiteGround captcha"],
  [/_Incapsula_Resource|incapsula incident/i, "Imperva/Incapsula"],
  [/sucuri website firewall|sucuri-firewall|cloudproxy/i, "Sucuri"],
  [/<title>\s*(?:attention required|access denied|acceso denegado)/i, "WAF"],
  [/ddos-guard|checking your browser before accessing/i, "DDoS-Guard"],
  [/captcha-delivery\.com|datadome/i, "DataDome"],
];

/** Nombre del sistema anti-bot si el HTML es una página de desafío, o null. */
export function detectarAntiBot(html: string): string | null {
  // Una página real tiene contenido; los desafíos suelen pesar poco.
  for (const [re, nombre] of DESAFIOS) if (re.test(html.slice(0, 20_000))) return nombre;
  return null;
}

// ---------------------------------------------------------------------------
// robots.txt: Content-Signal
// ---------------------------------------------------------------------------

/**
 * `Content-Signal: search=yes, ai-input=no, ai-train=no` (contentsignals.org) aplicable a nuestro
 * grupo de User-agent (o a `*`). Devuelve el último valor de cada señal, o null si no hay.
 */
export function contentSignal(robotsTxt: string | null, token = "wine-app-bot"): Record<string, string> | null {
  if (!robotsTxt) return null;
  const grupos: { agentes: string[]; senales: Record<string, string> }[] = [];
  let actual: { agentes: string[]; senales: Record<string, string> } | null = null;
  let ultimaFueAgente = false;
  const sueltas: Record<string, string> = {};
  for (const linea of robotsTxt.split(/\r?\n/)) {
    const l = linea.replace(/#.*/, "").trim();
    const m = l.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const clave = m[1]!.toLowerCase();
    const valor = m[2]!.trim();
    if (clave === "user-agent") {
      if (!actual || !ultimaFueAgente) {
        actual = { agentes: [], senales: {} };
        grupos.push(actual);
      }
      actual.agentes.push(valor.toLowerCase());
      ultimaFueAgente = true;
      continue;
    }
    ultimaFueAgente = false;
    if (clave !== "content-signal") continue;
    const destino = actual ? actual.senales : sueltas;
    for (const par of valor.split(",")) {
      const [k, v] = par.split("=").map((x) => x?.trim().toLowerCase());
      if (k && v) destino[k] = v;
    }
  }
  const propio = grupos.find((g) => g.agentes.includes(token.toLowerCase()));
  const general = grupos.find((g) => g.agentes.includes("*"));
  const senales = { ...sueltas, ...(general?.senales ?? {}), ...(propio?.senales ?? {}) };
  return Object.keys(senales).length ? senales : null;
}

/** `search=no` bloquea (un catálogo navegable es búsqueda); ai-* y noai solo se registran. */
export function evaluarSenales(cs: Record<string, string> | null, directivas: string[]): { bloquea: boolean; ia: string[] } {
  const ia: string[] = [];
  if (cs) for (const [k, v] of Object.entries(cs)) if (k.startsWith("ai-") && v === "no") ia.push(`content-signal ${k}=no`);
  for (const d of directivas) if (d === "noai" || d === "noimageai") ia.push(d);
  return { bloquea: cs?.search === "no", ia: [...new Set(ia)] };
}

// ---------------------------------------------------------------------------
// Aviso legal
// ---------------------------------------------------------------------------

const ENLACE_LEGAL = /aviso[\s-]*legal|nota[\s-]*legal|t[ée]rminos(?:[\s-]+y[\s-]+condiciones)?(?:[\s-]+de[\s-]+uso)?|condiciones[\s-]+(?:de[\s-]+uso|generales)|legal[\s-]*notice|terms[\s-]*of[\s-]*use|\blegal\b/i;

/** Enlaces al aviso legal / términos de uso (como mucho 2, primero el aviso legal). */
export function enlacesAvisoLegal(enlacesPagina: Enlace[], host: string): string[] {
  const propios = enlacesPagina.filter((e) => {
    try {
      return new URL(e.url).host === host;
    } catch {
      return false;
    }
  });
  const legales = propios.filter((e) => ENLACE_LEGAL.test(e.texto) || ENLACE_LEGAL.test(new URL(e.url).pathname));
  const peso = (e: Enlace) => (/aviso|nota|legal/i.test(e.texto + e.url) ? 0 : 1);
  return [...new Set(legales.sort((a, b) => peso(a) - peso(b)).map((e) => e.url))]
    .filter((u) => !/cookie|privacidad|privacy|rgpd|gdpr/i.test(u))
    .slice(0, 2);
}

// Términos que por sí solos indican una cláusula sobre rastreo o extracción automatizada.
const FUERTES = [
  /\bscrap(?:ing|ear|eo|per)\b/,
  /\bweb\s?scraping\b/,
  /\bcrawlers?\b/,
  /\bspiders?\b/,
  /\baranas\b(?! rojas)/,
  /\bmineria\s+de\s+(?:textos?\s+(?:y\s+)?)?datos\b/,
  /\btext\s+and\s+data\s+mining\b/,
  /\bextraccion\s+(?:automatica|automatizada|masiva|sistematica)\b/,
  /\b(?:medios|procedimientos|mecanismos|sistemas|herramientas|programas)\s+automati(?:cos|zados)\s+(?:de|para)\s+(?:extraccion|recopilacion|descarga|captura)\b/,
  /\breserva\w*\s[^.]{0,80}\bart(?:iculo|\.)?\s*4\b[^.]{0,40}(?:directiva|2019\/790)/,
];
// Términos ambiguos: solo cuentan con una prohibición cerca.
const DEBILES = [/\brobots?\b(?!\.txt)/, /\bprogramas\s+automaticos\b/, /\bextra(?:er|ccion)\b[^.]{0,40}\bcontenidos?\b/, /\bdescarga\s+masiva\b/, /\bbots?\b/];
const PROHIBICION = /prohib\w*|no\s+(?:esta\s+)?permitid\w*|no\s+se\s+permite|no\s+autoriza\w*|queda\s+(?:terminantemente\s+)?(?:prohibid\w*|vedad\w*)|sin\s+(?:el\s+|la\s+)?(?:previ[ao]\s+|expres[ao]\s+)?(?:autorizacion|consentimiento)|no\s+podra|abstenerse/;

/** Cláusulas del aviso legal que prohíben rastrear o extraer contenidos de forma automatizada. */
export function buscarClausulas(texto: string): { coincidencias: string[]; fragmento: string | null } {
  const p = plano(texto);
  const coincidencias: string[] = [];
  let fragmento: string | null = null;
  const anotar = (m: RegExpMatchArray) => {
    coincidencias.push(m[0]);
    if (!fragmento) {
      const i = m.index!;
      fragmento = p.slice(Math.max(0, i - 90), Math.min(p.length, i + m[0].length + 90)).trim().slice(0, 200);
    }
  };
  for (const re of FUERTES) {
    const m = p.match(re);
    if (m) anotar(m);
  }
  for (const re of DEBILES) {
    for (const m of p.matchAll(new RegExp(re.source, "g"))) {
      const i = m.index!;
      const cerca = p.slice(Math.max(0, i - 200), i + m[0].length + 200);
      // «robots» de la política de cookies/SEO de Google no cuenta: hace falta una prohibición.
      if (PROHIBICION.test(cerca) && !/google|buscadores|motores de busqueda|indexa/.test(cerca)) {
        anotar(m);
        break;
      }
    }
  }
  return { coincidencias: [...new Set(coincidencias)], fragmento };
}

/** Texto para `fuentes.notas_robots`: veredicto, motivo y fecha, legible por una persona. */
export function notaPuerta(p: ResultadoPuerta): string {
  const fecha = p.fecha.slice(0, 10);
  const partes: string[] = [];
  if (p.apta) {
    partes.push(`${fecha}: apta`);
    partes.push(`robots.txt ${p.robots.status === "ok" ? "permite el rastreo" : "no existe (sin restricciones)"}`);
    partes.push(p.aviso_legal?.url ? `aviso legal (${new URL(p.aviso_legal.url).pathname}) sin cláusulas contra el rastreo` : "aviso legal no localizado");
  } else {
    partes.push(`${fecha}: excluida — ${TEXTO_MOTIVO[p.motivo!]}`);
    if (p.detalle) partes.push(p.detalle);
  }
  if (p.redirigida_desde) partes.push(`la web redirige de ${p.redirigida_desde} a ${p.host}`);
  if (p.senales_ia.length) partes.push(`señales IA registradas: ${p.senales_ia.join(", ")} (los resúmenes de este sitio deben seguir siendo por plantilla)`);
  return partes.join(" · ") + ".";
}

export const TEXTO_MOTIVO: Record<MotivoSalto, string> = {
  exclusion_manual: "en la lista de exclusión manual",
  desactivada: "desactivada por el admin",
  bloqueo_http: "la web bloquea nuestro User-Agent (401/403/429)",
  anti_bot: "la web muestra un desafío anti-bot",
  inaccesible: "la web no responde (red, TLS o 5xx)",
  robots: "robots.txt no permite rastrear la portada",
  content_signal: "robots.txt declara Content-Signal search=no",
  clausula_legal: "el aviso legal prohíbe el rastreo o la extracción automatizada",
  sin_html: "la portada no es HTML",
  otro_dominio_compartido: "la redirección lleva a un dominio de otra bodega",
  no_verificada: "la web candidata no nombra a la bodega en su portada",
};
