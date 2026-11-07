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
import { borrarDenominacion, guardarDenominacion } from "../actions";
import { denominacionFields } from "../fields";

// Placeholder para que haya shell estático (como en /bodega/[slug]); el resto
// de ids se renderizan a demanda dentro del <Suspense> del layout.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.denominaciones.title, robots: { index: false } };
}

export default async function DenominacionPage({
  params,
  searchParams,
}: PageProps<"/[lang]/admin/denominaciones/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;

  const supabase = await createClient();
  const count = { count: "exact", head: true } as const;
  const [{ data: row, error }, bodegas, vinos] = await Promise.all([
    supabase.from("denominaciones").select("*").eq("id", id).maybeSingle(),
    supabase.from("bodega_denominaciones").select("bodega_id", count).eq("denominacion_id", id),
    supabase.from("vinos").select("id", count).eq("denominacion_id", id),
  ]);
  if (error) throw new Error(error.message);
  if (!row) notFound();

  return (
    <>
      <AdminHeader
        title={row.nombre}
        back={{ href: adminPath(lang, "/denominaciones"), label: admin.denominaciones.title }}
      />
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ creado: admin.common.created }} errors={admin.errors} />
      <EntityForm
        action={guardarDenominacion}
        hidden={{ lang, id }}
        labels={formLabels(dict)}
        fields={denominacionFields(dict, row)}
      />
      <DeletePanel
        action={borrarDenominacion}
        hidden={{ lang, id }}
        labels={admin.delete}
        scraperNote={false}
        cascade={[]}
        blocked={[
          { label: admin.denominaciones.blocked.bodegas, count: bodegas.count ?? 0 },
          { label: admin.denominaciones.blocked.vinos, count: vinos.count ?? 0 },
        ]}
      />
    </>
  );
}
