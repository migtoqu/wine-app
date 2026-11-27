// C.R.D.O. Penedès (dopenedes.cat, WordPress): /es/bodegas/ es una tabla con nombre, municipio e
// iconos de venta online y WineBar; el propio consejo publica el listado completo en CSV
// (/llistat_cellers.php: dirección, CP, municipio, teléfono, web y email). Dos peticiones: la tabla da
// el id de la ficha (`?id=N`, para el enlace) y el CSV el contacto; se cruzan por nombre. El CSV se
// sirve en Latin-1 aunque la cabecera diga UTF-8 (lo resuelve `decodificarCuerpo`).
import * as cheerio from "cheerio";
import type { Contexto } from "../../lib/ejecucion.ts";
import { claveTexto, limpiarEspacios, textoONull } from "../../lib/texto.ts";
import type { DefinicionConsejo, EntradaListado } from "./comun/tipos.ts";

export const SLUG_FUENTE = "cr-penedes";
export const BASE = "https://dopenedes.cat";
export const URL_LISTADO = `${BASE}/es/bodegas/`;
export const URL_CSV = `${BASE}/llistat_cellers.php`;

const t = (s: string | undefined | null) => textoONull(limpiarEspacios(s ?? ""));

interface FilaTabla {
  id: string;
  nombre: string;
  municipio: string | null;
  ventaOnline: boolean;
  winebar: boolean;
}

/** Tabla de /es/bodegas/: id de la ficha, nombre, municipio e iconos (bolsa = venta online, copa = WineBar). */
export function parsearTabla(html: string): FilaTabla[] {
  const $ = cheerio.load(html);
  const out: FilaTabla[] = [];
  const vistos = new Set<string>();
  $("table tr").each((_, tr) => {
    const fila = $(tr);
    const a = fila.find("a[href*='bodega/?id=']").first();
    const id = /[?&]id=(\d+)/.exec(a.attr("href") ?? "")?.[1];
    const nombre = t(a.text());
    if (!id || !nombre || vistos.has(id)) return;
    vistos.add(id);
    const iconos = fila.find(".icons-wrapper svg path").toArray().map((p) => $(p).attr("d") ?? "");
    out.push({
      id,
      nombre,
      municipio: t(fila.find("td").last().text()),
      ventaOnline: iconos.some((d) => d.startsWith("M1 5.72")),
      winebar: iconos.some((d) => d.startsWith("M2.657")),
    });
  });
  return out;
}

/** Una línea del CSV (`;`, campos entre comillas opcionales, `""` = comilla). */
export function camposCsv(linea: string): string[] {
  const out: string[] = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ";") { out.push(campo); campo = ""; }
    else campo += c;
  }
  out.push(campo);
  return out;
}

export interface FilaCsv {
  nombre: string;
  direccion: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  telefono: string | null;
  web: string | null;
  email: string | null;
}

/** CSV del consejo: «Celler;Carrer;Carrer2;Codi Postal;Població;Tel;Web;Email». */
export function parsearCsv(texto: string): FilaCsv[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  const cab = camposCsv(lineas[0] ?? "").map((c) => claveTexto(c));
  const col = (n: string) => cab.indexOf(n);
  const iNombre = col("celler"), iCarrer = col("carrer"), iCarrer2 = col("carrer2"), iCp = col("codi postal");
  const iPob = col("poblacio"), iTel = col("tel"), iWeb = col("web"), iEmail = col("email");
  if (iNombre < 0) throw new Error("CSV de la D.O. Penedès sin la columna «Celler»: ¿ha cambiado el formato?");
  return lineas.slice(1).map((l) => {
    const f = camposCsv(l);
    const v = (i: number) => (i >= 0 ? t(f[i]) : null);
    const direccion = [v(iCarrer), v(iCarrer2)].filter(Boolean).join(", ") || null;
    const cp = v(iCp)?.replace(/\D/g, "") ?? null;
    return {
      nombre: v(iNombre) ?? "",
      direccion,
      // Excel quita el cero inicial de los CP de Barcelona («8770»).
      codigo_postal: cp ? cp.padStart(5, "0") : null,
      municipio: v(iPob),
      telefono: v(iTel),
      web: v(iWeb),
      email: v(iEmail)?.toLowerCase() ?? null,
    };
  }).filter((f) => f.nombre);
}

/** Tabla + CSV → entradas completas (la tabla es la ficha, como en Rueda). */
export function combinar(tabla: FilaTabla[], csv: FilaCsv[]): EntradaListado[] {
  const porNombre = new Map(csv.map((c) => [claveTexto(c.nombre), c]));
  return tabla.map((f) => {
    const c = porNombre.get(claveTexto(f.nombre));
    return {
      url: `${URL_LISTADO.replace(/bodegas\/$/, "bodega/")}?id=${f.id}`,
      datos: {
        id_externo: `id:${f.id}`,
        nombre: f.nombre,
        direccion: c?.direccion ?? null,
        codigo_postal: c?.codigo_postal ?? null,
        municipio: f.municipio ?? c?.municipio ?? null,
        web: c?.web ?? null,
        telefono: c?.telefono ?? null,
        email: c?.email ?? null,
        extra: {
          ...(f.ventaOnline ? { venta_online: true } : {}),
          ...(f.winebar ? { winebar: true } : {}),
        },
      },
    };
  });
}

export const consejoPenedes: DefinicionConsejo = {
  slug: SLUG_FUENTE,
  denominacion: { slug: "penedes", nombre: "Penedès" },
  urlsRobots: [URL_LISTADO, URL_CSV],
  async listar(ctx: Contexto) {
    const tabla = parsearTabla((await ctx.http.get(URL_LISTADO)).texto);
    const csv = parsearCsv((await ctx.http.get(URL_CSV)).texto);
    if (tabla.length && csv.length < tabla.length / 2) ctx.log.warn(`CSV de Penedès con ${csv.length} filas para ${tabla.length} bodegas: contacto incompleto`);
    return combinar(tabla, csv);
  },
};
