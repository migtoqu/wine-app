import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatNumber } from "@/i18n/format";
import { localePath } from "@/i18n/config";
import { destacarPremios, sortPremios } from "@/lib/catalog/awards";
import type { Medalla, Premio } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { Badge, Link, type BadgeTone } from "@/components/ui";
import { ExternalIcon, MedalIcon } from "./icons";

// Premios y puntuaciones (SCOPE §5.4, §6.3): medalla o puntos, certamen y edición, añada y
// enlace a la fuente. Sin JS: en la ficha de bodega el resto va en un <details>.

type Labels = Dictionary["catalog"]["awards"];

const TONO: Record<Medalla, BadgeTone> = { gran_oro: "warning", oro: "warning", plata: "neutral", bronce: "accent" };

function Distincion({ lang, labels, premio }: { lang: Locale; labels: Labels; premio: Premio }) {
  if (premio.medalla) {
    return (
      <Badge tone={TONO[premio.medalla]} className="gap-1 text-sm">
        <MedalIcon className="size-4" />
        {labels.medals[premio.medalla]}
      </Badge>
    );
  }
  if (premio.puntos !== null) {
    return (
      <Badge tone="primary" className="text-sm">
        {labels.points(formatNumber(lang, premio.puntos))}
      </Badge>
    );
  }
  return <Badge className="text-sm">{premio.distincion}</Badge>;
}

function AwardItem({
  lang,
  labels,
  premio,
  anioActual,
}: {
  lang: Locale;
  labels: Labels;
  premio: Premio;
  /** Añada elegida en la ficha de vino (resalta sus premios); undefined en la de bodega. */
  anioActual?: number | null;
}) {
  const actual = anioActual !== undefined && premio.anio === anioActual;
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-card border p-4",
        actual ? "border-primary bg-primary-soft/40" : "border-border bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Distincion lang={lang} labels={labels} premio={premio} />
        {premio.medalla && premio.puntos !== null && (
          <span className="text-sm font-semibold">{labels.points(formatNumber(lang, premio.puntos))}</span>
        )}
        {actual && <span className="text-xs font-semibold text-primary">{labels.thisVintage}</span>}
      </div>
      {premio.vino && (
        <p className="font-semibold">
          <Link href={localePath(lang, `/vino/${premio.vino.slug}`)}>{premio.vino.nombre}</Link>
        </p>
      )}
      <p className="flex flex-col">
        <span className="font-semibold">{premio.certamen.nombre}</span>
        <span className="text-sm text-muted">{labels.edition(premio.edicion)}</span>
      </p>
      <p className="text-sm text-muted">
        {premio.anio !== null ? labels.vintage(premio.anio) : labels.noVintage}
        {premio.mencion && <> · {premio.mencion}</>}
      </p>
      {premio.url && (
        <a
          href={premio.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={labels.sourceLabel(premio.certamen.nombre)}
          className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {labels.source}
          <ExternalIcon className="size-4" />
        </a>
      )}
    </li>
  );
}

const GRID = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

/** Bloque «Premios» de la ficha de vino. No se pinta si el vino no tiene premios. */
export function WineAwards({
  lang,
  dict,
  premios,
  anio,
}: {
  lang: Locale;
  dict: Dictionary;
  premios: Premio[];
  anio?: number | null;
}) {
  if (premios.length === 0) return null;
  const labels = dict.catalog.awards;
  return (
    <section aria-labelledby="awards-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="awards-heading" className="text-2xl font-semibold">
          {labels.heading}
        </h2>
        <p className="max-w-prose text-sm text-muted">{labels.intro}</p>
      </div>
      <ul className={GRID}>
        {sortPremios(premios).map((p) => (
          <AwardItem key={p.id} lang={lang} labels={labels} premio={p} anioActual={anio} />
        ))}
      </ul>
    </section>
  );
}

const DESTACADOS = 6;

/** «Premios de sus vinos» en la ficha de bodega: los mejores y el resto plegado. */
export function WineryAwards({ lang, dict, premios }: { lang: Locale; dict: Dictionary; premios: Premio[] }) {
  if (premios.length === 0) return null;
  const labels = dict.catalog.awards;
  const destacados = destacarPremios(premios, DESTACADOS);
  const ids = new Set(destacados.map((p) => p.id));
  const resto = sortPremios(premios.filter((p) => !ids.has(p.id)));
  return (
    <section aria-labelledby="winery-awards-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="winery-awards-heading" className="text-2xl font-semibold">
          {labels.wineryHeading}
        </h2>
        <p className="max-w-prose text-sm text-muted">{labels.wineryIntro(premios.length)}</p>
      </div>
      <ul className={GRID}>
        {destacados.map((p) => (
          <AwardItem key={p.id} lang={lang} labels={labels} premio={p} />
        ))}
      </ul>
      {resto.length > 0 && (
        <details className="group flex flex-col gap-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">
            {labels.seeAll(premios.length)}
          </summary>
          <ul className={cn(GRID, "mt-3")}>
            {resto.map((p) => (
              <AwardItem key={p.id} lang={lang} labels={labels} premio={p} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
