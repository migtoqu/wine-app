import NextLink from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { Locale } from "@/i18n/config";
import { formatDate, formatPrice } from "@/i18n/format";
import {
  formatosDisponibles,
  ofertasDelFormato,
  resumenPrecios,
  serieMinimo,
  urlOferta,
} from "@/lib/catalog/prices";
import type { Oferta } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { Badge, buttonStyles } from "@/components/ui";
import { PriceChart } from "./price-chart";

// Bloque «Dónde comprar» de la ficha de vino (comparador de precios). Sin JS: el formato se
// elige con enlaces ?formato= (como el selector de añada).

type Props = {
  lang: Locale;
  dict: Dictionary;
  ofertas: Oferta[];
  formato: number | null;
  /** href de la ficha con ?formato=<ml> (y lo demás de la URL que haya que conservar). */
  hrefFormato: (ml: number) => string;
};

export function WhereToBuy({ lang, dict, ofertas, formato, hrefFormato }: Props) {
  const labels = dict.catalog.prices;
  const formatos = formatosDisponibles(ofertas);
  const lista = ofertasDelFormato(ofertas, formato);
  const { minimoActual, minimoHistorico } = resumenPrecios(lista);
  // Fin de la gráfica: la última vez que se vio alguna oferta (sin leer la hora actual, que
  // rompería el prerender cacheado).
  const hasta = lista.reduce((m, o) => (o.visto_por_ultima_vez > m ? o.visto_por_ultima_vez : m), "");
  const serie = serieMinimo(lista, hasta ? new Date(hasta) : undefined);
  const fecha = (f: string) => formatDate(lang, f, { dateStyle: "medium" });

  return (
    <section aria-labelledby="buy-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="buy-heading" className="text-2xl font-semibold">
          {labels.heading}
        </h2>
        {ofertas.length > 0 && <p className="max-w-prose text-sm text-muted">{labels.intro}</p>}
      </div>

      {ofertas.length === 0 ? (
        <p className="text-muted">{labels.empty}</p>
      ) : (
        <div className="flex flex-col gap-6 rounded-card border border-border bg-surface p-5 sm:p-6">
          {formatos.length > 1 && (
            <nav aria-label={labels.format}>
              <ul className="flex flex-wrap gap-2">
                {formatos.map((ml) => {
                  const current = ml === formato;
                  return (
                    <li key={ml}>
                      <NextLink
                        href={hrefFormato(ml)}
                        replace
                        scroll={false}
                        aria-current={current ? "true" : undefined}
                        className={cn(
                          "inline-flex h-11 min-w-16 items-center justify-center rounded-full border px-4 text-sm font-medium",
                          current
                            ? "border-primary bg-primary text-primary-fg"
                            : "border-border-strong bg-surface hover:bg-surface-2",
                        )}
                      >
                        {labels.formatLabel(ml)}
                      </NextLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted">{labels.bestNow}</dt>
              {minimoActual ? (
                <dd className="flex flex-col">
                  <span className="text-2xl font-semibold tabular-nums">{formatPrice(lang, minimoActual.precio)}</span>
                  <span className="text-sm text-muted">{labels.atShop(minimoActual.tienda.nombre)}</span>
                </dd>
              ) : (
                <dd className="font-semibold">{labels.bestNowNone}</dd>
              )}
            </div>
            {minimoHistorico && (
              <div className="flex flex-col gap-1">
                <dt className="text-sm text-muted">{labels.historicLow}</dt>
                <dd className="flex flex-col">
                  <span className="text-2xl font-semibold tabular-nums">{formatPrice(lang, minimoHistorico.precio)}</span>
                  <span className="text-sm text-muted">{labels.historicLowSince(fecha(minimoHistorico.desde))}</span>
                </dd>
              </div>
            )}
          </dl>

          <div className="flex flex-col gap-2">
            <h3 className="sr-only">
              {labels.offersCount(lista.length)}
              {formato !== null && ` · ${labels.formatLabel(formato)}`}
            </h3>
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {lista.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-semibold">{o.tienda.nombre}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                      <span>
                        {labels.vintage}:{" "}
                        {o.con_anada ? (o.anio ?? dict.catalog.wine.noVintage) : labels.vintageUnknown}
                      </span>
                      <Badge tone={o.disponible ? "success" : "neutral"}>
                        {o.disponible ? labels.inStock : labels.outOfStock}
                      </Badge>
                    </span>
                    <span className="text-xs text-muted">{labels.lastSeen(fecha(o.visto_por_ultima_vez))}</span>
                    {o.tienda.info_envio && <span className="text-xs text-muted">{o.tienda.info_envio}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn("text-xl font-semibold tabular-nums", !o.disponible && "text-muted")}
                    >
                      {formatPrice(lang, o.precio)}
                    </span>
                    <a
                      href={urlOferta(o)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={labels.goToShopLabel(o.tienda.nombre)}
                      className={buttonStyles({ variant: o.disponible ? "primary" : "secondary", size: "md" })}
                    >
                      {labels.goToShop}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {serie.length > 1 && (
            <PriceChart lang={lang} labels={labels} serie={serie} hasta={(hasta || serie.at(-1)!.fecha).slice(0, 10)} />
          )}
        </div>
      )}
    </section>
  );
}
