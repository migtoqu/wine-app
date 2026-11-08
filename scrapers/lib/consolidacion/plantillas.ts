// Generador de resúmenes con plantillas deterministas en español e inglés.
// Solo enuncia hechos atómicos (año, hectáreas, municipio, uvas, barrica…):
// no puede afirmar nada que no esté en los hechos.
import type { Hecho } from "./hechos.ts";
import type { EntradaResumen, GeneradorResumen, Idioma } from "./resumen.ts";

const NUM: Record<Idioma, Intl.NumberFormat> = {
  es: new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }),
};

function lista(items: string[], idioma: Idioma): string {
  if (items.length <= 1) return items[0] ?? "";
  const y = idioma === "es" ? " y " : " and ";
  return `${items.slice(0, -1).join(", ")}${y}${items[items.length - 1]}`;
}

const TIPO: Record<Idioma, Record<string, string>> = {
  es: { tinto: "tinto", blanco: "blanco", rosado: "rosado", espumoso: "espumoso", generoso: "generoso", dulce: "dulce", naranja: "naranja" },
  en: { tinto: "red", blanco: "white", rosado: "rosé", espumoso: "sparkling", generoso: "fortified", dulce: "sweet", naranja: "orange" },
};

class Hechos {
  private h: Hecho[];
  constructor(h: Hecho[]) {
    this.h = h;
  }
  texto(clave: Hecho["clave"]): string | null {
    const v = this.h.find((x) => x.clave === clave)?.valor;
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  }
  numero(clave: Hecho["clave"]): number | null {
    const v = this.h.find((x) => x.clave === clave)?.valor;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  textos(clave: Hecho["clave"]): string[] {
    return this.h
      .filter((x) => x.clave === clave && typeof x.valor === "string" && x.valor.trim() !== "")
      .map((x) => (x.valor as string).trim());
  }
  si(clave: Hecho["clave"]): boolean {
    return this.h.some((x) => x.clave === clave && x.valor === true);
  }
  conSujeto(clave: Hecho["clave"]): { sujeto: string; valor: number | null }[] {
    return this.h
      .filter((x) => x.clave === clave && x.sujeto)
      .map((x) => ({ sujeto: x.sujeto!, valor: typeof x.valor === "number" ? x.valor : null }))
      .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1) || a.sujeto.localeCompare(b.sujeto));
  }
}

function descripcionBodega(h: Hechos, idioma: Idioma): string | null {
  const nombre = h.texto("bodega.nombre");
  const municipio = h.texto("bodega.municipio");
  const provincia = h.texto("bodega.provincia");
  const dos = h.textos("bodega.denominacion");
  const fundacion = h.numero("bodega.fundacion_anio");
  const ha = h.numero("bodega.hectareas");
  const lugar = municipio ? (provincia && provincia !== municipio ? `${municipio} (${provincia})` : municipio) : provincia;
  if (!nombre || (!lugar && dos.length === 0 && !fundacion && !ha)) return null;

  const frases: string[] = [];
  if (idioma === "es") {
    let f = `${nombre} es una bodega`;
    if (dos.length) f += ` de la ${lista(dos.map((d) => `D.O. ${d}`), "es")}`;
    if (lugar) f += ` situada en ${lugar}`;
    frases.push(f + ".");
    if (fundacion) frases.push(`Se fundó en ${fundacion}.`);
    if (ha) frases.push(`Cuenta con ${NUM.es.format(ha)} ha de viñedo.`);
    if (h.si("bodega.enoturismo")) frases.push("Ofrece visitas.");
  } else {
    let f = `${nombre} is a winery`;
    if (dos.length) f += ` in the ${lista(dos.map((d) => `${d} D.O.`), "en")}`;
    if (lugar) f += `${dos.length ? "," : ""} based in ${lugar}`;
    frases.push(f + ".");
    if (fundacion) frases.push(`It was founded in ${fundacion}.`);
    if (ha) frases.push(`It farms ${NUM.en.format(ha)} ha of vineyards.`);
    if (h.si("bodega.enoturismo")) frases.push("It offers visits.");
  }
  return frases.join(" ");
}

const ORDINAL: Record<Idioma, string[]> = {
  es: ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima", "octava", "novena", "décima"],
  en: ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"],
};

