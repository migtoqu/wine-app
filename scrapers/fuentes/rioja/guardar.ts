// C.R. DOCa Rioja: bodegas, vinos (marcas) y servicios de enoturismo. El guardado vive en
// fuentes/consejos/comun/guardar-completo.ts (compartido con Navarra); aquí solo se fija la D.O.
import { GuardadoConsejoCompleto } from "../consejos/comun/guardar-completo.ts";
import type { ClienteDb } from "../../lib/db.ts";
import type { Log } from "../../lib/log.ts";
import type { GeneradorResumen } from "../../lib/consolidacion/resumen.ts";

export {
  candidatosSlug,
  variedadesAnteriores,
  type Emparejamiento,
  type Resultado,
} from "../consejos/comun/guardar-completo.ts";

export const SLUG_DENOMINACION = "rioja";
export const NOMBRE_DENOMINACION = "Rioja";

export class GuardadoRioja extends GuardadoConsejoCompleto {
  constructor(db: ClienteDb, fuenteId: string, log: Log, generador?: GeneradorResumen) {
    super(db, fuenteId, log, { slug: SLUG_DENOMINACION, nombre: NOMBRE_DENOMINACION }, generador);
  }
}
