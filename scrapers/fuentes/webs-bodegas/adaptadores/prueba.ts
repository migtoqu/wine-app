// Arnés de los tests de adaptadores: rastreo completo de un sitio con fetch simulado (portada,
// aviso legal, robots, listados y fichas desde fixtures) y el adaptador inyectado.
import { readFileSync } from "node:fs";
import { ClienteHttp } from "../../../lib/http.ts";
import { Log } from "../../../lib/log.ts";
import { LimitadorPorHost } from "../../../lib/rate-limit.ts";
import { denominacionesDeSemillas, ResolutorDenominaciones } from "../denominacion.ts";
import { RastreadorSitio, type BodegaEntrada, type ResultadoSitio } from "../sitio.ts";
import type { AdaptadorSitio } from "./tipos.ts";

export const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

const AVISO_OK = `<html><body><main><h1>Aviso legal</h1><p>${"Todos los contenidos de esta web son propiedad del titular y su reproducción está prohibida sin autorización. ".repeat(6)}</p></main></body></html>`;
const resolutor = new ResolutorDenominaciones(denominacionesDeSemillas());

export interface Prueba {
  /** URL de la portada (la de `bodegas.web`). */
  web: string;
  /** URL → cuerpo HTML/XML/JSON. La portada, si no se da, enlaza al aviso legal y a las fichas. */
  paginas: Record<string, string>;
  bodegas?: BodegaEntrada[];
  /** Con false se rastrea sin el adaptador (el genérico solo), para comparar. */
  conAdaptador?: boolean;
}

export async function rastrearCon(ad: AdaptadorSitio, p: Prueba): Promise<ResultadoSitio & { pedidas: string[] }> {
  const origen = new URL(p.web).origin;
  const portada = p.paginas[p.web] ?? `<html><head><title>Bodega</title></head><body><main><p>Bodega familiar.</p>
    <a href="${origen}/aviso-legal/">Aviso legal</a>${Object.keys(p.paginas).map((u) => `<a href="${u}">${u}</a>`).join("")}</main></body></html>`;
  const rutas: Record<string, string> = { [`${origen}/aviso-legal/`]: AVISO_OK, ...p.paginas, [p.web]: portada };
  const pedidas: string[] = [];
  const fetchFalso: typeof fetch = async (entrada) => {
    const url = String(entrada);
    pedidas.push(url);
    const cuerpo = rutas[url];
    const res = cuerpo === undefined
      ? new Response("no", { status: 404 })
      : new Response(cuerpo, { status: 200, headers: { "content-type": /^\s*</.test(cuerpo) && /<(urlset|sitemapindex)\b/.test(cuerpo) ? "application/xml" : /^\s*[[{]/.test(cuerpo) ? "application/json" : "text/html; charset=utf-8" } });
    Object.defineProperty(res, "url", { value: url });
    return res;
  };
  const log = new Log();
  const r = new RastreadorSitio(
    () => new ClienteHttp({ log, fetch: fetchFalso, limitador: new LimitadorPorHost({ minMs: 0, maxMs: 0 }), dormir: async () => {}, backoffMs: [] }),
    {
      log, exclusiones: { excluidos: [], permitidos: [] }, municipios: [], denominaciones: resolutor,
      ahora: () => new Date("2026-11-12T10:00:00Z"), adaptadores: p.conAdaptador !== false, adaptadorPara: () => ad,
    },
  );
  const dominio = new URL(p.web).host.replace(/^www\./, "");
  const res = await r.rastrear({ dominio, url: p.web, bodegas: p.bodegas ?? [{ id: "b1", nombre: "Bodega", municipio: null }] });
  return { ...res, pedidas };
}
