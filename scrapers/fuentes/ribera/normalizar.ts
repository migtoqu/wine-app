// Ribera del Duero: de ficha cruda a campos de `bodegas` + `datos` de registros_fuente.
import {
  normalizarCodigoPostal,
  normalizarEmail,
  normalizarTelefono,
  normalizarWeb,
} from "../../lib/contacto.ts";
import { comunidadDeProvincia, puntoEnEspana, puntoEwkt } from "../../lib/geo.ts";
import { capitalizarSiMayusculas, claveNombreBodega, claveTexto, nombreBodegaParaMostrar } from "../../lib/texto.ts";
import type { Direccion, FichaRibera } from "./parsear.ts";

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

/** `registros_fuente.datos`: la ficha cruda, lo escrito en `bodegas` y claves para emparejar. */
export interface DatosRegistroRibera extends FichaRibera {
  /** Campos escritos en `bodegas` en esta ejecución (base de comparación de la siguiente). */
  campos: CamposBodega;
  clave_nombre: string;
  claves_marcas: string[];
}

export interface BodegaNormalizada {
  idExterno: string;
  url: string;
  campos: CamposBodega;
  datos: DatosRegistroRibera;
}

const mayusculas = (s: string | null) => (s ? capitalizarSiMayusculas(s) : null);

/** Dirección principal; si no trae calle ni municipio, la de «Datos de la sociedad». */
function elegirDireccion(f: FichaRibera): Direccion {
  const vacia = (d: Direccion | undefined) => !d || (!d.linea1 && !d.municipio);
  return vacia(f.direccion) && !vacia(f.direccion_sociedad) ? f.direccion_sociedad : f.direccion;
}

export function normalizarCampos(f: FichaRibera): CamposBodega {
  const dir = elegirDireccion(f);
  const provincia = mayusculas(dir.provincia);
  return {
    nombre: nombreBodegaParaMostrar(f.nombre),
    direccion: mayusculas(dir.linea1),
    codigo_postal: normalizarCodigoPostal(dir.codigo_postal),
    municipio: mayusculas(dir.municipio),
    provincia,
    comunidad: comunidadDeProvincia(provincia),
    ubicacion: f.ubicacion && puntoEnEspana(f.ubicacion) ? puntoEwkt(f.ubicacion) : null,
    web: normalizarWeb(f.web) ?? normalizarWeb(f.web_sociedad),
    telefono: normalizarTelefono(f.telefono ?? f.telefono_href),
    email: normalizarEmail(f.email) ?? normalizarEmail(f.email_sociedad),
  };
}

export function normalizarFicha(f: FichaRibera): BodegaNormalizada {
  const campos = normalizarCampos(f);
  return {
    idExterno: f.nodo ? `nodo:${f.nodo}` : `slug:${f.slug_fuente}`,
    url: f.url,
    campos,
    datos: {
      ...f,
      campos,
      clave_nombre: claveNombreBodega(f.nombre),
      claves_marcas: f.marcas.map(claveTexto).filter((m) => m !== ""),
    },
  };
}
