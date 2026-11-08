// Resúmenes propios a partir de hechos (SCOPE §7.3: nunca se copia el texto
// de la fuente). La generación va detrás de GeneradorResumen: hoy plantillas
// deterministas (plantillas.ts); un LLM podría implementarla igual. El id del
// generador (con versión) entra en el hash, así que cambiarlo regenera una vez
// y después se reutiliza la caché de `resumenes`.
import { sinError, type ClienteDb } from "../db.ts";
import { consolidarHechos, hashHechos, type Hecho } from "./hechos.ts";

export type Idioma = "es" | "en";
export type CampoResumen = "descripcion" | "historia" | "elaboracion" | "cata";
export type EntidadResumen = "bodega" | "vino" | "anada";

export interface EntradaResumen {
  entidad: EntidadResumen;
  campo: CampoResumen;
  idioma: Idioma;
  /** Ya consolidados (uno por clave y sujeto). */
  hechos: Hecho[];
}

export interface GeneradorResumen {
  /** Identificador estable con versión («plantillas@1»). */
  readonly id: string;
  /** Texto propio, o null si no hay hechos suficientes. */
  generar(entrada: EntradaResumen): Promise<string | null>;
}

export const IDIOMAS: Idioma[] = ["es", "en"];

export interface ResumenCalculado {
  idioma: Idioma;
  texto: string | null;
  hash: string;
  fuentes: string[];
}

/** Calcula (sin BD) los resúmenes de un campo en cada idioma. */
export async function calcularResumenes(
  generador: GeneradorResumen,
  entidad: EntidadResumen,
  campo: CampoResumen,
  hechos: Hecho[],
  previos: Map<Idioma, string> = new Map(),
): Promise<{ resumen: ResumenCalculado; regenerado: boolean }[]> {
  const consolidados = consolidarHechos(hechos);
  const fuentes = [...new Set(consolidados.map((h) => h.fuente.fuente_id))].sort();
  const out: { resumen: ResumenCalculado; regenerado: boolean }[] = [];
  for (const idioma of IDIOMAS) {
    const hash = hashHechos(consolidados, `${generador.id}|${entidad}|${campo}|${idioma}`);
    if (previos.get(idioma) === hash) {
      out.push({ resumen: { idioma, texto: null, hash, fuentes }, regenerado: false });
      continue;
    }
    const texto = await generador.generar({ entidad, campo, idioma, hechos: consolidados });
    out.push({ resumen: { idioma, texto, hash, fuentes }, regenerado: true });
  }
  return out;
}

/**
 * Regenera y guarda los resúmenes de una entidad a partir de los hechos de todos sus registros
 * de fuente. Si los hechos no cambiaron (mismo hash), no se llama al generador.
 */
export class Resumidor {
  private db: ClienteDb;
  private generador: GeneradorResumen;

  constructor(db: ClienteDb, generador: GeneradorResumen) {
    this.db = db;
    this.generador = generador;
  }

  async resumir(entidad: EntidadResumen, id: string, campo: CampoResumen): Promise<boolean> {
    const [registros, previos] = await Promise.all([
      this.db.from("registros_fuente").select("hechos").eq("entidad_tipo", entidad).eq("entidad_id", id),
      this.db
        .from("resumenes")
        .select("idioma, hash_hechos")
        .eq("entidad_tipo", entidad)
        .eq("entidad_id", id)
        .eq("campo", campo),
    ]);
    const hechos = sinError(registros, "leer hechos").flatMap((r) => (Array.isArray(r.hechos) ? (r.hechos as unknown as Hecho[]) : []));
    const mapaPrevios = new Map(sinError(previos, "leer resúmenes").map((p) => [p.idioma as Idioma, p.hash_hechos]));
    let cambios = false;
    for (const { resumen, regenerado } of await calcularResumenes(this.generador, entidad, campo, hechos, mapaPrevios)) {
      if (!regenerado) continue;
      cambios = true;
      if (resumen.texto) {
        sinError(
          await this.db.from("resumenes").upsert(
            {
              entidad_tipo: entidad, entidad_id: id, campo, idioma: resumen.idioma, texto: resumen.texto,
              hash_hechos: resumen.hash, generador: this.generador.id, fuentes: resumen.fuentes,
            },
            { onConflict: "entidad_tipo,entidad_id,campo,idioma" },
          ),
          "guardar resumen",
        );
      } else {
        sinError(
          await this.db
            .from("resumenes")
            .delete()
            .eq("entidad_tipo", entidad)
            .eq("entidad_id", id)
            .eq("campo", campo)
            .eq("idioma", resumen.idioma),
          "borrar resumen",
        );
      }
    }
    return cambios;
  }
}
