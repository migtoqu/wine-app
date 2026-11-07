import NextLink from "next/link";
import { localePath, type Locale } from "@/i18n/config";
import type { BodegaListItem } from "@/lib/catalog/types";
import { CatalogImage } from "./catalog-image";

type Props = {
  lang: Locale;
  winery: BodegaListItem;
  labels: { placeholderAlt: string; wines: (n: number) => string };
};

export function WineryCard({ lang, winery, labels }: Props) {
  const place = [winery.municipio, winery.provincia !== winery.municipio ? winery.provincia : null]
    .filter(Boolean)
    .join(", ");
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card transition-colors hover:border-border-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      <CatalogImage
        src={winery.imagen_url}
        alt={winery.imagen_alt ?? ""}
        kind="bodega"
        placeholderLabel={labels.placeholderAlt}
        aspect="landscape"
        fit="cover"
        className="rounded-none"
      />
      <div className="flex flex-col gap-1 p-4">
        <h3 className="text-lg font-semibold leading-snug">
          <NextLink
            href={localePath(lang, `/bodega/${winery.slug}`)}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
          >
            {winery.nombre}
          </NextLink>
        </h3>
        {place && <p className="text-sm text-muted">{place}</p>}
        <p className="text-sm text-muted">
          {[winery.denominacion_nombre, winery.num_vinos > 0 ? labels.wines(winery.num_vinos) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </article>
  );
}
