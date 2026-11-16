import type { Metadata } from "next";
import NextLink from "next/link";
import { Suspense } from "react";
import { ActiveFilters } from "@/components/catalog/active-filters";
import { FilterForm } from "@/components/catalog/filter-form";
import { FiltersDisclosure } from "@/components/catalog/filters-disclosure";
import { Pagination } from "@/components/catalog/pagination";
import { MapIcon } from "@/components/catalog/icons";
import { SearchCombobox } from "@/components/catalog/search-combobox";
import { searchComboboxLabels } from "@/components/catalog/search-labels";
import { VinoFilters } from "@/components/catalog/vino-filters";
import { WineCard, wineCardLabels } from "@/components/catalog/wine-card";
import { WineryCard } from "@/components/catalog/winery-card";
import { Container } from "@/components/layout/container";
import { buttonStyles, EmptyState, Skeleton } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import {
  clearFilters,
  countActiveFilters,
  parseSearchFilters,
  serializeSearchFilters,
  TIPOS_VINO,
  totalPages,
  type SearchFilters,
} from "@/lib/catalog/filters";
import {
  catalogoVacio,
  contarResultados,
  getOpcionesFiltro,
  listarBodegas,
  listarVinos,
  type Paged,
} from "@/lib/catalog/queries";
import type { BodegaListItem, FilterOption, VinoListItem } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";

// Buscador global y listado de vinos con filtros (§5.3). Todo el estado va en
// la URL (?q=&ver=&tipo=…&pagina=), así que los resultados se pueden compartir.
// La cabecera es estática; lo que depende de searchParams va en <Suspense> y
// llama a lecturas cacheadas con los filtros ya normalizados.

export async function generateMetadata({
  searchParams,
}: PageProps<"/[lang]/buscar">): Promise<Metadata> {
  const { search } = await getDictionary();
  const { q } = parseSearchFilters(await searchParams);
  return { title: q ? search.resultsFor(q) : search.metaTitle };
}

export default async function SearchPage({ searchParams }: PageProps<"/[lang]/buscar">) {
  const lang = await getLocale();
  const dict = await getDictionary();

  return (
    <Container className="flex flex-col gap-6 py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">{dict.search.title}</h1>
        <NextLink href={localePath(lang, "/mapa")} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <MapIcon className="size-4" />
          {dict.map.seeMap}
        </NextLink>
      </div>
      <Suspense fallback={<ResultsSkeleton />}>
        <SearchResults lang={lang} dict={dict} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    </div>
  );
}

async function SearchResults({
  lang,
  dict,
  searchParams,
}: {
  lang: Locale;
  dict: Dictionary;
  searchParams: PageProps<"/[lang]/buscar">["searchParams"];
}) {
  const filters = parseSearchFilters(await searchParams);
  const base = localePath(lang, "/buscar");
  const hrefWith = (overrides: Partial<SearchFilters>) =>
    base + serializeSearchFilters(filters, overrides);

  const combobox = (
    <SearchCombobox
      // Se reinicia al cambiar la búsqueda desde la URL.
      key={filters.q}
      lang={lang}
      labels={searchComboboxLabels(dict)}
      defaultValue={filters.q}
      size="lg"
    />
  );

  // Recuentos, resultados y opciones de filtro a la vez (antes iban en serie).
  const [counts, results, options] = await Promise.all([
    contarResultados(filters),
    filters.ver === "bodegas" ? listarBodegas(filters) : listarVinos(filters),
    filters.ver === "bodegas" ? null : getOpcionesFiltro(),
  ]);

  // Solo sin resultados en ninguna pestaña hace falta distinguir "catálogo vacío".
  if (counts.vinos + counts.bodegas === 0 && (await catalogoVacio())) {
    return (
      <>
        {combobox}
        <EmptyState
          title={dict.search.emptyCatalogTitle}
          description={dict.search.emptyCatalogText}
        />
      </>
    );
  }

  const tabs = [
    { ver: "vinos" as const, label: dict.search.tabWines, count: counts.vinos },
    { ver: "bodegas" as const, label: dict.search.tabWineries, count: counts.bodegas },
  ];

  return (
    <>
      {combobox}
      <nav aria-label={dict.search.tabsLabel}>
        <ul className="flex gap-1 border-b border-border">
          {tabs.map((tab) => {
            const current = tab.ver === filters.ver;
            return (
              <li key={tab.ver}>
                <NextLink
                  href={hrefWith({ ver: tab.ver })}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-4 font-medium",
                    current
                      ? "border-primary text-fg"
                      : "border-transparent text-muted hover:text-fg",
                  )}
                >
                  {tab.label}
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    {formatNumber(lang, tab.count)}
                  </span>
                </NextLink>
              </li>
            );
          })}
        </ul>
      </nav>
      {filters.ver === "bodegas" ? (
        <WineryResults
          lang={lang}
          dict={dict}
          filters={filters}
          hrefWith={hrefWith}
          results={results as Paged<BodegaListItem>}
        />
      ) : (
        <WineResults
          lang={lang}
          dict={dict}
          filters={filters}
          hrefWith={hrefWith}
          base={base}
          results={results as Paged<VinoListItem>}
          options={options!}
        />
      )}
    </>
  );
}

