"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { localePath, type Locale } from "@/i18n/config";
import { highlightParts } from "@/lib/catalog/highlight";
import type { SearchSuggestion, TipoVino } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { SearchIcon } from "./icons";

export type SearchComboboxLabels = {
  label: string;
  placeholder: string;
  submit: string;
  clear: string;
  suggestionsLabel: string;
  groupWines: string;
  groupWineries: string;
  // Con "{q}" donde va la consulta.
  seeAll: string;
  loading: string;
  noSuggestions: string;
  // counts[n] = texto para n sugerencias (región aria-live).
  counts: string[];
  wineTypes: Record<TipoVino, string>;
};

type Props = {
  lang: Locale;
  labels: SearchComboboxLabels;
  defaultValue?: string;
  autoFocus?: boolean;
  size?: "md" | "lg";
  className?: string;
};

type Option =
  | { kind: "item"; item: SearchSuggestion; href: string }
  | { kind: "all"; href: string };

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;

// Caja de búsqueda con autocompletado (patrón combobox + listbox de ARIA 1.2).
// Es un <form method="get"> real hacia /buscar: sin JS sigue funcionando.
// Teclado: ↑/↓ recorren las sugerencias, Inicio/Fin la primera y la última,
// Intro abre la activa (o busca), Escape cierra y, si ya está cerrada, borra.
export function SearchCombobox({
  lang,
  labels,
  defaultValue = "",
  autoFocus = false,
  size = "md",
  className,
}: Props) {
  const router = useRouter();
  const id = useId();
  const inputId = `${id}-input`;
  const listboxId = `${id}-listbox`;
  const optionId = (i: number) => `${id}-option-${i}`;

  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<SearchSuggestion[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const cache = useRef(new Map<string, SearchSuggestion[]>());
  const rootRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const searchHref = (q: string) => `${localePath(lang, "/buscar")}?q=${encodeURIComponent(q)}`;

  // Petición con debounce; se cancela si el usuario sigue escribiendo.
  useEffect(() => {
    if (trimmed.length < MIN_CHARS) return;
    const key = trimmed.toLowerCase();
    const cached = cache.current.get(key);
    if (cached) {
      setResults(cached);
      setResultsFor(trimmed);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data: unknown = res.ok ? await res.json() : [];
        const list = Array.isArray(data) ? (data as SearchSuggestion[]) : [];
        cache.current.set(key, list);
        setResults(list);
        setResultsFor(trimmed);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const visible = trimmed.length >= MIN_CHARS ? results : [];
  const wines = visible.filter((r) => r.entidad === "vino");
  const wineries = visible.filter((r) => r.entidad === "bodega");

  const itemHref = (r: SearchSuggestion) =>
    localePath(lang, `/${r.entidad === "vino" ? "vino" : "bodega"}/${r.slug}`);
  const options: Option[] =
    trimmed.length < MIN_CHARS
      ? []
      : [
          ...[...wines, ...wineries].map((item) => ({
            kind: "item" as const,
            item,
            href: itemHref(item),
          })),
          { kind: "all" as const, href: searchHref(trimmed) },
        ];

  const expanded = open && options.length > 0;

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded]);

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    router.push(href);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (expanded && active >= 0) return go(options[active].href);
    if (!trimmed) return;
    go(searchHref(trimmed));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!expanded) {
          setOpen(true);
          setActive(0);
        } else setActive((i) => (i >= last ? 0 : i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!expanded) {
          setOpen(true);
          setActive(last);
        } else setActive((i) => (i <= 0 ? last : i - 1));
        break;
      case "Home":
        if (expanded && active >= 0) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (expanded && active >= 0) {
          event.preventDefault();
          setActive(last);
        }
        break;
      case "Escape":
        if (expanded) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (query) {
          event.preventDefault();
          setQuery("");
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const renderName = (text: string) =>
    highlightParts(text, trimmed).map((part, i) =>
      part.match ? (
        <mark key={i} className="bg-transparent font-semibold text-fg">
          {part.text}
        </mark>
      ) : (
        <span key={i}>{part.text}</span>
      ),
    );

  const renderGroup = (title: string, items: SearchSuggestion[], offset: number) =>
    items.length > 0 && (
      <li role="presentation">
        <div
          id={`${id}-group-${offset}`}
          className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {title}
        </div>
        <ul role="group" aria-labelledby={`${id}-group-${offset}`}>
          {items.map((item, i) => {
            const index = offset + i;
            return (
              <li
                key={item.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // mousedown en vez de click: no quita el foco del input antes de navegar.
                onMouseDown={(event) => {
                  event.preventDefault();
                  go(options[index].href);
                }}
                onMouseMove={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer flex-col px-4 py-2",
                  index === active && "bg-surface-2",
                )}
              >
                <span className="text-fg">{renderName(item.nombre)}</span>
                <span className="text-sm text-muted">
                  {[item.tipo_vino ? labels.wineTypes[item.tipo_vino] : null, item.subtitulo]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      </li>
    );

  const allIndex = options.length - 1;
  const count = wines.length + wineries.length;
  const settled = !loading && resultsFor === trimmed;

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <form role="search" action={localePath(lang, "/buscar")} method="get" onSubmit={onSubmit}>
        <label htmlFor={inputId} className="sr-only">
          {labels.label}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input
              id={inputId}
              name="q"
              type="search"
              role="combobox"
              aria-expanded={expanded}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              autoFocus={autoFocus}
              maxLength={100}
              placeholder={labels.placeholder}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
                setActive(-1);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              // text-base (16px) evita el zoom automático de iOS al enfocar.
              className={cn(
                "w-full rounded-control border border-border-strong bg-surface pl-10 pr-3 text-base text-fg placeholder:text-muted",
                "[&::-webkit-search-cancel-button]:cursor-pointer",
                size === "lg" ? "h-12" : "h-11",
              )}
            />
          </div>
          <button
            type="submit"
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-control bg-primary px-4 font-medium text-primary-fg hover:bg-primary-hover",
              size === "lg" ? "h-12 px-5 text-lg" : "h-11",
            )}
          >
            {labels.submit}
          </button>
        </div>
      </form>

      <ul
        id={listboxId}
        role="listbox"
        aria-label={labels.suggestionsLabel}
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-40 mt-2 max-h-[70dvh] overflow-y-auto rounded-card border border-border bg-surface pb-2 shadow-card"
      >
        {renderGroup(labels.groupWines, wines, 0)}
        {renderGroup(labels.groupWineries, wineries, wines.length)}
        {settled && count === 0 && (
          <li role="presentation" className="px-4 pt-3 text-sm text-muted">
            {labels.noSuggestions}
          </li>
        )}
        <li
          id={optionId(allIndex)}
          role="option"
          aria-selected={active === allIndex}
          onMouseDown={(event) => {
            event.preventDefault();
            go(searchHref(trimmed));
          }}
          onMouseMove={() => setActive(allIndex)}
          className={cn(
            "mt-2 cursor-pointer border-t border-border px-4 pt-3 pb-1 font-medium text-primary",
            active === allIndex && "bg-surface-2",
          )}
        >
          {labels.seeAll.replace("{q}", trimmed)}
        </li>
      </ul>

      <p aria-live="polite" className="sr-only">
        {trimmed.length >= MIN_CHARS && open
          ? loading
            ? labels.loading
            : settled
              ? labels.counts[Math.min(count, labels.counts.length - 1)]
              : ""
          : ""}
      </p>
    </div>
  );
}
