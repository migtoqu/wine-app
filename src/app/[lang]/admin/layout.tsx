import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Container } from "@/components/layout/container";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth/server";

// Todo /admin/** exige rol admin (si no, 404). Es solo la primera barrera: cada
// Server Action vuelve a comprobarlo y la RLS protege los datos igualmente.
export default function AdminLayout({ children }: LayoutProps<"/[lang]/admin">) {
  return (
    <Suspense>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

const SECCIONES = ["invitaciones", "usuarios", "bodegas", "vinos", "denominaciones", "uvas", "tiendas", "revision"] as const;

async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const lang = await getLocale();
  const { admin } = await getDictionary();
  const items = [
    { href: localePath(lang, "/admin"), label: admin.nav.inicio, exact: true },
    ...SECCIONES.map((s) => ({ href: localePath(lang, `/admin/${s}`), label: admin.nav[s] })),
  ];
  return (
    <Container className="flex flex-col gap-6 py-6 sm:py-8">
      <AdminNav label={admin.navLabel} items={items} />
      {children}
    </Container>
  );
}
