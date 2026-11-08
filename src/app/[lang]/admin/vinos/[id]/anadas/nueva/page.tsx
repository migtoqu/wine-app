import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader } from "@/components/admin/parts";
import { getDictionary, getLocale } from "@/i18n/server";
import { adminPath } from "@/lib/admin/paths";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { guardarAnada } from "../../../../anadas/actions";
import { anadaFields } from "../../../../anadas/fields";

// Placeholder para que haya shell estático (como en /bodega/[slug]); el resto
// de ids se renderizan a demanda dentro del <Suspense> del layout.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.anadas.new, robots: { index: false } };
}

export default async function NuevaAnadaPage({ params }: PageProps<"/[lang]/admin/vinos/[id]/anadas/nueva">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lang = await getLocale();
  const dict = await getDictionary();
  const supabase = await createClient();
  const [vino, uvas] = await Promise.all([
    supabase.from("vinos").select("id, nombre").eq("id", id).maybeSingle(),
    supabase.from("variedades_uva").select("id, nombre").order("nombre"),
  ]);
  if (vino.error || uvas.error) throw new Error((vino.error ?? uvas.error)!.message);
  if (!vino.data) notFound();
  return (
    <>
      <AdminHeader
        title={`${dict.admin.anadas.new} · ${vino.data.nombre}`}
        back={{ href: adminPath(lang, `/vinos/${id}`), label: vino.data.nombre }}
      />
      <EntityForm
        action={guardarAnada}
        hidden={{ lang, vino_id: id }}
        labels={formLabels(dict)}
        fields={anadaFields(dict, uvas.data.map((u) => ({ value: u.id, label: u.nombre })))}
      />
    </>
  );
}
