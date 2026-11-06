import { connection } from "next/server";

// Comprueba en cada petición que el proyecto de Supabase responde.
export async function SupabaseStatus() {
  await connection();

  let ok = false;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
        cache: "no-store",
      },
    );
    ok = res.ok;
  } catch {
    ok = false;
  }

  return (
    <p className="flex items-center gap-2 text-sm">
      <span
        className={`size-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      />
      {ok ? "Supabase conectado" : "No se pudo conectar con Supabase"}
    </p>
  );
}
