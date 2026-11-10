// Consejos reguladores: de `FichaConsejo` a campos de `bodegas`, hechos y `datos` de registros_fuente.
import {
  dominioWeb,
  esDominioGenerico,
  normalizarCodigoPostal,
  normalizarEmail,
  normalizarTelefono,
  normalizarWeb,
} from "../../../lib/contacto.ts";
import { comunidadDeProvincia, provinciaDeCodigoPostal, puntoEnEspana, puntoEwkt } from "../../../lib/geo.ts";
import {
  capitalizarSiMayusculas,
  claveNombreBodega,
  claveTexto,
  limpiarEspacios,
  nombreBodegaParaMostrar,
} from "../../../lib/texto.ts";
import type { DefinicionConsejo, FichaConsejo } from "./tipos.ts";

/** Columnas de `bodegas` que aporta esta fuente (nunca descripción). */
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
}

export type ClaveHechoBodega =
  | "bodega.nombre"
  | "bodega.municipio"
  | "bodega.provincia"
  | "bodega.denominacion"
  | "bodega.enoturismo";

export interface DatosRegistroConsejo extends FichaConsejo {
  /** Campos escritos en `bodegas` en esta ejecución (base de comparación de la siguiente). */
  campos: CamposBodega;
  clave_nombre: string;
  claves_marcas: string[];
}

export interface BodegaNormalizada {
  idExterno: string;
  url: string;
  campos: CamposBodega;
  marcas: string[];
  hechos: { clave: ClaveHechoBodega; valor: string | boolean }[];
  datos: DatosRegistroConsejo;
}

type Config = Pick<DefinicionConsejo, "denominacion" | "provinciaPorMunicipio" | "aliasMunicipio" | "provinciaUnica">;

/** «(Zamora)», «León, España», «VALLADOLID» → nombre de provincia reconocido, o null. */
export function provinciaDeTexto(texto: string | null): string | null {
  if (!texto) return null;
  const limpio = limpiarEspacios(texto.replace(/[()]/g, " ").replace(/,?\s*espa[ñn]a\s*$/i, ""));
  if (!limpio) return null;
  const p = capitalizarSiMayusculas(limpio);
  return comunidadDeProvincia(p) ? p : null;
}

export function municipioDe(municipio: string | null, alias: Record<string, string> = {}): string | null {
  const m = municipio ? limpiarEspacios(municipio) : "";
  if (!m) return null;
  return alias[claveTexto(m)] ?? capitalizarSiMayusculas(m);
}

/**
 * Provincia, de más a menos fiable: código postal, tabla de municipios de la D.O.
 * y lo que escriba la fuente. Nunca se da por defecto la de la D.O.
 */
export function provinciaDe(
  cp: string | null,
  municipio: string | null,
  provinciaTexto: string | null,
  porMunicipio: Record<string, string> = {},
): string | null {
  return (
    provinciaDeCodigoPostal(cp) ??
    (municipio ? porMunicipio[claveTexto(municipio)] : undefined) ??
    provinciaDeTexto(provinciaTexto)
  );
}

/** Marcas sin duplicados (por clave) ni vacías. */
export function limpiarMarcas(marcas: string[]): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const m of marcas) {
    const t = limpiarEspacios(m).replace(/[.;,]+$/, "");
    const c = claveTexto(t);
    if (!c || vistas.has(c)) continue;
    vistas.add(c);
    out.push(t);
  }
  return out;
}

/** Web propia: una red social, un agregador o la web del consejo no lo son (no van a `bodegas.web`). */
export function webPropia(web: string | null): string | null {
  const w = normalizarWeb(web);
  const dominio = dominioWeb(w);
  return w && dominio && !esDominioGenerico(dominio) ? w : null;
}

export function normalizarBodega(f: FichaConsejo, cfg: Config): BodegaNormalizada {
  const cp = normalizarCodigoPostal(f.codigo_postal);
  const municipio = municipioDe(f.municipio, cfg.aliasMunicipio);
  const provincia = provinciaDe(cp, municipio, f.provincia_texto, cfg.provinciaPorMunicipio) ?? cfg.provinciaUnica ?? null;
  const campos: CamposBodega = {
    nombre: nombreBodegaParaMostrar(f.nombre),
    direccion: f.direccion ? capitalizarSiMayusculas(f.direccion).replace(/[\s,]+$/, "") || null : null,
    codigo_postal: cp,
    municipio,
    provincia,
    comunidad: comunidadDeProvincia(provincia),
    ubicacion: f.ubicacion && puntoEnEspana(f.ubicacion) ? puntoEwkt(f.ubicacion) : null,
    web: webPropia(f.web),
    telefono: normalizarTelefono(f.telefono),
    email: normalizarEmail(f.email),
  };
  const marcas = limpiarMarcas(f.marcas);
  const hechos: BodegaNormalizada["hechos"] = [{ clave: "bodega.nombre", valor: campos.nombre }];
  if (campos.municipio) hechos.push({ clave: "bodega.municipio", valor: campos.municipio });
  if (campos.provincia) hechos.push({ clave: "bodega.provincia", valor: campos.provincia });
  hechos.push({ clave: "bodega.denominacion", valor: cfg.denominacion.nombre });
  if (f.enoturismo === true) hechos.push({ clave: "bodega.enoturismo", valor: true });
  return {
    idExterno: f.id_externo,
    url: f.url,
    campos,
    marcas,
    hechos,
    datos: {
      ...f,
      marcas,
      campos,
      clave_nombre: claveNombreBodega(f.nombre),
      claves_marcas: marcas.map(claveTexto).filter((m) => m !== ""),
    },
  };
}
