import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { buttonStyles } from "@/components/ui";
import { cn } from "@/lib/cn";
import { NoteIcon, StarIcon } from "./icons";

// Huecos de las acciones de usuario en las fichas (§5.4, §5.5): ★ favorito y
// nota privada. Solo presentación: la sesión de espacio personal los conecta
// pasando `onToggle`/`onOpen` (o envolviéndolos en un Client Component con
// una server action) y `disabled={false}` cuando haya usuario.

export type CatalogEntity = "vino" | "bodega";

type Labels = Dictionary["catalog"]["userActions"];

type ActionProps = {
  entityType: CatalogEntity;
  entityId: string;
  labels: Labels;
  disabled?: boolean;
};

export function FavoriteButton({
  entityType,
  entityId,
  labels,
  isFavorite = false,
  disabled = true,
  onToggle,
}: ActionProps & { isFavorite?: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      data-entity-type={entityType}
      data-entity-id={entityId}
      aria-pressed={isFavorite}
      aria-disabled={disabled || undefined}
      title={disabled ? labels.signInHint : undefined}
      onClick={disabled ? undefined : onToggle}
      className={buttonStyles({ variant: "secondary", size: "sm" })}
    >
      <StarIcon className={cn("size-4", isFavorite && "fill-current text-primary")} />
      {isFavorite ? labels.favoriteActive : labels.favorite}
    </button>
  );
}

export function PrivateNoteButton({
  entityType,
  entityId,
  labels,
  hasNote = false,
  disabled = true,
  onOpen,
}: ActionProps & { hasNote?: boolean; onOpen?: () => void }) {
  return (
    <button
      type="button"
      data-entity-type={entityType}
      data-entity-id={entityId}
      aria-disabled={disabled || undefined}
      title={disabled ? labels.signInHint : undefined}
      onClick={disabled ? undefined : onOpen}
      className={buttonStyles({ variant: "secondary", size: "sm" })}
    >
      <NoteIcon className="size-4" />
      {hasNote ? labels.noteActive : labels.note}
    </button>
  );
}

// Barra con ambas acciones. `children` permite añadir otras (p. ej. "añadir a lista").
export function UserActions({
  entityType,
  entityId,
  labels,
  children,
}: {
  entityType: CatalogEntity;
  entityId: string;
  labels: Labels;
  children?: ReactNode;
}) {
  return (
    <div role="group" aria-label={labels.label} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <FavoriteButton entityType={entityType} entityId={entityId} labels={labels} />
        <PrivateNoteButton entityType={entityType} entityId={entityId} labels={labels} />
        {children}
      </div>
      <p className="text-xs text-muted">{labels.signInHint}</p>
    </div>
  );
}
