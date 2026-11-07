import type { Metadata } from "next";
import { AdminHeader, AdminList, Flash, NewButton, SearchForm } from "@/components/admin/parts";
import { Pagination } from "@/components/catalog/pagination";
import { getDictionary, getLocale } from "@/i18n/server";
import { filterByName, listHref, pageParam, paginate, param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.uvas.title, robots: { index: false } };
}

export default async function UvasPage({ searchParams }: PageProps<"/[lang]/admin/uvas">) {
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;
  const q = param(sp, "q");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("variedades_uva")
    .select("id, nombre, sinonimos, color")
    .order("nombre");
  if (error) throw new Error(error.message);
  const base = adminPath(lang, "/uvas");
  const pagina = paginate(filterByName(data, q), pageParam(sp));

  return (
    <>
      <AdminHeader
        title={admin.uvas.title}
        actions={<NewButton href={adminPath(lang, "/uvas/nueva")} label={admin.uvas.new} />}
      />
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ borrado: admin.common.deleted }} errors={admin.errors} />
      <SearchForm action={base} q={q} labels={admin.common} />
      <AdminList
        empty={admin.common.noResults}
        items={pagina.items.map((u) => ({
          id: u.id,
          href: adminPath(lang, `/uvas/${u.id}`),
          title: u.nombre,
          meta: [u.color && admin.enums.colorUva[u.color], u.sinonimos.join(", ")].filter(Boolean).join(" · "),
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
