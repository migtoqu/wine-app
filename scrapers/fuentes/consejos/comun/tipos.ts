// Núcleo común de los scrapers de consejos reguladores con directorio de bodegas
// (Toro, Cigales, Bierzo, Priorat, Rueda…). Cada consejo aporta un parser que
// produce `FichaConsejo` y una definición; el resto (normalizar, emparejar,
// consolidar, contar) es común. Solo hechos: nunca descripciones ni imágenes.
import type { Contexto } from "../../../lib/ejecucion.ts";
import type { Punto } from "../../../lib/geo.ts";

/** Datos crudos y factuales de una bodega, tal como los da el consejo. */
export interface FichaConsejo {
  url: string;
  /** Id estable dentro de la fuente («slug:numanthia», «id:93», «pdb:172»). */
  id_externo: string;
  nombre: string;
  direccion: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  /** Provincia como la escribe la fuente («(Zamora)», «León, España»), si la da. */
  provincia_texto: string | null;
  ubicacion: Punto | null;
  web: string | null;
  telefono: string | null;
  email: string | null;
  /** Marcas de vino registradas: solo para emparejar y para `datos` (no crean vinos). */
  marcas: string[];
  /** true si la fuente dice que es visitable; null si no lo dice. */
  enoturismo: boolean | null;
  /** Otros datos factuales propios de la fuente (año de inscripción, idiomas, tienda…). */
  extra: Record<string, unknown>;
}

/** Una entrada del listado: la URL de la ficha y lo que ya se sabe por el listado. */
export interface EntradaListado {
  url: string;
  /** Datos del listado (nombre, municipio…). Si `parsearFicha` no existe, debe ser la ficha completa. */
  datos: Partial<FichaConsejo>;
}

export interface Denominacion {
  slug: string;
  nombre: string;
}

export interface DefinicionConsejo {
  /** Slug de la fila en `fuentes`. */
  slug: string;
  denominacion: Denominacion;
  /** URLs que robots.txt debe permitir antes de empezar (listado y una ficha de ejemplo). */
  urlsRobots: string[];
  /** Recorre el listado del consejo. */
  listar(ctx: Contexto): Promise<EntradaListado[]>;
  /** Lee una ficha. Si falta, el listado ya trae la ficha completa (Rueda). */
  parsearFicha?(html: string, entrada: EntradaListado): FichaConsejo;
  /** Provincia por municipio cuando no hay código postal (clave: `claveTexto(municipio)`). */
  provinciaPorMunicipio?: Record<string, string>;
  /** Alias de municipio (otra lengua o grafía → nombre del catálogo), por `claveTexto`. */
  aliasMunicipio?: Record<string, string>;
  /**
   * Solo para D.O. que caen enteras en una provincia (Navarra): último recurso si no hay CP ni
   * municipio conocido. Las D.O. de varias provincias nunca lo usan.
   */
  provinciaUnica?: string;
}
