import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/server";

// Todo /admin/** exige rol admin (si no, 404). La RLS protege los datos igualmente.
export default function AdminLayout({ children }: LayoutProps<"/[lang]/admin">) {
  return (
    <Suspense>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
