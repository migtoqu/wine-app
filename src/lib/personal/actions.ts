"use server";

import { refresh } from "next/cache";
import { defaultLocale, hasLocale, type Locale } from "@/i18n/config";
import { requireUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import {
  ENTIDADES_FAVORITO,
  ENTIDADES_NOTA,
  parseEntity,
  validateNote,
  type NoteErrorKey,
} from "./validation";

// Server Actions del espacio personal. La barrera real es la RLS (cada usuario
// solo toca sus filas); aquí se valida la entrada y se exige sesión.

function toLocale(value: unknown): Locale {
  return typeof value === "string" && hasLocale(value) ? value : defaultLocale;
}

// Fija el estado de favorito (idempotente: pedir lo que ya hay no falla).
export async function setFavorite(input: {
  lang: string;
  tipo: string;
  id: string;
  favorite: boolean;
}): Promise<{ ok: boolean }> {
  const entity = parseEntity(input.tipo, input.id, ENTIDADES_FAVORITO);
  if (!entity || typeof input.favorite !== "boolean") return { ok: false };
  const user = await requireUser({ lang: toLocale(input.lang) });
  const supabase = await createClient();
  const column = entity.tipo === "vino" ? "vino_id" : "bodega_id";

  if (input.favorite) {
    const { error } = await supabase.from("favoritos").upsert(
      {
        usuario_id: user.id,
        vino_id: entity.tipo === "vino" ? entity.id : null,
        bodega_id: entity.tipo === "bodega" ? entity.id : null,
      },
      { onConflict: "usuario_id,vino_id,bodega_id", ignoreDuplicates: true },
    );
    if (error) return { ok: false };
  } else {
    const { error } = await supabase
      .from("favoritos")
      .delete()
      .eq("usuario_id", user.id)
      .eq(column, entity.id);
    if (error) return { ok: false };
  }

  refresh();
  return { ok: true };
}

export type NoteState = {
  status: "idle" | "saved" | "deleted" | "error";
  error?: NoteErrorKey | "generic";
  // Texto con el que volver a rellenar el formulario.
  texto?: string;
};

// Guarda o borra la nota del usuario sobre un vino, una añada o una bodega.
// Una sola acción para ambos botones: `intent` es "save" o "delete".
export async function saveNote(_prev: NoteState, form: FormData): Promise<NoteState> {
  const rawText = form.get("texto");
  const submitted = typeof rawText === "string" ? rawText : "";
  const entity = parseEntity(form.get("tipo"), form.get("id"), ENTIDADES_NOTA);
  if (!entity) return { status: "error", error: "generic", texto: submitted };

  const user = await requireUser({ lang: toLocale(form.get("lang")) });
  const supabase = await createClient();
  const column = `${entity.tipo}_id` as const;

  if (form.get("intent") === "delete") {
    const { error } = await supabase
      .from("notas")
      .delete()
      .eq("usuario_id", user.id)
      .eq(column, entity.id);
    if (error) return { status: "error", error: "generic", texto: submitted };
    refresh();
    return { status: "deleted", texto: "" };
  }

  const parsed = validateNote(rawText);
  if (!parsed.ok) return { status: "error", error: parsed.error, texto: submitted };

  // PostgREST hace `on conflict do update` sobre todas las columnas del payload
  // y la RLS solo deja editar `texto`: update primero y, si no hay fila, insert
  // (con reintento del update si otra pestaña la crea entre medias).
  const updateText = () =>
    supabase
      .from("notas")
      .update({ texto: parsed.texto })
      .eq("usuario_id", user.id)
      .eq(column, entity.id)
      .select("id");
  let result = await updateText();
  if (!result.error && result.data.length === 0) {
    const insert = await supabase.from("notas").insert({
      usuario_id: user.id,
      texto: parsed.texto,
      vino_id: entity.tipo === "vino" ? entity.id : null,
      anada_id: entity.tipo === "anada" ? entity.id : null,
      bodega_id: entity.tipo === "bodega" ? entity.id : null,
    });
    if (insert.error?.code === "23505") result = await updateText();
    else if (insert.error) return { status: "error", error: "generic", texto: submitted };
  } else if (result.error) {
    return { status: "error", error: "generic", texto: submitted };
  }
  if (result.error) return { status: "error", error: "generic", texto: submitted };

  refresh();
  return { status: "saved", texto: parsed.texto };
}
