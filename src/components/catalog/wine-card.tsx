import NextLink from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { localePath, type Locale } from "@/i18n/config";
import { TIPOS_VINO } from "@/lib/catalog/filters";
import type { CrianzaVino, TipoVino, VinoListItem } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";
import { CatalogImage } from "./catalog-image";

// Textos ya resueltos (también se usa desde Client Components).
export type WineCardLabels = {
  wineTypes: Record<TipoVino, string>;
  agings: Record<CrianzaVino, string>;
  noVintage: string;
  placeholderAlt: Record<TipoVino, string>;
};

export function wineCardLabels(dict: Dictionary): WineCardLabels {
  const { catalog } = dict;
  return {
    wineTypes: catalog.wineTypes,
    agings: catalog.agings,
    noVintage: catalog.wine.noVintage,
    placeholderAlt: Object.fromEntries(
      TIPOS_VINO.map((t) => [t, catalog.wine.placeholderAlt(catalog.wineTypes[t])]),
    ) as Record<TipoVino, string>,
  };
}

// "2020 · 2019 · 2018 +2"
function vintagesSummary(anios: VinoListItem["anios"], noVintage: string): string | null {
  if (!anios?.length) return null;
  const labels = anios.map((a) => (a === null ? noVintage : String(a)));
  const shown = labels.slice(0, 3).join(" · ");
  return labels.length > 3 ? `${shown} +${labels.length - 3}` : shown;
}

type Props = {
  lang: Locale;
  wine: VinoListItem;
  labels: WineCardLabels;
  showWinery?: boolean;
  className?: string;
};

export function WineCard({ lang, wine, labels, showWinery = true, className }: Props) {
  const vintages = vintagesSummary(wine.anios, labels.noVintage);
  return (
    <article
      className={cn(
        "group relative flex gap-4 rounded-card border border-border bg-surface p-3 shadow-card transition-colors hover:border-border-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring",
        className,
      )}
    >
      <CatalogImage
        src={wine.imagen_url}
        alt={wine.imagen_alt ?? ""}
        kind="vino"
        tipoVino={wine.tipo}
        placeholderLabel={labels.placeholderAlt[wine.tipo]}
        className="w-20 shrink-0 sm:w-24"
      />
      <div className="flex min-w-0 flex-col gap-1.5 py-1">
        <h3 className="text-lg font-semibold leading-snug">
          {/* El enlace cubre toda la tarjeta (::after) sin anidar elementos interactivos. */}
          <NextLink
            href={localePath(lang, `/vino/${wine.slug}`)}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
          >
            {wine.nombre}
          </NextLink>
        </h3>
        {showWinery && <p className="truncate text-sm text-muted">{wine.bodega_nombre}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="primary">{labels.wineTypes[wine.tipo]}</Badge>
          {wine.crianza && <Badge tone="accent">{labels.agings[wine.crianza]}</Badge>}
        </div>
        {(wine.denominacion_nombre || vintages) && (
          <p className="text-sm text-muted">
            {[wine.denominacion_nombre, vintages].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </article>
  );
}
