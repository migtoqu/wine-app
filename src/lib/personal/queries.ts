import "server-only";
import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

// Lecturas del espacio personal. Usan el cliente con la sesión del usuario, así
// que la RLS devuelve solo sus filas; no están cacheadas (dependen de cookies).

export type PersonalState = {
  signedIn: boolean;
  favorite: boolean;
  // Texto de la nota por clave (la de la propia entidad o, en vinos, por añada).
  note: string | null;
  anadaNotes: Record<string, string>;
};

const SIGNED_OUT: PersonalState = { signedIn: false, favorite: false, note: null, anadaNotes: {} };

export async function getVinoPersonal(vinoId: string, anadaIds: string[]): Promise<PersonalState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const supabase = await createClient();
  const [fav, nota, anadas] = await Promise.all([
    supabase.from("favoritos").select("id").eq("vino_id", vinoId).maybeSingle(),
    supabase.from("notas").select("texto").eq("vino_id", vinoId).maybeSingle(),
    anadaIds.length
      ? supabase.from("notas").select("anada_id, texto").in("anada_id", anadaIds)
      : { data: [], error: null },
  ]);
  return {
    signedIn: true,
    favorite: Boolean(fav.data),
    note: nota.data?.texto ?? null,
    anadaNotes: Object.fromEntries(
      (anadas.data ?? []).flatMap((n) => (n.anada_id ? [[n.anada_id, n.texto]] : [])),
    ),
  };
}

export async function getBodegaPersonal(bodegaId: string): Promise<PersonalState> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const supabase = await createClient();
  const [fav, nota] = await Promise.all([
    supabase.from("favoritos").select("id").eq("bodega_id", bodegaId).maybeSingle(),
    supabase.from("notas").select("texto").eq("bodega_id", bodegaId).maybeSingle(),
  ]);
  return { signedIn: true, favorite: Boolean(fav.data), note: nota.data?.texto ?? null, anadaNotes: {} };
}

export type FavoritoItem = {
  id: string;
  created_at: string;
  vino: {
    slug: string;
    nombre: string;
    tipo: string;
    bodega: { slug: string; nombre: string };
  } | null;
  bodega: { slug: string; nombre: string; municipio: string | null; provincia: string | null } | null;
};

export async function getFavoritos(): Promise<FavoritoItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("favoritos")
    .select(
      `id, created_at,
       vino:vinos(slug, nombre, tipo, bodega:bodegas!inner(slug, nombre)),
       bodega:bodegas(slug, nombre, municipio, provincia)`,
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`getFavoritos: ${error.message}`);
  return data;
}

export type NotaItem = {
  id: string;
  texto: string;
  updated_at: string;
  vino: { slug: string; nombre: string } | null;
  anada: { anio: number | null; vino: { slug: string; nombre: string } } | null;
  bodega: { slug: string; nombre: string } | null;
};

export async function getNotasRecientes(limit = 20): Promise<NotaItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notas")
    .select(
      `id, texto, updated_at,
       vino:vinos(slug, nombre),
       anada:anadas(anio, vino:vinos!inner(slug, nombre)),
       bodega:bodegas(slug, nombre)`,
    )
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getNotasRecientes: ${error.message}`);
  return data;
}

// --- Mi cava -----------------------------------------------------------------

export type CavaLote = {
  id: string;
  vino_id: string | null;
  anada_id: string | null;
  nombre: string;
  bodega_nombre: string | null;
  anio: number | null;
  cantidad: number;
  formato_ml: number;
  precio_compra: number | null;
  fecha_compra: string | null;
  tienda: string | null;
  ubicacion: string | null;
  beber_desde: number | null;
  beber_hasta: number | null;
  notas: string | null;
  updated_at: string;
  vino: { slug: string } | null;
};

const CAVA_COLUMNS = `id, vino_id, anada_id, nombre, bodega_nombre, anio, cantidad, formato_ml,
  precio_compra, fecha_compra, tienda, ubicacion, beber_desde, beber_hasta, notas, updated_at,
  vino:vinos(slug)`;

export async function getCava(): Promise<CavaLote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cava")
    .select(CAVA_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`getCava: ${error.message}`);
  return data;
}

export async function getCavaLote(id: string): Promise<CavaLote | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cava").select(CAVA_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCavaLote: ${error.message}`);
  return data;
}

// Botellas que el usuario ya tiene de un vino (para la ficha).
export async function getCavaDeVino(vinoId: string): Promise<number | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("cava").select("cantidad").eq("vino_id", vinoId);
  return (data ?? []).reduce((sum, l) => sum + l.cantidad, 0);
}
