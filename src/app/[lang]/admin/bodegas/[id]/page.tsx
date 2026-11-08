import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityForm } from "@/components/admin/entity-form";
import { formLabels } from "@/components/admin/labels";
import { AdminHeader, AdminList, DeletePanel, Flash, NewButton, Section } from "@/components/admin/parts";
import { Link } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { param } from "@/lib/admin/list";
import { adminPath } from "@/lib/admin/paths";
import { isUuid } from "@/lib/admin/validation";
import { createClient } from "@/lib/supabase/server";
import { borrarBodega, guardarBodega } from "../actions";
import { bodegaFields } from "../fields";

// Placeholder para que haya shell estático (como en /bodega/[slug]); el resto
// de ids se renderizan a demanda dentro del <Suspense> del layout.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.bodegas.title, robots: { index: false } };
}

export default async function BodegaPage({ params, searchParams }: PageProps<"/[lang]/admin/bodegas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lang = await getLocale();
  const dict = await getDictionary();
  const { admin } = dict;
  const sp = await searchParams;

  const supabase = await createClient();
  const count = { count: "exact", head: true } as const;
  const [{ data: row, error }, dos, opciones, vinos, servicios, imagenes] = await Promise.all([
    supabase.from("bodegas").select("*").eq("id", id).maybeSingle(),
    supabase.from("bodega_denominaciones").select("denominacion_id, principal").eq("bodega_id", id),
    supabase.from("denominaciones").select("id, nombre").order("nombre"),
    supabase.from("vinos").select("id, nombre, tipo", { count: "exact" }).eq("bodega_id", id).order("nombre").limit(100),
    supabase.from("servicios_bodega").select("id", count).eq("bodega_id", id),
    supabase.from("imagenes").select("id", count).eq("bodega_id", id),
  ]);
  if (error || dos.error || opciones.error || vinos.error) {
    throw new Error((error ?? dos.error ?? opciones.error ?? vinos.error)!.message);
  }
  if (!row) notFound();

  return (
    <>
      <AdminHeader
        title={row.nombre}
        back={{ href: adminPath(lang, "/bodegas"), label: admin.bodegas.title }}
      >
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={localePath(lang, `/bodega/${row.slug}`)}>{admin.common.viewPublic}</Link>
        </p>
        <p className="max-w-prose text-sm text-muted">{admin.common.scraperNote}</p>
      </AdminHeader>
      <Flash ok={param(sp, "ok")} error={param(sp, "error")} messages={{ creado: admin.common.created, vinoBorrado: admin.common.deleted }} errors={admin.errors} />
      <EntityForm
        action={guardarBodega}
        hidden={{ lang, id }}
        labels={formLabels(dict)}
        fields={bodegaFields(
          dict,
          opciones.data.map((d) => ({ value: d.id, label: d.nombre })),
          row,
          dos.data,
        )}
      />

      <Section title={`${admin.bodegas.vinos} (${vinos.count ?? 0})`}>
        <div>
          <NewButton href={adminPath(lang, "/vinos/nuevo", { bodega: id })} label={admin.bodegas.nuevoVino} />
        </div>
        <AdminList
          empty={admin.common.noResults}
          items={vinos.data.map((v) => ({
            id: v.id,
            href: adminPath(lang, `/vinos/${v.id}`),
            title: v.nombre,
            meta: dict.settings.tiposVino[v.tipo],
          }))}
        />
        {(vinos.count ?? 0) > vinos.data.length && (
          <Link href={adminPath(lang, "/vinos", { bodega: id })}>{admin.bodegas.verVinos}</Link>
        )}
      </Section>

      <DeletePanel
        action={borrarBodega}
        hidden={{ lang, id }}
        labels={admin.delete}
        blocked={[{ label: admin.bodegas.blocked.vinos, count: vinos.count ?? 0 }]}
        cascade={[
          { label: admin.bodegas.cascade.denominaciones, count: dos.data.length },
          { label: admin.bodegas.cascade.servicios, count: servicios.count ?? 0 },
          { label: admin.bodegas.cascade.imagenes, count: imagenes.count ?? 0 },
        ]}
      />
    </>
  );
}
