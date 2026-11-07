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
import { borrarAnada, guardarAnada } from "../actions";
import { anadaFields } from "../fields";

// Placeholder para que haya shell estático (como en /bodega/[slug]); el resto
// de ids se renderizan a demanda dentro del <Suspense> del layout.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.anadas.title, robots: { index: false } };
}

export default async function AnadaPage({ params, searchParams }: PageProps<"/[lang]/admin/anadas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: row, error }, composicion, uvas, imagenes] = await Promise.all([
    supabase.from("anadas").select("*, vinos(nombre)").eq("id", id).maybeSingle(),
    supabase.from("anada_variedades").select("variedad_id, porcentaje").eq("anada_id", id).order("porcentaje", { ascending: false, nullsFirst: false }),
    supabase.from("variedades_uva").select("id, nombre").order("nombre"),
    supabase.from("imagenes").select("id", { count: "exact", head: true }).eq("anada_id", id),
  ]);
  if (error || composicion.error || uvas.error) throw new Error((error ?? composicion.error ?? uvas.error)!.message);
  if (!row) notFound();
  const vino = row.vinos?.nombre ?? admin.anadas.vino;
  const titulo = `${vino} · ${row.anio ?? admin.anadas.sinAnada}`;

  return (
    <>
      <AdminHeader title={titulo} back={{ href: adminPath(lang, `/vinos/${row.vino_id}`), label: vino }}>
        <p className="max-w-prose text-sm text-muted">{admin.common.scraperNote}</p>
      </AdminHeader>
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ creado: admin.common.created }} errors={admin.errors} />
      <EntityForm
        action={guardarAnada}
        hidden={{ lang, id }}
        labels={formLabels(dict)}
        fields={anadaFields(dict, uvas.data.map((u) => ({ value: u.id, label: u.nombre })), row, composicion.data)}
      />
      <DeletePanel
        action={borrarAnada}
        hidden={{ lang, id }}
        labels={admin.delete}
        blocked={[]}
        cascade={[
          { label: admin.anadas.cascade.uvas, count: composicion.data.length },
          { label: admin.anadas.cascade.imagenes, count: imagenes.count ?? 0 },
        ]}
      />
    </>
  );
}
