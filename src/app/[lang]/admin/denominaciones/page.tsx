import type { Metadata } from "next";
import { AdminHeader, AdminList, Flash, NewButton, SearchForm } from "@/components/admin/parts";
import { Pagination } from "@/components/catalog/pagination";
import { getDictionary, getLocale } from "@/i18n/server";
import { filterByName, listHref, pageParam, paginate, param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.denominaciones.title, robots: { index: false } };
}

export default async function DenominacionesPage({
  searchParams,
}: PageProps<"/[lang]/admin/denominaciones">) {
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;
  const q = param(sp, "q");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("denominaciones")
    .select("id, nombre, slug, tipo, comunidad")
    .order("nombre");
  if (error) throw new Error(error.message);
  const base = adminPath(lang, "/denominaciones");
  const pagina = paginate(filterByName(data, q), pageParam(sp));

  return (
    <>
      <AdminHeader
        title={admin.denominaciones.title}
        actions={<NewButton href={adminPath(lang, "/denominaciones/nueva")} label={admin.denominaciones.new} />}
      />
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ borrado: admin.common.deleted }} errors={admin.errors} />
      <SearchForm action={base} q={q} labels={admin.common} />
      <AdminList
        empty={admin.common.noResults}
        items={pagina.items.map((d) => ({
          id: d.id,
          href: adminPath(lang, `/denominaciones/${d.id}`),
          title: d.nombre,
          meta: [admin.enums.tipoDenominacion[d.tipo], d.comunidad].filter(Boolean).join(" · "),
        }))}
      />
      <Pagination
        page={pagina.page}
        totalPages={pagina.totalPages}
        hrefFor={(p) => listHref(base, { q }, p)}
        labels={dict.search}
      />
    </>
  );
}
