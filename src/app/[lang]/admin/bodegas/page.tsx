import type { Metadata } from "next";
import { AdminHeader, AdminList, Flash, NewButton, SearchForm } from "@/components/admin/parts";
import { Pagination } from "@/components/catalog/pagination";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { ADMIN_PAGE_SIZE, listHref, pageParam, param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.bodegas.title, robots: { index: false } };
}

// Reutiliza listar_bodegas (búsqueda tolerante a tildes y erratas, con total).
export default async function BodegasPage({ searchParams }: PageProps<"/[lang]/admin/bodegas">) {
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;
  const q = param(sp, "q");
  const page = pageParam(sp);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listar_bodegas", {
    q: q || undefined,
    limite: ADMIN_PAGE_SIZE,
    desplazamiento: (page - 1) * ADMIN_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  const total = Number(data[0]?.total ?? 0);
  const base = adminPath(lang, "/bodegas");

  return (
    <>
      <AdminHeader
        title={admin.bodegas.title}
        actions={<NewButton href={adminPath(lang, "/bodegas/nueva")} label={admin.bodegas.new} />}
      />
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ borrado: admin.common.deleted }} errors={admin.errors} />
      <SearchForm action={base} q={q} labels={admin.common} />
      <AdminList
        empty={admin.common.noResults}
        items={data.map((b) => ({
          id: b.id,
          href: adminPath(lang, `/bodegas/${b.id}`),
          title: b.nombre,
          meta: [b.municipio, b.provincia, b.denominacion_nombre].filter(Boolean).join(" · "),
          badge: (
            <span className="shrink-0 text-sm text-muted tabular-nums">
              {formatNumber(lang, Number(b.num_vinos))} {admin.bodegas.vinos.toLowerCase()}
            </span>
          ),
        }))}
      />
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))}
        hrefFor={(p) => listHref(base, { q }, p)}
        labels={dict.search}
      />
    </>
  );
}
