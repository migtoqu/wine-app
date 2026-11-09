import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader, DeletePanel, Flash, Section } from "@/components/admin/parts";
import { Badge, Button } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { formatPrice } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { borrarTienda, guardarTienda, ocultarOferta } from "../actions";
import { tiendaFields, tiendaOptions } from "../fields";

// Placeholder para que haya shell estático; el resto de ids se renderizan a demanda.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.tiendas.title, robots: { index: false } };
}

const MAX_OFERTAS = 200;

export default async function TiendaPage({ params, searchParams }: PageProps<"/[lang]/admin/tiendas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: row, error }, ofertas, opciones] = await Promise.all([
    supabase.from("tiendas").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("ofertas")
      .select(
        "id, url, precio, formato_ml, disponible, oculta_admin, estado_enlace, vino:vinos(slug, nombre), anada:anadas(anio)",
        { count: "exact" },
      )
      .eq("tienda_id", id)
      .order("oculta_admin", { ascending: false })
      .order("visto_por_ultima_vez", { ascending: false })
      .limit(MAX_OFERTAS),
    tiendaOptions(supabase),
  ]);
  if (error) throw new Error(error.message);
  if (ofertas.error) throw new Error(ofertas.error.message);
  if (!row) notFound();
  const total = ofertas.count ?? ofertas.data.length;
  const t = admin.tiendas;

  return (
    <>
      <AdminHeader title={row.nombre} back={{ href: adminPath(lang, "/tiendas"), label: t.title }} />
      <Flash
        ok={param(sp, "ok")}
        error={param(sp, "error")}
        messages={{ creado: admin.common.created, guardado: admin.common.saved }}
        errors={admin.errors}
      />
      <EntityForm
        action={guardarTienda}
        hidden={{ lang, id }}
        labels={formLabels(dict)}
        fields={tiendaFields(dict, opciones, row)}
      />

      <Section title={`${t.offers} (${total})`}>
        <p className="text-sm text-muted">{t.offersIntro}</p>
        {ofertas.data.length === 0 ? (
          <p className="text-muted">{t.noOffers}</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {ofertas.data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">
                    {o.vino ? (
                      <NextLink href={localePath(lang, `/vino/${o.vino.slug}`)} className="hover:underline">
                        {o.vino.nombre}
                      </NextLink>
                    ) : (
                      "—"
                    )}
                    {o.anada?.anio ? ` ${o.anada.anio}` : ""}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                    <span className="tabular-nums">{formatPrice(lang, Number(o.precio))}</span>
                    <span>{dict.catalog.prices.formatLabel(o.formato_ml)}</span>
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="truncate underline">
                      {o.url}
                    </a>
                    {o.oculta_admin && <Badge tone="warning">{t.hidden}</Badge>}
                    {!o.disponible && <Badge>{t.unavailable}</Badge>}
                    {o.estado_enlace === "oculto" && <Badge tone="warning">{t.linkHidden}</Badge>}
                  </span>
                </span>
                <form action={ocultarOferta}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="tienda_id" value={id} />
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="oculta" value={o.oculta_admin ? "no" : "si"} />
                  <Button type="submit" variant="secondary" size="sm">
                    {o.oculta_admin ? t.show : t.hide}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {total > ofertas.data.length && <p className="text-sm text-muted">{t.moreOffers(total - ofertas.data.length)}</p>}
      </Section>

      <DeletePanel
        action={borrarTienda}
        hidden={{ lang, id }}
        labels={admin.delete}
        scraperNote={false}
        cascade={[{ label: t.cascade.ofertas, count: total }]}
        blocked={[]}
      />
    </>
  );
}
