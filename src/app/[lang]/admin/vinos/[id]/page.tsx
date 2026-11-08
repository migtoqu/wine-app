import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader, AdminList, DeletePanel, Flash, NewButton, Section } from "@/components/admin/parts";
import { Link } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { borrarVino, guardarVino } from "../actions";
import { vinoFields } from "../fields";
import { vinoOptions } from "../options";

// Placeholder para que haya shell estático (como en /bodega/[slug]); el resto
// de ids se renderizan a demanda dentro del <Suspense> del layout.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.vinos.title, robots: { index: false } };
}

export default async function VinoPage({ params, searchParams }: PageProps<"/[lang]/admin/vinos/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: row, error }, anadas, imagenes, opciones] = await Promise.all([
    supabase.from("vinos").select("*, bodegas(nombre)").eq("id", id).maybeSingle(),
    supabase.from("anadas").select("id, anio, grado").eq("vino_id", id).order("anio", { ascending: false, nullsFirst: false }),
    supabase.from("imagenes").select("id", { count: "exact", head: true }).eq("vino_id", id),
    vinoOptions(supabase),
  ]);
  if (error || anadas.error) throw new Error((error ?? anadas.error)!.message);
  if (!row) notFound();
  const anadaIds = anadas.data.map((a) => a.id);
  const imagenesAnadas = anadaIds.length
    ? (await supabase.from("imagenes").select("id", { count: "exact", head: true }).in("anada_id", anadaIds)).count
    : 0;

  return (
    <>
      <AdminHeader
        title={row.nombre}
        back={{ href: adminPath(lang, `/bodegas/${row.bodega_id}`), label: row.bodegas?.nombre ?? admin.bodegas.title }}
      >
        <p className="text-sm">
          <Link href={localePath(lang, `/vino/${row.slug}`)}>{admin.common.viewPublic}</Link>
        </p>
        <p className="max-w-prose text-sm text-muted">{admin.common.scraperNote}</p>
      </AdminHeader>
      <Flash
        ok={param(sp, "ok")}
        error={param(sp, "error")}
        messages={{ creado: admin.common.created, anadaBorrada: admin.common.deleted }}
        errors={admin.errors}
      />
      <EntityForm action={guardarVino} hidden={{ lang, id }} labels={formLabels(dict)} fields={vinoFields(dict, opciones, row)} />

      <Section title={admin.vinos.anadas}>
        <div>
          <NewButton href={adminPath(lang, `/vinos/${id}/anadas/nueva`)} label={admin.vinos.nuevaAnada} />
        </div>
        <AdminList
          empty={admin.vinos.sinAnadas}
          items={anadas.data.map((a) => ({
            id: a.id,
            href: adminPath(lang, `/anadas/${a.id}`),
            title: a.anio === null ? admin.anadas.sinAnada : String(a.anio),
            meta: a.grado === null ? undefined : `${a.grado} % vol.`,
          }))}
        />
      </Section>

      <DeletePanel
        action={borrarVino}
        hidden={{ lang, id }}
        labels={admin.delete}
        blocked={[]}
        cascade={[
          { label: admin.vinos.cascade.anadas, count: anadas.data.length },
          { label: admin.vinos.cascade.imagenes, count: (imagenes.count ?? 0) + (imagenesAnadas ?? 0) },
        ]}
      />
    </>
  );
}
