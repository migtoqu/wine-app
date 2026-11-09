import type { Metadata } from "next";
import NextLink from "next/link";
import { AdminHeader } from "@/components/admin/parts";
import { Badge, Button, buttonStyles } from "@/components/ui";
import { formatDate, formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { ESTADOS_EJECUCION, esEstadoEjecucion, formatDuracion } from "@/lib/admin/enlaces";
import { pageParam, param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { createClient } from "@/lib/supabase/server";
import { EstadoBadge } from "./estado-badge";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.ejecuciones.title, robots: { index: false } };
}

const POR_PAGINA = 50;
const selectCls = "h-11 min-w-0 rounded-control border border-border-strong bg-surface px-3 text-base";

export default async function EjecucionesPage({ searchParams }: PageProps<"/[lang]/admin/ejecuciones">) {
  const lang = await getLocale();
  const { admin } = await getDictionary();
  const t = admin.ejecuciones;
  const sp = await searchParams;
  const fuente = param(sp, "fuente");
  const estadoParam = param(sp, "estado");
  const estado = esEstadoEjecucion(estadoParam) ? estadoParam : "";
  const pagina = pageParam(sp);

  const supabase = await createClient();
  // Solo fuentes con ejecuciones (la tabla fuentes también tiene una por web de bodega).
  const fuentesQuery = supabase.rpc("admin_fuentes_con_ejecuciones");
  let query = supabase
    .from("ejecuciones_scraper")
    .select("id, inicio, fin, estado, nuevos, actualizados, errores, run_url, fuente:fuentes!inner(slug, nombre)", {
      count: "exact",
    });
  if (fuente) query = query.eq("fuente.slug", fuente);
  if (estado) query = query.eq("estado", estado);
  const [{ data, error, count }, fuentes] = await Promise.all([
    query
      .order("inicio", { ascending: false })
      .order("id")
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    fuentesQuery,
  ]);
  if (error) throw new Error(error.message);
  if (fuentes.error) throw new Error(fuentes.error.message);
  const total = count ?? 0;
  const filtros = { ...(fuente ? { fuente } : {}), ...(estado ? { estado } : {}) };
  const n = (x: number) => formatNumber(lang, x);

  return (
    <>
      <AdminHeader title={t.title}>
        <p className="max-w-prose text-muted">{t.intro}</p>
      </AdminHeader>

      <form action={adminPath(lang, "/ejecuciones")} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t.source}</span>
          <select name="fuente" defaultValue={fuente} className={selectCls}>
            <option value="">{t.allSources}</option>
            {fuentes.data.map((f) => (
              <option key={f.slug} value={f.slug}>
                {f.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{t.status}</span>
          <select name="estado" defaultValue={estado} className={selectCls}>
            <option value="">{t.allStatuses}</option>
            {ESTADOS_EJECUCION.map((e) => (
              <option key={e} value={e}>
                {t.estados[e]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          {t.filter}
        </Button>
      </form>

      {data.length === 0 ? (
        <p className="text-muted">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {data.map((e) => {
            const duracion = formatDuracion(e.inicio, e.fin);
            return (
              <li key={e.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <NextLink
                      href={adminPath(lang, `/ejecuciones/${e.id}`)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {e.fuente.nombre}
                    </NextLink>
                    <EstadoBadge estado={e.estado} labels={t.estados} />
                    {e.errores > 0 && <Badge tone="warning">{n(e.errores)} {t.errores}</Badge>}
                  </div>
                  <p className="text-sm text-muted">
                    {formatDate(lang, e.inicio, { dateStyle: "medium", timeStyle: "short" })}
                    {" · "}
                    {duracion ?? t.running}
                    {" · "}
                    <span className="tabular-nums">
                      {n(e.nuevos)} {t.nuevos}, {n(e.actualizados)} {t.actualizados}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <NextLink
                    href={adminPath(lang, `/ejecuciones/${e.id}`)}
                    className={buttonStyles({ variant: "ghost", size: "sm" })}
                  >
                    {t.detail}
                  </NextLink>
                  {e.run_url && (
                    <a
                      href={e.run_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonStyles({ variant: "secondary", size: "sm" })}
                    >
                      {t.github}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > POR_PAGINA && (
        <nav className="flex justify-between gap-2" aria-label={t.title}>
          {pagina > 1 ? (
            <NextLink
              href={adminPath(lang, "/ejecuciones", { ...filtros, pagina: String(pagina - 1) })}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              ← {t.previous}
            </NextLink>
          ) : (
            <span />
          )}
          {pagina * POR_PAGINA < total && (
            <NextLink
              href={adminPath(lang, "/ejecuciones", { ...filtros, pagina: String(pagina + 1) })}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              {t.next} →
            </NextLink>
          )}
        </nav>
      )}
    </>
  );
}
