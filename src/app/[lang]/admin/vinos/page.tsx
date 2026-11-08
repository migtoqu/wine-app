import type { Metadata } from "next";
import NextLink from "next/link";
import { AdminHeader, AdminList, Flash, NewButton, SearchForm } from "@/components/admin/parts";
import { Pagination } from "@/components/catalog/pagination";
import { getDictionary, getLocale } from "@/i18n/server";
import { ADMIN_PAGE_SIZE, listHref, pageParam, param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.vinos.title, robots: { index: false } };
}

// Reutiliza listar_vinos (búsqueda tolerante, también por nombre de bodega).
// ?bodega=<id> limita a los vinos de una bodega.
export default async function VinosPage({ searchParams }: PageProps<"/[lang]/admin/vinos">) {
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;
  const q = param(sp, "q");
  const bodegaId = isUuid(param(sp, "bodega")) ? param(sp, "bodega") : "";
  const page = pageParam(sp);

  const supabase = await createClient();
  const bodega = bodegaId
    ? (await supabase.from("bodegas").select("id, nombre, slug").eq("id", bodegaId).maybeSingle()).data
    : null;
  const { data, error } = await supabase.rpc("listar_vinos", {
    q: q || undefined,
    bodega: bodega?.slug,
    orden: q ? "relevancia" : "nombre",
    limite: ADMIN_PAGE_SIZE,
    desplazamiento: (page - 1) * ADMIN_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  const total = Number(data[0]?.total ?? 0);
  const base = adminPath(lang, "/vinos");
  const filtros = { q, bodega: bodega?.id ?? "" };

  return (
    <>
      <AdminHeader
        title={admin.vinos.title}
        actions={
          <NewButton
            href={adminPath(lang, "/vinos/nuevo", bodega ? { bodega: bodega.id } : undefined)}
            label={admin.vinos.new}
          />
        }
      >
        {bodega && (
          <p className="text-sm">
            <span className="text-muted">{admin.vinos.filtroBodega}: </span>
            <NextLink href={adminPath(lang, `/bodegas/${bodega.id}`)} className="font-medium underline">
              {bodega.nombre}
            </NextLink>
            {" · "}
            <NextLink href={listHref(base, { q }, 1)} className="text-muted underline">
              {admin.vinos.todasBodegas}
            </NextLink>
          </p>
        )}
      </AdminHeader>
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ borrado: admin.common.deleted }} errors={admin.errors} />
      <SearchForm action={base} q={q} labels={admin.common} hidden={bodega ? { bodega: bodega.id } : {}} />
      <AdminList
        empty={admin.common.noResults}
        items={data.map((v) => ({
          id: v.id,
          href: adminPath(lang, `/vinos/${v.id}`),
          title: v.nombre,
          meta: [v.bodega_nombre, dict.settings.tiposVino[v.tipo], v.crianza && dict.settings.crianzasVino[v.crianza]]
            .filter(Boolean)
            .join(" · "),
        }))}
      />
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))}
        hrefFor={(p) => listHref(base, filtros, p)}
        labels={dict.search}
      />
    </>
  );
}
