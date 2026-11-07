import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { CatalogDatabase } from "./types";

// Cliente de Supabase sin cookies ni sesión, solo para leer el catálogo
// (SELECT público por RLS). A diferencia de src/lib/supabase/server.ts no
// llama a cookies(), así que puede usarse dentro de 'use cache'.
export function createPublicClient() {
  return createClient<CatalogDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
