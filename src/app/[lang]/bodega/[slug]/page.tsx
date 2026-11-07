import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Attribution } from "@/components/catalog/attribution";
import { BodegaWines } from "@/components/catalog/bodega-wines";
import { CatalogImage } from "@/components/catalog/catalog-image";
import { ExternalIcon } from "@/components/catalog/icons";
import { UserActions } from "@/components/catalog/user-actions";
import { wineCardLabels } from "@/components/catalog/wine-card";
import { Container } from "@/components/layout/container";
import { Badge, EmptyState } from "@/components/ui";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { displayHost, formatAddress, socialLinks, truncate } from "@/lib/catalog/format";
import { getBodega } from "@/lib/catalog/queries";

// Ficha de bodega (§5.5). Igual que la de vino: lectura cacheada, ISR por
// slug y `params` fuera de <Suspense> para que un slug inexistente dé 404.
// No lee searchParams: el filtro de sus vinos se aplica en el navegador.

// Ver vino/[slug]/page.tsx: placeholder porque el catálogo no está en build.
export function generateStaticParams() {
  return [{ slug: "__placeholder__" }];
}

// La primera visita a cada slug espera a la lectura (para poder responder 404);
// las siguientes salen de caché. No se valida como navegación instantánea.
export const instant = false;

type Props = PageProps<"/[lang]/bodega/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [bodega, dict] = await Promise.all([getBodega(slug), getDictionary()]);
  if (!bodega) return { title: dict.catalog.notFoundWinery.title };
  const place = [bodega.municipio, bodega.provincia].filter(Boolean).join(", ");
  return {
    title: place ? `${bodega.nombre} · ${place}` : bodega.nombre,
    description: bodega.descripcion ? truncate(bodega.descripcion) : undefined,
  };
}

