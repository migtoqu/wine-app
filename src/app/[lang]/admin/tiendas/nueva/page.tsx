import type { Metadata } from "next";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader } from "@/components/admin/parts";
import { getDictionary, getLocale } from "@/i18n/server";
import { adminPath } from "@/lib/admin/paths";
import { createClient } from "@/lib/supabase/server";
import { guardarTienda } from "../actions";
import { tiendaFields, tiendaOptions } from "../fields";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.tiendas.new, robots: { index: false } };
}

export default async function NuevaTiendaPage() {
  const lang = await getLocale();
  const dict = await getDictionary();
  const opciones = await tiendaOptions(await createClient());
  return (
    <>
      <AdminHeader
        title={dict.admin.tiendas.new}
        back={{ href: adminPath(lang, "/tiendas"), label: dict.admin.tiendas.title }}
      />
      <EntityForm action={guardarTienda} hidden={{ lang }} labels={formLabels(dict)} fields={tiendaFields(dict, opciones)} />
    </>
  );
}
