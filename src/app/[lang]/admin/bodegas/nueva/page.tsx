import type { Metadata } from "next";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader } from "@/components/admin/parts";
import { getDictionary, getLocale } from "@/i18n/server";
import { adminPath } from "@/lib/admin/paths";
import { createClient } from "@/lib/supabase/server";
import { guardarBodega } from "../actions";
import { bodegaFields } from "../fields";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.bodegas.new, robots: { index: false } };
}

export default async function NuevaBodegaPage() {
  const lang = await getLocale();
  const dict = await getDictionary();
  const supabase = await createClient();
  const { data, error } = await supabase.from("denominaciones").select("id, nombre").order("nombre");
  if (error) throw new Error(error.message);
  return (
    <>
      <AdminHeader
        title={dict.admin.bodegas.new}
        back={{ href: adminPath(lang, "/bodegas"), label: dict.admin.bodegas.title }}
      />
      <EntityForm
        action={guardarBodega}
        hidden={{ lang }}
        labels={formLabels(dict)}
        fields={bodegaFields(dict, data.map((d) => ({ value: d.id, label: d.nombre })))}
      />
    </>
  );
}
