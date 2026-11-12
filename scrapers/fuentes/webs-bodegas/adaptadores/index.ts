// Registro explícito de adaptadores por sitio (sin autodescubrimiento de ficheros). Uno por dominio.
import { dominioBase } from "../dominio.ts";
import type { AdaptadorSitio } from "./tipos.ts";

export const ADAPTADORES: AdaptadorSitio[] = [];

const porDominio = new Map(ADAPTADORES.flatMap((a) => a.dominios.map((d) => [d, a] as const)));

/** Adaptador del dominio (o de su dominio registrable: «tienda.x.es» → «x.es»). */
export function adaptadorPara(dominio: string): AdaptadorSitio | null {
  const d = dominio.toLowerCase().replace(/^www\d*\./, "");
  return porDominio.get(d) ?? porDominio.get(dominioBase(d)) ?? null;
}
