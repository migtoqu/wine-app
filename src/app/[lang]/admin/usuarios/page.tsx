import type { Metadata } from "next";
import { AdminHeader, Flash } from "@/components/admin/parts";
import { Badge, Button } from "@/components/ui";
import { formatDate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { cambiarRol } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await getDictionary();
  return { title: admin.usuarios.title, robots: { index: false } };
}

export default async function UsuariosPage({ searchParams }: PageProps<"/[lang]/admin/usuarios">) {
  const lang = await getLocale();
  const { admin } = await getDictionary();
  const t = admin.usuarios;
  const { ok, error } = (await searchParams) as { ok?: string; error?: string };

  const supabase = await createClient();
  const [{ data, error: dbError }, me] = await Promise.all([
    supabase.rpc("admin_listar_usuarios"),
    getCurrentUser(),
  ]);
  if (dbError) throw new Error(dbError.message);
  const date = (d: string) => formatDate(lang, d, { dateStyle: "medium" });

  return (
    <>
      <AdminHeader title={t.title}>
        <p className="max-w-prose text-muted">{t.intro}</p>
      </AdminHeader>
      <Flash ok={ok} error={error} messages={{ rol: t.roleChanged }} errors={admin.errors} />
      {data.length === 0 ? (
        <p className="text-muted">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {data.map((u) => {
            const esAdmin = u.rol === "admin";
            return (
              <li key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-medium">{u.email}</span>
                    {esAdmin && <Badge tone="accent">{admin.enums.rol.admin}</Badge>}
                    {u.id === me?.id && <Badge>{t.tu}</Badge>}
                  </div>
                  <p className="text-sm text-muted">
                    {u.nombre ?? t.sinNombre} · {t.alta} {date(u.created_at)} · {t.ultimoAcceso}{" "}
                    {u.last_sign_in_at ? date(u.last_sign_in_at) : t.nunca}
                  </p>
                </div>
                <form action={cambiarRol}>
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="rol" value={esAdmin ? "user" : "admin"} />
                  <Button type="submit" size="sm" variant={esAdmin ? "ghost" : "secondary"} className="w-full sm:w-auto">
                    {esAdmin ? t.quitarAdmin : t.hacerAdmin}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
