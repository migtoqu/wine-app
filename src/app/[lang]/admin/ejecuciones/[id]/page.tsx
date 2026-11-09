import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/parts";
import { buttonStyles } from "@/components/ui";
import { formatDate, formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDuracion } from "@/lib/admin/enlaces";
import { adminPath } from "@/lib/admin/paths";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { EstadoBadge } from "../estado-badge";

// Placeholder para que haya shell estático (como en /admin/bodegas/[id]); el
// resto de ids se renderizan a demanda dentro del <Suspense> del layout.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.ejecuciones.title, robots: { index: false } };
}

export default async function EjecucionPage({ params }: PageProps<"/[lang]/admin/ejecuciones/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lang = await getLocale();
  const { admin } = await getDictionary();
  const t = admin.ejecuciones;

  const supabase = await createClient();
  const { data: e, error } = await supabase
    .from("ejecuciones_scraper")
    .select("id, inicio, fin, estado, nuevos, actualizados, errores, log, run_url, fuente:fuentes(slug, nombre)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!e) notFound();
  const n = (x: number) => formatNumber(lang, x);

  return (
    <>
      <AdminHeader
        title={e.fuente?.nombre ?? t.title}
        back={{ href: adminPath(lang, "/ejecuciones"), label: t.title }}
        actions={
          e.run_url && (
            <a
              href={e.run_url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              {t.github}
            </a>
          )
        }
      />
      <dl className="grid gap-3 rounded-card border border-border bg-surface p-4 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-muted">{t.status}</dt>
          <dd>
            <EstadoBadge estado={e.estado} labels={t.estados} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted">{t.start}</dt>
          <dd>{formatDate(lang, e.inicio, { dateStyle: "medium", timeStyle: "medium" })}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted">{t.duration}</dt>
          <dd>{formatDuracion(e.inicio, e.fin) ?? t.running}</dd>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-3">
          <dt className="sr-only">{t.nuevos}</dt>
          <dd className="tabular-nums">
            {n(e.nuevos)} {t.nuevos} · {n(e.actualizados)} {t.actualizados} · {n(e.errores)} {t.errores}
          </dd>
        </div>
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{t.log}</h2>
        {e.log ? (
          <pre className="max-h-[70vh] overflow-auto rounded-card border border-border bg-surface-2 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
            {e.log}
          </pre>
        ) : (
          <p className="text-muted">{t.noLog}</p>
        )}
      </section>
    </>
  );
}
