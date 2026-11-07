import NextLink from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { clearFilters, countActiveFilters, type SearchFilters } from "@/lib/catalog/filters";
import type { FilterOption } from "@/lib/catalog/types";
import { CloseIcon } from "./icons";

type Props = {
  filters: SearchFilters;
  options: FilterOption[];
  dict: Dictionary;
  hrefWith: (overrides: Partial<SearchFilters>) => string;
};

// Chips de los filtros activos; cada uno es un enlace que quita ese filtro.
export function ActiveFilters({ filters, options, dict, hrefWith }: Props) {
  if (countActiveFilters(filters) === 0) return null;
  const { search, catalog } = dict;
  const label = (grupo: FilterOption["grupo"], valor: string) =>
    options.find((o) => o.grupo === grupo && o.valor === valor)?.etiqueta ?? valor;

  const chips = [
    ...filters.tipos.map((t) => ({
      key: `tipo-${t}`,
      text: catalog.wineTypes[t],
      href: hrefWith({ tipos: filters.tipos.filter((x) => x !== t) }),
    })),
    ...filters.crianzas.map((c) => ({
      key: `crianza-${c}`,
      text: catalog.agings[c],
      href: hrefWith({ crianzas: filters.crianzas.filter((x) => x !== c) }),
    })),
    ...filters.denominaciones.map((d) => ({
      key: `do-${d}`,
      text: label("denominacion", d),
      href: hrefWith({ denominaciones: filters.denominaciones.filter((x) => x !== d) }),
    })),
    ...filters.variedades.map((u) => ({
      key: `uva-${u}`,
      text: label("variedad", u),
      href: hrefWith({ variedades: filters.variedades.filter((x) => x !== u) }),
    })),
    ...(filters.anada !== null
      ? [
          {
            key: "anada",
            text:
              filters.anada === "sin"
                ? search.noVintage
                : `${search.filterVintage} ${filters.anada}`,
            href: hrefWith({ anada: null }),
          },
        ]
      : []),
    ...(filters.bodega
      ? [{ key: "bodega", text: label("bodega", filters.bodega), href: hrefWith({ bodega: null }) }]
      : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="sr-only">{search.activeFilters}</h3>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip.key}>
            <NextLink
              href={chip.href}
              scroll={false}
              aria-label={search.removeFilter(chip.text)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-soft pl-3 pr-2 text-sm font-medium text-primary-soft-fg hover:opacity-85"
            >
              {chip.text}
              <CloseIcon className="size-4" />
            </NextLink>
          </li>
        ))}
      </ul>
      <NextLink
        href={hrefWith(clearFilters(filters))}
        scroll={false}
        className="text-sm font-medium text-primary underline underline-offset-4"
      >
        {search.clearFilters}
      </NextLink>
    </div>
  );
}