export default async function WineryPage({ params }: Props) {
  const { slug } = await params;
  const bodega = await getBodega(slug);
  if (!bodega) notFound();

  const lang = await getLocale();
  const dict = await getDictionary();
  const { catalog } = dict;
  const { winery } = catalog;

  const address = formatAddress(bodega);
  const region = bodega.comunidad && bodega.comunidad !== bodega.provincia ? bodega.comunidad : null;
  const social = socialLinks(bodega.redes);
  const [cover, ...gallery] = bodega.imagenes;
  const facts = [
    bodega.anio_fundacion !== null && {
      label: winery.founded,
      value: String(bodega.anio_fundacion),
    },
    bodega.hectareas !== null && {
      label: winery.vineyard,
      value: winery.hectares(formatNumber(lang, bodega.hectareas, { maximumFractionDigits: 1 })),
    },
  ].filter((f): f is { label: string; value: string } => Boolean(f));
  const hasContact = bodega.web || bodega.telefono || bodega.email || social.length > 0;
  const externalLink = "inline-flex items-center gap-1 font-medium text-primary underline decoration-1 underline-offset-4 hover:decoration-2";

  return (
    <Container className="flex flex-col gap-12 py-8 sm:py-12">
      <article className="flex flex-col gap-10">
        <header className="flex flex-col gap-6">
          <CatalogImage
            key={cover?.url ?? "none"}
            src={cover?.url}
            alt={cover?.alt ?? winery.imageAlt(bodega.nombre)}
            kind="bodega"
            placeholderLabel={winery.placeholderAlt}
            aspect="landscape"
            fit="cover"
            priority
            className="max-h-[22rem] w-full sm:aspect-[21/9]"
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3">
              <h1 className="text-display font-semibold">{bodega.nombre}</h1>
              {(bodega.municipio || bodega.provincia) && (
                <p className="text-lg text-muted">
                  {[bodega.municipio, bodega.provincia !== bodega.municipio ? bodega.provincia : null, region]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {bodega.denominaciones.map((d) => (
                  <Badge key={d.slug} tone="primary">
                    {catalog.appellationTypes[d.tipo]} {d.nombre}
                  </Badge>
                ))}
                {bodega.estado === "cerrada" && <Badge tone="warning">{winery.closed}</Badge>}
              </div>
            </div>
            <UserActions entityType="bodega" entityId={bodega.id} labels={catalog.userActions} />
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-12">
          <div className="flex flex-col gap-8">
            {bodega.descripcion && (
              <section aria-labelledby="about-heading" className="flex flex-col gap-3">
                <h2 id="about-heading" className="text-2xl font-semibold">
                  {winery.about}
                </h2>
                <p className="max-w-prose whitespace-pre-line text-lg text-muted">
                  {bodega.descripcion}
                </p>
              </section>
            )}

            {gallery.length > 0 && (
              <section aria-labelledby="gallery-heading" className="flex flex-col gap-3">
                <h2 id="gallery-heading" className="text-2xl font-semibold">
                  {winery.gallery}
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((img) => (
                    <li key={img.url}>
                      <CatalogImage
                        src={img.url}
                        alt={img.alt ?? winery.imageAlt(bodega.nombre)}
                        kind="bodega"
                        placeholderLabel={winery.placeholderAlt}
                        aspect="landscape"
                        fit="cover"
                      />
                      {img.atribucion && (
                        <p className="mt-1 text-xs text-muted">{img.atribucion}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-6 self-start rounded-card border border-border bg-surface p-5">
            {facts.length > 0 && (
              <dl className="grid grid-cols-2 gap-4">
                {facts.map((f) => (
                  <div key={f.label} className="flex flex-col gap-1">
                    <dt className="text-sm text-muted">{f.label}</dt>
                    <dd className="font-semibold">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {address && (
              <div className="flex flex-col gap-1">
                <h2 className="font-sans text-sm font-semibold">{winery.address}</h2>
                <address className="not-italic">{address}</address>
              </div>
            )}

            {hasContact && (
              <div className="flex flex-col gap-2">
                <h2 className="font-sans text-sm font-semibold">{winery.contact}</h2>
                <ul className="flex flex-col gap-2">
                  {bodega.web && (
                    <li>
                      <span className="sr-only">{winery.website}: </span>
                      <a href={bodega.web} target="_blank" rel="noopener noreferrer" className={externalLink}>
                        {displayHost(bodega.web)}
                        <ExternalIcon className="size-4" />
                      </a>
                    </li>
                  )}
                  {bodega.telefono && (
                    <li>
                      <span className="sr-only">{winery.phone}: </span>
                      <a href={`tel:${bodega.telefono.replace(/[^\d+]/g, "")}`} className={externalLink}>
                        {bodega.telefono}
                      </a>
                    </li>
                  )}
                  {bodega.email && (
                    <li>
                      <span className="sr-only">{winery.email}: </span>
                      <a href={`mailto:${bodega.email}`} className={`${externalLink} break-all`}>
                        {bodega.email}
                      </a>
                    </li>
                  )}
                </ul>
                {social.length > 0 && (
                  <ul aria-label={winery.social} className="flex flex-wrap gap-x-4 gap-y-2">
                    {social.map((s) => (
                      <li key={s.network}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className={externalLink}>
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>

        <section aria-labelledby="wines-heading" className="flex flex-col gap-4">
          <h2 id="wines-heading" className="text-2xl font-semibold">
            {winery.wines}
          </h2>
          {bodega.vinos.length > 0 ? (
            <BodegaWines
              lang={lang}
              wines={bodega.vinos}
              labels={{
                ...wineCardLabels(dict),
                filterType: winery.filterType,
                filterAging: winery.filterAging,
                all: winery.allWines,
                noMatch: winery.noWinesMatch,
                clear: winery.clearFilters,
                counts: Array.from({ length: bodega.vinos.length + 1 }, (_, n) =>
                  winery.winesCount(n),
                ),
              }}
            />
          ) : (
            <EmptyState as="h3" title={winery.noWines} />
          )}
        </section>

        <Attribution
          lang={lang}
          labels={catalog.attribution}
          fuente={bodega.fuente}
          updatedAt={bodega.updated_at}
        />
      </article>
    </Container>
  );
}
