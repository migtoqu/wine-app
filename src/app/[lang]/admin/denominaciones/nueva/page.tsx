import type { Metadata } from "next";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader } from "@/components/admin/parts";
import { getDictionary, getLocale } from "@/i18n/server";
import { adminPath } from "@/lib/admin/paths";
import { guardarDenominacion } from "../actions";
import { denominacionFields } from "../fields";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.denominaciones.new, robots: { index: false } };
}

export default async function NuevaDenominacionPage() {
  const lang = await getLocale();
  const dict = await getDictionary();
  return (
    <>
      <AdminHeader
        title={dict.admin.denominaciones.new}
        back={{ href: adminPath(lang, "/denominaciones"), label: dict.admin.denominaciones.title }}
      />
      <EntityForm
        action={guardarDenominacion}
        hidden={{ lang }}
        labels={formLabels(dict)}
        fields={denominacionFields(dict)}
      />
    </>
  );
}
