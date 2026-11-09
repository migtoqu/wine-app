import type { Metadata } from "next";
import { AdminHeader, AdminList, Flash, NewButton, SearchForm } from "@/components/admin/parts";
import { Pagination } from "@/components/catalog/pagination";
import { Badge } from "@/components/ui";
import { getDictionary, getLocale } from "@/i18n/server";
import { filterByName, listHref, pageParam, paginate, param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.tiendas.title, robots: { index: false } };
}

export default async function TiendasPage({ searchParams }: PageProps<"/[lang]/admin/tiendas">) {
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;
  const q = param(sp, "q");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tiendas")
    .select("id, nombre, slug, tipo, dominio, activa, ofertas(count)")
    .order("nombre");
  if (error) throw new Error(error.message);
  const base = adminPath(lang, "/tiendas");
  const pagina = paginate(filterByName(data, q), pageParam(sp));

  return (
    <>
      <AdminHeader
        title={admin.tiendas.title}
        actions={<NewButton href={adminPath(lang, "/tiendas/nueva")} label={admin.tiendas.new} />}
      />
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ borrado: admin.common.deleted }} errors={admin.errors} />
      <SearchForm action={base} q={q} labels={admin.common} />
      <AdminList
        empty={admin.common.noResults}
        items={pagina.items.map((t) => ({
          id: t.id,
          href: adminPath(lang, `/tiendas/${t.id}`),
          title: t.nombre,
          meta: [
            admin.enums.tipoTienda[t.tipo],
            t.dominio,
            admin.tiendas.offersCount(t.ofertas[0]?.count ?? 0),
          ]
            .filter(Boolean)
            .join(" · "),
          badge: t.activa ? undefined : <Badge>{admin.tiendas.inactive}</Badge>,
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
