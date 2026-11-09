import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { CRIANZAS, TIPOS_VINO, type SearchFilters } from "@/lib/catalog/filters";
import type { FilterOption } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";

type Props = {
  filters: SearchFilters;
  options: FilterOption[];
  dict: Dictionary;
};

const selectClass =
  "h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base text-fg";

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Check({
  name,
  value,
  label,
  checked,
  count,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  count?: number;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="size-5 shrink-0 accent-primary"
      />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs text-muted">{count}</span>}
    </label>
  );
}

// Lista larga plegable: los primeros `visible` siempre a la vista.
function CheckList({
  name,
  items,
  selected,
  visible = 6,
  more,
}: {
  name: string;
  items: FilterOption[];
  selected: string[];
  visible?: number;
  more: string;
}) {
  const head = items.slice(0, visible);
  const tail = items.slice(visible);
  const render = (o: FilterOption) => (
    <Check
      key={o.valor}
      name={name}
      value={o.valor}
      label={o.etiqueta}
      checked={selected.includes(o.valor)}
      count={o.num}
    />
  );
  return (
    <>
      {head.map(render)}
      {tail.length > 0 && (
        <details open={tail.some((o) => selected.includes(o.valor))}>
          <summary className="cursor-pointer py-1 text-sm font-medium text-primary">
            {more} ({tail.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2">{tail.map(render)}</div>
        </details>
      )}
    </>
  );
}

// Controles de filtro de vinos. Van dentro de un <FilterForm>: los nombres de
// los campos son los parámetros de la URL (ver PARAM en filters.ts).
export function VinoFilters({ filters, options, dict }: Props) {
  const { search, catalog } = dict;
  const byGroup = (g: FilterOption["grupo"]) => options.filter((o) => o.grupo === g);
  const denominaciones = byGroup("denominacion");
  const variedades = byGroup("variedad");
  const anios = byGroup("anio");
  const bodegas = byGroup("bodega");
  const anadaValue = filters.anada === null ? "" : String(filters.anada);

  return (
    <div className="flex flex-col gap-6">
      <Group legend={search.filterType}>
        {TIPOS_VINO.map((t) => (
          <Check
            key={t}
            name="tipo"
            value={t}
            label={catalog.wineTypes[t]}
            checked={filters.tipos.includes(t)}
          />
        ))}
      </Group>

      <Group legend={search.filterAging}>
        {CRIANZAS.map((c) => (
          <Check
            key={c}
            name="crianza"
            value={c}
            label={catalog.agings[c]}
            checked={filters.crianzas.includes(c)}
          />
        ))}
      </Group>

      {denominaciones.length > 0 && (
        <Group legend={search.filterAppellation}>
          <CheckList
            name="do"
            items={denominaciones}
            selected={filters.denominaciones}
            more={search.showMore}
          />
        </Group>
      )}

      {variedades.length > 0 && (
        <Group legend={search.filterGrape}>
          <CheckList name="uva" items={variedades} selected={filters.variedades} more={search.showMore} />
        </Group>
      )}

      {anios.length > 0 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="filtro-anada" className="text-sm font-semibold">
            {search.filterVintage}
          </label>
          <select id="filtro-anada" name="anada" defaultValue={anadaValue} className={selectClass}>
            <option value="">{search.anyVintage}</option>
            {anios.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.valor === "sin" ? search.noVintage : o.etiqueta} ({o.num})
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{search.filterPrice}</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{search.priceMin}</span>
            <input
              type="number"
              name="pmin"
              min={0}
              max={10000}
              step={1}
              inputMode="numeric"
              defaultValue={filters.precioMin ?? ""}
              className={selectClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{search.priceMax}</span>
            <input
              type="number"
              name="pmax"
              min={0}
              max={10000}
              step={1}
              inputMode="numeric"
              defaultValue={filters.precioMax ?? ""}
              className={selectClass}
            />
          </label>
        </div>
      </fieldset>

      {bodegas.length > 0 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="filtro-bodega" className="text-sm font-semibold">
            {search.filterWinery}
          </label>
          <select
            id="filtro-bodega"
            name="bodega"
            defaultValue={filters.bodega ?? ""}
            className={cn(selectClass, "truncate")}
          >
            <option value="">{search.anyWinery}</option>
            {bodegas.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta} ({o.num})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
