"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { highlightParts } from "@/lib/catalog/highlight";
import type { SearchSuggestion } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";

export type CatalogPickerLabels = {
  suggestions: string;
  loading: string;
  none: string;
  linked: string;
  // Con "{q}" donde va el texto escrito.
  keepText: string;
};

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const fieldClass =
  "h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-muted aria-invalid:border-danger";

// Campo de texto con sugerencias del catálogo (combobox + listbox de ARIA 1.2)
// para Mi cava. Al elegir una sugerencia se llama a onPick; si el usuario
// escribe algo que no está, el texto se envía tal cual en el campo `name`.
// Teclado: ↑/↓ recorren las sugerencias, Intro elige, Escape cierra.
export function CatalogPicker({
  entidad,
  name,
  label,
  placeholder,
  hint,
  error,
  required,
  defaultValue = "",
  linked = false,
  labels,
  onPick,
  onType,
}: {
  entidad: SearchSuggestion["entidad"];
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  defaultValue?: string;
  linked?: boolean;
  labels: CatalogPickerLabels;
  onPick: (item: SearchSuggestion) => void;
  onType?: (text: string) => void;
}) {
  const id = useId();
  const inputId = `${id}-input`;
  const listboxId = `${id}-listbox`;
  const hintId = `${id}-hint`;
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

  useEffect(() => {
    if (!open || trimmed.length < MIN_CHARS) return;
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
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const data: unknown = res.ok ? await res.json() : [];
        const list = Array.isArray(data) ? (data as SearchSuggestion[]) : [];
        cache.current.set(key, list);
        setResults(list);
        setResultsFor(trimmed);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, open]);

  const items = trimmed.length >= MIN_CHARS ? results.filter((r) => r.entidad === entidad) : [];
  const settled = !loading && resultsFor === trimmed;
  // La última opción es «usar el texto sin enlazar».
  const optionCount = trimmed.length >= MIN_CHARS ? items.length + 1 : 0;
  const expanded = open && !linked && optionCount > 0;

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded]);

  const choose = (index: number) => {
    setOpen(false);
    setActive(-1);
    const item = items[index];
    if (!item) return;
    setQuery(item.nombre);
    onPick(item);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = optionCount - 1;
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
      case "Enter":
        // Dentro del formulario, Intro elige en vez de enviar.
        if (expanded && active >= 0) {
          event.preventDefault();
          choose(active);
        }
        break;
      case "Escape":
        if (expanded) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const describedBy = [hint || linked ? hintId : null, error ? `${id}-error` : null].filter(Boolean).join(" ");

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          maxLength={200}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
            onType?.(event.target.value);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={fieldClass}
        />
        <ul
          id={listboxId}
          role="listbox"
          aria-label={labels.suggestions}
          hidden={!expanded}
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-[50dvh] overflow-y-auto rounded-card border border-border bg-surface py-2 shadow-card"
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // mousedown: no quita el foco del input antes de elegir.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              onMouseMove={() => setActive(index)}
              className={cn("flex cursor-pointer flex-col px-4 py-2", index === active && "bg-surface-2")}
            >
              <span className="text-fg">
                {highlightParts(item.nombre, trimmed).map((part, i) =>
                  part.match ? (
                    <mark key={i} className="bg-transparent font-semibold text-fg">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </span>
              {item.subtitulo && <span className="text-sm text-muted">{item.subtitulo}</span>}
            </li>
          ))}
          {settled && items.length === 0 && (
            <li role="presentation" className="px-4 py-2 text-sm text-muted">
              {labels.none}
            </li>
          )}
          {!settled && items.length === 0 && (
            <li role="presentation" className="px-4 py-2 text-sm text-muted">
              {labels.loading}
            </li>
          )}
          <li
            id={optionId(items.length)}
            role="option"
            aria-selected={active === items.length}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(items.length);
            }}
            onMouseMove={() => setActive(items.length)}
            className={cn(
              "mt-1 cursor-pointer border-t border-border px-4 pt-2 pb-1 text-sm font-medium text-primary",
              active === items.length && "bg-surface-2",
            )}
          >
            {labels.keepText.replace("{q}", trimmed)}
          </li>
        </ul>
      </div>
      {(linked || hint) && (
        <p id={hintId} className={cn("text-sm", linked ? "text-success-soft-fg" : "text-muted")}>
          {linked ? `✓ ${labels.linked}` : hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

    </div>
  );
}
