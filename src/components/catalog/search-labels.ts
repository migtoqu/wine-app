import type { Dictionary } from "@/i18n/dictionaries/es";
import type { SearchComboboxLabels } from "./search-combobox";

// Textos del combobox ya resueltos: un Client Component no puede recibir las
// funciones del diccionario, solo cadenas.
export function searchComboboxLabels(dict: Dictionary): SearchComboboxLabels {
  const { search, catalog } = dict;
  return {
    label: search.label,
    placeholder: search.placeholder,
    submit: search.submit,
    clear: search.clear,
    suggestionsLabel: search.suggestionsLabel,
    groupWines: search.groupWines,
    groupWineries: search.groupWineries,
    seeAll: search.seeAll("{q}"),
    loading: search.loading,
    noSuggestions: search.noSuggestions,
    counts: Array.from({ length: 11 }, (_, n) => search.suggestionsCount(n)),
    wineTypes: catalog.wineTypes,
  };
}
