import NextLink from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { cn } from "@/lib/cn";

type Props = {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  labels: Dictionary["search"];
};

// Páginas a mostrar: primera, última y vecinas de la actual, con huecos ("…").
export function pageWindow(page: number, total: number): Array<number | "gap"> {
  const pages = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const item =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-control px-3 text-sm font-medium";

export function Pagination({ page, totalPages, hrefFor, labels }: Props) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label={labels.pagination} className="flex flex-col items-center gap-2">
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          {page > 1 ? (
            <NextLink href={hrefFor(page - 1)} rel="prev" className={cn(item, "hover:bg-surface-2")}>
              {labels.previous}
            </NextLink>
          ) : (
            <span aria-disabled className={cn(item, "text-muted opacity-60")}>
              {labels.previous}
            </span>
          )}
        </li>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <NextLink
                href={hrefFor(p)}
                aria-label={labels.page(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  item,
                  p === page ? "bg-primary text-primary-fg" : "hover:bg-surface-2",
                )}
              >
                {p}
              </NextLink>
            </li>
          ),
        )}
        <li>
          {page < totalPages ? (
            <NextLink href={hrefFor(page + 1)} rel="next" className={cn(item, "hover:bg-surface-2")}>
              {labels.next}
            </NextLink>
          ) : (
            <span aria-disabled className={cn(item, "text-muted opacity-60")}>
              {labels.next}
            </span>
          )}
        </li>
      </ul>
      <p className="text-sm text-muted">{labels.pageOf(page, totalPages)}</p>
    </nav>
  );
}
