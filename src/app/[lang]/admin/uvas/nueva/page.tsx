import type { Metadata } from "next";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader } from "@/components/admin/parts";
import { getDictionary, getLocale } from "@/i18n/server";
import { adminPath } from "@/lib/admin/paths";
import { guardarUva } from "../actions";
import { uvaFields } from "../fields";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.uvas.new, robots: { index: false } };
}

export default async function NuevaUvaPage() {
  const lang = await getLocale();
  const dict = await getDictionary();
  return (
    <>
      <AdminHeader
        title={dict.admin.uvas.new}
        back={{ href: adminPath(lang, "/uvas"), label: dict.admin.uvas.title }}
      />
      <EntityForm
        action={guardarUva}
        hidden={{ lang }}
        labels={formLabels(dict)}
        fields={uvaFields(dict)}
      />
    </>
  );
}
