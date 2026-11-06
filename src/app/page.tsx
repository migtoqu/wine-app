import { Suspense } from "react";
import { SupabaseStatus } from "@/components/supabase-status";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">wine-app</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Base del proyecto: Next.js, Tailwind y Supabase, desplegado en
          Vercel.
        </p>
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-zinc-500">Comprobando Supabase…</p>
        }
      >
        <SupabaseStatus />
      </Suspense>
    </main>
  );
}
