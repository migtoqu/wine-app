import type { Metadata } from "next";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader } from "@/components/admin/parts";
import { getDictionary, getLocale } from "@/i18n/server";
import { param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { guardarVino } from "../actions";
import { vinoFields } from "../fields";
import { vinoOptions } from "../options";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.vinos.new, robots: { index: false } };
}

// ?bodega=<id> preselecciona la bodega (enlace "Añadir vino" de su ficha).
export default async function NuevoVinoPage({ searchParams }: PageProps<"/[lang]/admin/vinos/nuevo">) {
  const lang = await getLocale();
  const dict = await getDictionary();
  const bodega = param(await searchParams, "bodega");
  const supabase = await createClient();
  const opciones = await vinoOptions(supabase);
  return (
    <>
      <AdminHeader
        title={dict.admin.vinos.new}
        back={
          isUuid(bodega)
            ? { href: adminPath(lang, `/bodegas/${bodega}`), label: dict.admin.bodegas.title }
            : { href: adminPath(lang, "/vinos"), label: dict.admin.vinos.title }
        }
      />
      <EntityForm
        action={guardarVino}
        hidden={{ lang }}
        labels={formLabels(dict)}
        fields={vinoFields(dict, opciones, isUuid(bodega) ? { bodega_id: bodega } : undefined)}
      />
    </>
  );
}
