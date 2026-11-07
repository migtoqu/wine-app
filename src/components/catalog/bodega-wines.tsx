"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { CRIANZAS, PARAM, parseSearchFilters, TIPOS_VINO } from "@/lib/catalog/filters";
import type { CrianzaVino, TipoVino, VinoListItem } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { WineCard, type WineCardLabels } from "./wine-card";

type Props = {
  lang: Locale;
  wines: VinoListItem[];
  labels: WineCardLabels & {
    filterType: string;
    filterAging: string;
    all: string;
    noMatch: string;
    clear: string;
    // counts[n] = "n vinos" (n hasta wines.length).
    counts: string[];
  };
};

// Vinos de la ficha de bodega con filtro por tipo y crianza. Se filtra en el
// navegador sobre la lista ya cacheada (una bodega tiene pocas decenas de
// vinos), así la ficha sigue siendo estática. El filtro se refleja en la URL
// (?tipo=&crianza=) con replaceState para poder compartirla.
export function BodegaWines({ lang, wines, labels }: Props) {
  const [tipos, setTipos] = useState<TipoVino[]>([]);
  const [crianzas, setCrianzas] = useState<CrianzaVino[]>([]);

  // Filtros iniciales desde la URL (sin useSearchParams: no hace falta Suspense).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = parseSearchFilters({
      [PARAM.tipos]: params.getAll(PARAM.tipos),
      [PARAM.crianzas]: params.getAll(PARAM.crianzas),
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronización única con la URL al montar
    setTipos(f.tipos);
    setCrianzas(f.crianzas);
  }, []);

  const update = (nextTipos: TipoVino[], nextCrianzas: CrianzaVino[]) => {
    setTipos(nextTipos);
    setCrianzas(nextCrianzas);
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM.tipos);
    url.searchParams.delete(PARAM.crianzas);
    nextTipos.forEach((t) => url.searchParams.append(PARAM.tipos, t));
    nextCrianzas.forEach((c) => url.searchParams.append(PARAM.crianzas, c));
    window.history.replaceState(window.history.state, "", url);
  };

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  // Solo se ofrecen los valores presentes en esta bodega.
  const tiposDisponibles = TIPOS_VINO.filter((t) => wines.some((w) => w.tipo === t));
  const crianzasDisponibles = CRIANZAS.filter((c) => wines.some((w) => w.crianza === c));
  const visibles = wines.filter(
    (w) =>
      (tipos.length === 0 || tipos.includes(w.tipo)) &&
      (crianzas.length === 0 || (w.crianza !== null && crianzas.includes(w.crianza))),
  );

  const chip = (pressed: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium",
      pressed
        ? "border-primary bg-primary text-primary-fg"
        : "border-border-strong bg-surface hover:bg-surface-2",
    );

  const group = <T extends string>(
    label: string,
    values: readonly T[],
    selected: T[],
    names: Record<T, string>,
    onChange: (next: T[]) => void,
  ) =>
    values.length > 1 && (
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold">{label}</span>
        <button
          type="button"
          aria-pressed={selected.length === 0}
          onClick={() => onChange([])}
          className={chip(selected.length === 0)}
        >
          {labels.all}
        </button>
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={selected.includes(v)}
            onClick={() => onChange(toggle(selected, v))}
            className={chip(selected.includes(v))}
          >
            {names[v]}
          </button>
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {group(labels.filterType, tiposDisponibles, tipos, labels.wineTypes, (next) =>
          update(next, crianzas),
        )}
        {group(labels.filterAging, crianzasDisponibles, crianzas, labels.agings, (next) =>
          update(tipos, next),
        )}
      </div>
      <p aria-live="polite" className="text-sm text-muted">
        {labels.counts[visibles.length] ?? visibles.length}
      </p>
      {visibles.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visibles.map((wine) => (
            <li key={wine.id} className="flex">
              <WineCard lang={lang} wine={wine} labels={labels} showWinery={false} className="w-full" />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border p-6">
          <p className="text-muted">{labels.noMatch}</p>
          <button
            type="button"
            onClick={() => update([], [])}
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            {labels.clear}
          </button>
        </div>
      )}
    </div>
  );
}
