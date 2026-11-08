import type { Metadata } from "next";
import NextLink from "next/link";
import { AdminHeader, Flash, Section } from "@/components/admin/parts";
import { Badge, Button, buttonStyles } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { adminPath } from "@/lib/admin/paths";
import { leerRegistroRevision, type CandidatoRevision } from "@/lib/admin/revision";
import { createClient } from "@/lib/supabase/server";
import { decidirRegistro, fusionar } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.revision.title, robots: { index: false } };
}

const POR_PAGINA = 50;
const inputCls = "h-11 min-w-0 rounded-control border border-border-strong bg-surface px-3 text-base";

function Hidden({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
}

export default async function RevisionPage({ searchParams }: PageProps<"/[lang]/admin/revision">) {
  const lang = await getLocale();
  const { admin } = await getDictionary();
  const t = admin.revision;
  const sp = (await searchParams) as { ok?: string; error?: string; pagina?: string };
  const pagina = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("registros_fuente")
    .select("id, url, datos, confianza_emparejamiento, updated_at, fuente:fuentes(nombre)", { count: "exact" })
    .eq("estado_emparejamiento", "revision")
    .order("confianza_emparejamiento", { ascending: false, nullsFirst: false })
    .order("id")
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (error) throw new Error(error.message);

  const registros = data.map((r) => ({ ...r, info: leerRegistroRevision(r.datos) }));
  // Slugs de las candidatas, para enlazar a su ficha pública.
  const idsBodega = [...new Set(registros.flatMap((r) => r.info.candidatos.map((c) => c.id)))];
  const idsVino = [...new Set(registros.flatMap((r) => r.info.vinos.map((c) => c.id)))];
  const [bodegas, vinos] = await Promise.all([
    idsBodega.length ? supabase.from("bodegas").select("id, slug").in("id", idsBodega) : { data: [] },
    idsVino.length ? supabase.from("vinos").select("id, slug").in("id", idsVino) : { data: [] },
  ]);
  const slugBodega = new Map((bodegas.data ?? []).map((b) => [b.id, b.slug]));
  const slugVino = new Map((vinos.data ?? []).map((v) => [v.id, v.slug]));
  const total = count ?? 0;
  const pct = (n: number | null) => (n == null ? "—" : formatNumber(lang, n, { style: "percent" }));

  return (
    <>
      <AdminHeader title={t.title}>
        <p className="max-w-prose text-muted">{t.intro}</p>
      </AdminHeader>
      <Flash ok={sp.ok} error={sp.error} messages={{ decidido: t.decided, fusionado: t.merged }} errors={admin.errors} />

      <Section title={`${t.title} (${formatNumber(lang, total)})`}>
        {registros.length === 0 ? (
          <p className="text-muted">{t.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {registros.map((r) => {
              const base = { lang, registro: r.id, ficha: r.info.tipo };
              return (
                <li key={r.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 font-medium break-words">{r.info.nombre}</span>
                    <Badge tone="neutral">{r.info.tipo === "bodega" ? t.kindBodega : t.kindVino}</Badge>
                    <Badge tone="warning">
                      {t.confidence} {pct(r.confianza_emparejamiento)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {t.source}: {r.fuente?.nombre ?? "—"}
                    {r.url && (
                      <>
                        {" · "}
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                          {t.openSource}
                        </a>
                      </>
                    )}
                    {r.info.motivo && ` · ${t.reason}: ${r.info.motivo}`}
                  </p>

                  <Candidatas
                    titulo={t.candidates}
                    vacio={t.noCandidates}
                    lista={r.info.candidatos}
                    href={(id) => (slugBodega.get(id) ? localePath(lang, `/bodega/${slugBodega.get(id)}`) : null)}
                    lang={lang}
                    acciones={(c) => (
                      <>
                        <form action={decidirRegistro}>
                          <Hidden values={{ ...base, decision: "asociar", tipo: "bodega", destino: c.id }} />
                          <Button type="submit" size="sm" variant="secondary">{t.associate}</Button>
                        </form>
                        {r.info.tipo === "vino" && (
                          <form action={decidirRegistro}>
                            <Hidden values={{ ...base, decision: "crear", tipo: "bodega", destino: c.id }} />
                            <Button type="submit" size="sm" variant="ghost">{t.createWineIn}</Button>
                          </form>
                        )}
                      </>
                    )}
                  />

                  {r.info.vinos.length > 0 && (
                    <Candidatas
                      titulo={t.similarWines}
                      vacio=""
                      lista={r.info.vinos}
                      href={(id) => (slugVino.get(id) ? localePath(lang, `/vino/${slugVino.get(id)}`) : null)}
                      lang={lang}
                      acciones={(c) => (
                        <form action={decidirRegistro}>
                          <Hidden values={{ ...base, decision: "asociar", tipo: "vino", destino: c.id }} />
                          <Button type="submit" size="sm" variant="secondary">{t.associate}</Button>
                        </form>
                      )}
                    />
                  )}

                  <div className="flex flex-wrap items-end gap-2">
                    <form action={decidirRegistro} className="flex flex-wrap items-end gap-2">
                      <Hidden values={{ ...base, decision: "asociar" }} />
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-muted">{t.associateTo}</span>
                        <span className="flex gap-2">
                          <select name="tipo" aria-label={t.kind} className={inputCls} defaultValue="bodega">
                            <option value="bodega">{t.kindBodega}</option>
                            <option value="vino">{t.kindVino}</option>
                          </select>
                          <input name="slug" placeholder={t.slug} aria-label={t.slug} className={inputCls} required />
                        </span>
                      </label>
                      <Button type="submit" size="sm" variant="secondary">{t.associate}</Button>
                    </form>
                    {r.info.tipo === "bodega" && (
                      <form action={decidirRegistro}>
                        <Hidden values={{ ...base, decision: "crear" }} />
                        <Button type="submit" size="sm" variant="secondary">{t.createWinery}</Button>
                      </form>
                    )}
                    <form action={decidirRegistro}>
                      <Hidden values={{ ...base, decision: "descartar" }} />
                      <Button type="submit" size="sm" variant="ghost">{t.discard}</Button>
                    </form>
                  </div>

                  {r.info.candidatos.length >= 2 && (
                    <form action={fusionar} className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                      <Hidden
                        values={{
                          lang, registro: r.id, tipo: "bodega",
                          origen: r.info.candidatos[1]!.id, destino: r.info.candidatos[0]!.id,
                        }}
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="confirmar" required className="size-4" />
                        {t.confirm}
                      </label>
                      <Button type="submit" size="sm" variant="secondary">
                        {t.mergeCandidates}: {r.info.candidatos[1]!.nombre} → {r.info.candidatos[0]!.nombre}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {total > POR_PAGINA && (
          <nav className="flex justify-between gap-2" aria-label={t.title}>
            {pagina > 1 ? (
              <NextLink href={adminPath(lang, "/revision", { pagina: String(pagina - 1) })} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                ← {t.previous}
              </NextLink>
            ) : <span />}
            {pagina * POR_PAGINA < total && (
              <NextLink href={adminPath(lang, "/revision", { pagina: String(pagina + 1) })} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                {t.next} →
              </NextLink>
            )}
          </nav>
        )}
      </Section>

      <Section title={t.mergeTitle} className="rounded-card border border-border bg-surface p-4 sm:p-5">
        <p className="max-w-prose text-sm text-muted">{t.mergeIntro}</p>
        <form action={fusionar} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="lang" value={lang} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t.kind}</span>
            <select name="tipo" className={inputCls} defaultValue="bodega">
              <option value="bodega">{t.kindBodega}</option>
              <option value="vino">{t.kindVino}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t.origin} — {t.slug}</span>
            <input name="origen_slug" className={inputCls} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{t.destination} — {t.slug}</span>
            <input name="destino_slug" className={inputCls} required />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="confirmar" required className="size-4" />
            {t.confirm}
          </label>
          <div className="sm:text-right">
            <Button type="submit" variant="secondary">{t.merge}</Button>
          </div>
        </form>
      </Section>
    </>
  );
}

function Candidatas({
  titulo,
  vacio,
  lista,
  href,
  lang,
  acciones,
}: {
  titulo: string;
  vacio: string;
  lista: CandidatoRevision[];
  href: (id: string) => string | null;
  lang: Locale;
  acciones: (c: CandidatoRevision) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {lista.length === 0 ? (
        <p className="text-sm text-muted">{vacio}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-control border border-border">
          {lista.map((c) => {
            const enlace = href(c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  {enlace ? (
                    <NextLink href={enlace} className="font-medium underline underline-offset-4">{c.nombre || c.id}</NextLink>
                  ) : (
                    <span className="font-medium">{c.nombre || c.id}</span>
                  )}
                  {c.puntuacion != null && (
                    <span className="text-muted"> · {formatNumber(lang, c.puntuacion, { style: "percent" })}</span>
                  )}
                  {c.motivo && <span className="text-muted"> · {c.motivo}</span>}
                </span>
                <span className="flex flex-wrap gap-2">{acciones(c)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
