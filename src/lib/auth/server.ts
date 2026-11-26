import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { loginPathWithNext } from "./routes";

// Capa de acceso a la sesión (DAL). Todo lo que dependa del usuario pasa por aquí;
// las Server Actions vuelven a llamar a requireUser() en vez de fiarse del cliente.

export type SessionUser = { id: string; email: string | null };
export type Profile = Pick<
  Database["public"]["Tables"]["perfiles"]["Row"],
  "nombre" | "rol" | "idioma" | "tema" | "prefs_email"
>;

// getClaims() verifica el JWT (firma y caducidad); una vez por petición.
// Comprobar la caducidad usa Date.now(): connection() lo deja para el momento
// de la petición en vez de para el prerenderizado (Cache Components).
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("perfiles")
    .select("nombre, rol, idioma, tema, prefs_email")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});

type RequireOptions = {
  // Ruta actual, para volver a ella tras el login.
  next?: string;
  // Obligatorio en Server Actions: next/root-params no funciona ahí.
  lang?: Locale;
};

// Sin sesión → login. El proxy ya lo hace para las páginas; esto cubre Server
// Actions y es la segunda barrera.
export async function requireUser({ next, lang }: RequireOptions = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPathWithNext(lang ?? (await getLocale()), next));
  return user;
}

// No admin → 404 (no desvela que la ruta existe). La RLS es la barrera real.
export async function requireAdmin(
  options: RequireOptions = {},
): Promise<SessionUser & { profile: Profile }> {
  const user = await requireUser(options);
  const profile = await getProfile();
  if (profile?.rol !== "admin") notFound();
  return { ...user, profile };
}
