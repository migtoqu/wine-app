import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader, DeletePanel, Flash } from "@/components/admin/parts";
import { getDictionary, getLocale } from "@/i18n/server";
import { param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { borrarUva, guardarUva } from "../actions";
import { uvaFields } from "../fields";

// Placeholder para que haya shell estático (como en /bodega/[slug]); el resto
// de ids se renderizan a demanda dentro del <Suspense> del layout.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.uvas.title, robots: { index: false } };
}

export default async function UvaPage({ params, searchParams }: PageProps<"/[lang]/admin/uvas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: row, error }, anadas] = await Promise.all([
    supabase.from("variedades_uva").select("*").eq("id", id).maybeSingle(),
    supabase.from("anada_variedades").select("anada_id", { count: "exact", head: true }).eq("variedad_id", id),
  ]);
  if (error) throw new Error(error.message);
  if (!row) notFound();

  return (
    <>
      <AdminHeader title={row.nombre} back={{ href: adminPath(lang, "/uvas"), label: admin.uvas.title }} />
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ creado: admin.common.created }} errors={admin.errors} />
      <EntityForm action={guardarUva} hidden={{ lang, id }} labels={formLabels(dict)} fields={uvaFields(dict, row)} />
      <DeletePanel
        action={borrarUva}
        hidden={{ lang, id }}
        labels={admin.delete}
        scraperNote={false}
        cascade={[]}
        blocked={[{ label: admin.uvas.blocked.anadas, count: anadas.count ?? 0 }]}
      />
    </>
  );
}
