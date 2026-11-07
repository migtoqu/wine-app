"use client";

import NextLink from "next/link";
import { useActionState, useId, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { Button, buttonStyles } from "@/components/ui";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { cn } from "@/lib/cn";
import { saveNote, setFavorite, type NoteState } from "@/lib/personal/actions";
import { NOTA_MAX } from "@/lib/personal/validation";
import { NoteIcon, StarIcon } from "./icons";

// Acciones de usuario en las fichas (§5.4, §5.5): ★ favorito y nota privada.
// El estado inicial viene del servidor (components/catalog/personal-actions);
// aquí solo hay interacción: el favorito es optimista y la nota se edita en un
// panel. Sin sesión, los botones son enlaces al login con `next`.

export type CatalogEntity = "vino" | "bodega";
export type Labels = Dictionary["catalog"]["userActions"];

type Common = {
  lang: string;
  signedIn: boolean;
  loginHref: string;
  labels: Labels;
};

export function FavoriteButton({
  tipo,
  id,
  initial,
  lang,
  signedIn,
  loginHref,
  labels,
}: Common & { tipo: CatalogEntity; id: string; initial: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(initial, (_current, next: boolean) => next);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const icon = <StarIcon className={cn("size-4", optimistic && "fill-current text-primary")} />;

  if (!signedIn) {
    return (
      <NextLink
        href={loginHref}
        title={labels.signIn}
        className={buttonStyles({ variant: "secondary", size: "sm" })}
      >
        {icon}
        {labels.favorite}
      </NextLink>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={optimistic}
        aria-busy={pending || undefined}
        onClick={() =>
          startTransition(async () => {
            setFailed(false);
            const next = !optimistic;
            setOptimistic(next);
            const result = await setFavorite({ lang, tipo, id, favorite: next });
            // Si falla, al terminar la transición vuelve solo al valor del servidor.
            if (!result.ok) setFailed(true);
          })
        }
        className={buttonStyles({ variant: "secondary", size: "sm" })}
      >
        {icon}
        {optimistic ? labels.favoriteActive : labels.favorite}
      </button>
      {failed && (
        <p role="alert" className="text-xs font-medium text-danger">
          {labels.errors.generic}
        </p>
      )}
    </div>
  );
}

// Botón + panel de edición de la nota privada. `subject` aparece como título
// del panel (p. ej. "Añada 2020") y `variant="inline"` muestra el panel
// directamente bajo el botón.
export function NoteEditor({
  tipo,
  id,
  initial,
  lang,
  signedIn,
  loginHref,
  labels,
  subject,
  buttonLabel,
}: Common & {
  tipo: "vino" | "anada" | "bodega";
  id: string;
  initial: string | null;
  subject?: string;
  // Sustituye al texto del botón (p. ej. "Mi nota de esta añada").
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<NoteState, FormData>(saveNote, {
    status: "idle",
  });
  const panelId = useId();
  const hasNote = state.status === "deleted" ? false : state.status === "saved" || Boolean(initial);
  const label = buttonLabel ?? (hasNote ? labels.noteActive : labels.note);

  if (!signedIn) {
    return (
      <NextLink
        href={loginHref}
        title={labels.signIn}
        className={buttonStyles({ variant: "secondary", size: "sm" })}
      >
        <NoteIcon className="size-4" />
        {buttonLabel ?? labels.note}
      </NextLink>
    );
  }

  const errorKey = state.status === "error" ? state.error : undefined;
  const errorId = `${panelId}-error`;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={buttonStyles({ variant: "secondary", size: "sm", className: "self-start" })}
      >
        <NoteIcon className={cn("size-4", hasNote && "text-primary")} />
        {label}
      </button>

      {open && (
        <form
          id={panelId}
          action={formAction}
          className="flex w-full max-w-prose flex-col gap-3 rounded-card border border-border bg-surface p-4"
        >
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="id" value={id} />
          <div className="flex flex-col gap-1">
            <label htmlFor={`${panelId}-texto`} className="font-semibold">
              {subject ? `${labels.noteTitle} · ${subject}` : labels.noteTitle}
            </label>
            <p className="text-sm text-muted">{labels.noteHelp}</p>
          </div>
          <textarea
            id={`${panelId}-texto`}
            name="texto"
            rows={5}
            maxLength={NOTA_MAX}
            defaultValue={state.texto ?? initial ?? ""}
            placeholder={labels.notePlaceholder}
            aria-label={labels.noteField}
            aria-invalid={errorKey ? true : undefined}
            aria-describedby={errorKey ? errorId : undefined}
            // text-base (16px) evita el zoom automático de iOS al enfocar.
            className="w-full resize-y rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-fg placeholder:text-muted aria-invalid:border-danger"
          />
          {errorKey && (
            <p id={errorId} role="alert" className="text-sm font-medium text-danger">
              {labels.errors[errorKey]}
            </p>
          )}
          {state.status === "saved" && !pending && (
            <p role="status" className="text-sm font-medium text-success-soft-fg">
              {labels.noteSaved}
            </p>
          )}
          {state.status === "deleted" && !pending && (
            <p role="status" className="text-sm font-medium text-muted">
              {labels.noteDeleted}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="save" size="sm" loading={pending}>
              {pending ? labels.noteSaving : labels.noteSave}
            </Button>
            {(initial || state.status === "saved") && (
              <Button
                type="submit"
                name="intent"
                value="delete"
                formNoValidate
                variant="ghost"
                size="sm"
                disabled={pending}
              >
                {labels.noteDelete}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {labels.noteClose}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// Barra con ambas acciones. `children` permite añadir otras (p. ej. "añadir a lista").
export function UserActions({
  tipo,
  id,
  favorite,
  note,
  lang,
  signedIn,
  loginHref,
  labels,
  children,
}: Common & {
  tipo: CatalogEntity;
  id: string;
  favorite: boolean;
  note: string | null;
  children?: ReactNode;
}) {
  const common = { lang, signedIn, loginHref, labels };
  return (
    <div role="group" aria-label={labels.label} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-start gap-2">
        <FavoriteButton tipo={tipo} id={id} initial={favorite} {...common} />
        <NoteEditor tipo={tipo} id={id} initial={note} {...common} />
        {children}
      </div>
      {!signedIn && <p className="text-xs text-muted">{labels.signIn}</p>}
    </div>
  );
}

// Esqueleto mientras se lee el estado del usuario (la ficha está cacheada; esto no).
export function UserActionsFallback({ labels }: { labels: Labels }) {
  const cls = buttonStyles({ variant: "secondary", size: "sm", className: "opacity-60" });
  return (
    <div role="group" aria-label={labels.label} aria-busy className="flex flex-wrap gap-2">
      <span className={cls}>
        <StarIcon className="size-4" />
        {labels.favorite}
      </span>
      <span className={cls}>
        <NoteIcon className="size-4" />
        {labels.note}
      </span>
    </div>
  );
}