function historiaBodega(h: Hechos, idioma: Idioma): string | null {
  const nombre = h.texto("bodega.nombre");
  const fundacion = h.numero("bodega.fundacion_anio");
  const fundadores = h.textos("bodega.fundadores");
  const familia = h.texto("bodega.familia");
  const gen = h.numero("bodega.generacion");
  const generacion = gen && Number.isInteger(gen) && gen >= 1 && gen <= 10 ? gen : null;
  const primera = h.numero("bodega.primera_anada");
  const inauguracion = h.conSujeto("bodega.hito").find((x) => x.sujeto === "inauguracion")?.valor ?? null;
  const ha = h.numero("bodega.hectareas");
  const altitud = h.numero("bodega.altitud");
  const municipios = h.textos("bodega.vinedo_municipio");
  const botellas = h.numero("bodega.produccion_botellas");
  if (!nombre || (!fundacion && fundadores.length === 0 && !familia && !generacion && !primera && !inauguracion)) {
    return null;
  }

  const n = NUM[idioma];
  const frases: string[] = [];
  if (idioma === "es") {
    if (fundacion) frases.push(`${nombre} se fundó en ${fundacion}${fundadores.length ? ` por iniciativa de ${lista(fundadores, "es")}` : ""}.`);
    else if (fundadores.length) frases.push(`${nombre} fue fundada por ${lista(fundadores, "es")}.`);
    if (familia) {
      frases.push(`Es propiedad de la familia ${familia}${generacion ? `, que la dirige ya en su ${ORDINAL.es[generacion]} generación` : ""}.`);
    } else if (generacion) {
      frases.push(`Hoy la dirige la ${ORDINAL.es[generacion]} generación de la familia.`);
    }
    if (primera) frases.push(`Su primera añada fue la de ${primera}.`);
    if (inauguracion) frases.push(`La bodega actual se inauguró en ${inauguracion}.`);
    if (ha || municipios.length) {
      let f = ha ? `Cultiva ${n.format(ha)} ha de viñedo` : "Tiene viñedo propio";
      if (municipios.length) f += ` en ${lista(municipios, "es")}`;
      if (altitud) f += `, a unos ${n.format(altitud)} m de altitud`;
      frases.push(f + ".");
    } else if (altitud) {
      frases.push(`Sus viñedos están a unos ${n.format(altitud)} m de altitud.`);
    }
    if (botellas) frases.push(`Produce unas ${n.format(botellas)} botellas al año.`);
  } else {
    if (fundacion) frases.push(`${nombre} was founded in ${fundacion}${fundadores.length ? ` by ${lista(fundadores, "en")}` : ""}.`);
    else if (fundadores.length) frases.push(`${nombre} was founded by ${lista(fundadores, "en")}.`);
    if (familia) {
      frases.push(`It is owned by the ${familia} family${generacion ? `, now in its ${ORDINAL.en[generacion]} generation` : ""}.`);
    } else if (generacion) {
      frases.push(`It is run today by the ${ORDINAL.en[generacion]} generation of the family.`);
    }
    if (primera) frases.push(`Its first vintage was ${primera}.`);
    if (inauguracion) frases.push(`The current winery opened in ${inauguracion}.`);
    if (ha || municipios.length) {
      let f = ha ? `It farms ${n.format(ha)} ha of vineyards` : "It farms its own vineyards";
      if (municipios.length) f += ` in ${lista(municipios, "en")}`;
      if (altitud) f += `, at around ${n.format(altitud)} m above sea level`;
      frases.push(f + ".");
    } else if (altitud) {
      frases.push(`Its vineyards lie at around ${n.format(altitud)} m above sea level.`);
    }
    if (botellas) frases.push(`It produces around ${n.format(botellas)} bottles a year.`);
  }
  return frases.join(" ");
}

function elaboracionAnada(h: Hechos, idioma: Idioma): string | null {
  const uvas = h.conSujeto("anada.variedad");
  const barrica = h.numero("anada.barrica_meses");
  const grado = h.numero("anada.grado");
  const tmin = h.numero("anada.temperatura_min");
  const tmax = h.numero("anada.temperatura_max");
  const tipo = h.texto("vino.tipo");
  if (uvas.length === 0 && !barrica && !grado && tmin == null) return null;

  const n = NUM[idioma];
  const pct = (v: number | null) => (v == null ? "" : idioma === "es" ? ` (${n.format(v)} %)` : ` (${n.format(v)}%)`);
  const frases: string[] = [];
  if (uvas.length) {
    const unica = uvas.length === 1 && (uvas[0]!.valor == null || uvas[0]!.valor === 100);
    const nombres = unica ? [uvas[0]!.sujeto] : uvas.map((u) => `${u.sujeto}${pct(u.valor)}`);
    const t = tipo ? TIPO[idioma][tipo] : null;
    frases.push(
      idioma === "es"
        ? `${t ? `Vino ${t} elaborado` : "Elaborado"} con ${unica ? `${nombres[0]} (100 %)` : lista(nombres, "es")}.`
        : `${t ? `${t[0]!.toUpperCase()}${t.slice(1)} wine made` : "Made"} from ${unica ? `100% ${nombres[0]}` : lista(nombres, "en")}.`,
    );
  }
  if (barrica) {
    frases.push(idioma === "es" ? `Crianza de ${barrica} meses en barrica.` : `Aged for ${barrica} months in barrel.`);
  }
  if (grado) frases.push(idioma === "es" ? `${n.format(grado)} % vol.` : `${n.format(grado)}% ABV.`);
  if (tmin != null) {
    const rango = tmax != null && tmax !== tmin ? `${n.format(tmin)}–${n.format(tmax)}` : n.format(tmin);
    frases.push(idioma === "es" ? `Temperatura de servicio: ${rango} ºC.` : `Serve at ${rango} °C.`);
  }
  return frases.join(" ");
}

function cataAnada(h: Hechos, idioma: Idioma): string | null {
  const partes: [string, string, string[]][] = [
    ["Vista", "Appearance", h.textos("anada.cata.vista")],
    ["Nariz", "Nose", h.textos("anada.cata.nariz")],
    ["Boca", "Palate", h.textos("anada.cata.boca")],
  ];
  const frases = partes
    .filter(([, , v]) => v.length > 0)
    .map(([es, en, v]) => `${idioma === "es" ? es : en}: ${lista(v, idioma)}.`);
  const maridaje = h.textos("vino.maridaje");
  if (maridaje.length) frases.push(`${idioma === "es" ? "Maridaje" : "Food pairing"}: ${lista(maridaje, idioma)}.`);
  return frases.length ? frases.join(" ") : null;
}

export class PlantillasEsEn implements GeneradorResumen {
  readonly id = "plantillas@1";

  async generar(e: EntradaResumen): Promise<string | null> {
    const h = new Hechos(e.hechos);
    if (e.entidad === "bodega" && e.campo === "descripcion") return descripcionBodega(h, e.idioma);
    if (e.entidad === "bodega" && e.campo === "historia") return historiaBodega(h, e.idioma);
    if (e.entidad === "anada" && e.campo === "elaboracion") return elaboracionAnada(h, e.idioma);
    if (e.entidad === "anada" && e.campo === "cata") return cataAnada(h, e.idioma);
    return null;
  }
}