type ResultsProps = {
  lang: Locale;
  dict: Dictionary;
  filters: SearchFilters;
  hrefWith: (overrides: Partial<SearchFilters>) => string;
};

function WineResults({
  lang,
  dict,
  filters,
  hrefWith,
  base,
  results: { items, total },
  options,
}: ResultsProps & { base: string; results: Paged<VinoListItem>; options: FilterOption[] }) {
  const { search } = dict;
  const active = countActiveFilters(filters);
  const pages = totalPages(total);
  const labels = wineCardLabels(dict);

  return (
    // Se vuelve a montar al cambiar la URL para que los controles reflejen los filtros.
    <FilterForm
      key={serializeSearchFilters(filters)}
      action={base}
      className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-10"
    >
      {filters.q && <input type="hidden" name="q" value={filters.q} />}

      <FiltersDisclosure label={search.filtersCount(active)}>
        <h2 className="sr-only">{search.filters}</h2>
        <VinoFilters filters={filters} options={options} dict={dict} />
        {/* Sin JS, los cambios se aplican con este botón. */}
        <noscript>
          <button type="submit" className={buttonStyles({ className: "mt-6 w-full" })}>
            {search.apply}
          </button>
        </noscript>
      </FiltersDisclosure>

      <section aria-labelledby="results-heading" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-heading" className="font-sans text-base font-medium text-muted">
            {search.resultsCount(formatNumber(lang, total), total)}
          </h2>
          <div className="flex items-center gap-2">
            <label htmlFor="orden" className="text-sm text-muted">
              {search.sort}
            </label>
            <select
              id="orden"
              name="orden"
              defaultValue={filters.orden}
              className="h-10 rounded-control border border-border-strong bg-surface px-3 text-sm text-fg"
            >
              {filters.q && <option value="relevancia">{search.sortRelevance}</option>}
              <option value="nombre">{search.sortName}</option>
              <option value="novedad">{search.sortNewest}</option>
              <option value="precio">{search.sortPrice}</option>
            </select>
          </div>
        </div>

        <ActiveFilters filters={filters} options={options} dict={dict} hrefWith={hrefWith} />

        {!filters.q && active === 0 && filters.pagina === 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{search.browseTitle}</p>
            <ul className="flex flex-wrap gap-2">
              {TIPOS_VINO.map((t) => (
                <li key={t}>
                  <NextLink
                    href={hrefWith({ tipos: [t] })}
                    className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-3 text-sm hover:bg-surface-2"
                  >
                    {dict.catalog.wineTypes[t]}
                  </NextLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {items.length > 0 ? (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((wine) => (
                <li key={wine.id} className="flex">
                  <WineCard lang={lang} wine={wine} labels={labels} className="w-full" />
                </li>
              ))}
            </ul>
            <Pagination
              page={filters.pagina}
              totalPages={pages}
              hrefFor={(p) => hrefWith({ pagina: p })}
              labels={search}
            />
          </>
        ) : (
          <NoResults filters={filters} dict={dict} hrefWith={hrefWith} />
        )}
      </section>
    </FilterForm>
  );
}

function WineryResults({
  lang,
  dict,
  filters,
  hrefWith,
  results: { items, total },
}: ResultsProps & { results: Paged<BodegaListItem> }) {
  const { search, catalog } = dict;
  const pages = totalPages(total);

  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-4">
      <h2 id="results-heading" className="font-sans text-base font-medium text-muted">
        {search.resultsCount(formatNumber(lang, total), total)}
      </h2>
      {items.length > 0 ? (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((winery) => (
              <li key={winery.id} className="flex [&>article]:w-full">
                <WineryCard
                  lang={lang}
                  winery={winery}
                  labels={{
                    placeholderAlt: catalog.winery.placeholderAlt,
                    wines: search.winesShort,
                  }}
                />
              </li>
            ))}
          </ul>
          <Pagination
            page={filters.pagina}
            totalPages={pages}
            hrefFor={(p) => hrefWith({ pagina: p })}
            labels={search}
          />
        </>
      ) : (
        <NoResults filters={filters} dict={dict} hrefWith={hrefWith} />
      )}
    </section>
  );
}

function NoResults({
  filters,
  dict,
  hrefWith,
}: Pick<ResultsProps, "filters" | "dict" | "hrefWith">) {
  const { search } = dict;
  // Página fuera de rango (p. ej. un enlace antiguo): ofrecer volver a la primera.
  if (filters.pagina > 1) {
    return (
      <EmptyState
        title={search.pageOutOfRange}
        action={
          <NextLink href={hrefWith({ pagina: 1 })} className={buttonStyles({ variant: "secondary" })}>
            {search.firstPage}
          </NextLink>
        }
      />
    );
  }
  const canClear = filters.ver === "vinos" && countActiveFilters(filters) > 0;
  return (
    <EmptyState
      title={search.noResultsTitle}
      description={search.noResultsText}
      action={
        canClear && (
          <NextLink href={hrefWith(clearFilters(filters))} className={buttonStyles({ variant: "secondary" })}>
            {search.clearFilters}
          </NextLink>
        )
      }
    />
  );
}
