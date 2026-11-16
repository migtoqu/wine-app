import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Attribution } from "@/components/catalog/attribution";
import { BodegaWines } from "@/components/catalog/bodega-wines";
import { CatalogImage } from "@/components/catalog/catalog-image";
import { FieldSources, SummarySources } from "@/components/catalog/field-sources";
import { ImageCredit } from "@/components/catalog/image-credit";
import { ExternalIcon } from "@/components/catalog/icons";
import { BodegaActions } from "@/components/catalog/personal-actions";
import { wineCardLabels } from "@/components/catalog/wine-card";
import { Container } from "@/components/layout/container";
import { Badge, EmptyState } from "@/components/ui";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import {
  displayHost,
  formatAddress,
  formatDuration,
  formatLanguages,
  socialLinks,
  truncate,
} from "@/lib/catalog/format";
import { pickResumen } from "@/lib/catalog/provenance";
import { getBodega } from "@/lib/catalog/queries";
import { cn } from "@/lib/cn";

// Ficha de bodega (§5.5). Igual que la de vino: lectura cacheada, ISR por
// slug y esqueleto inmediato en loading.tsx (ver vino/[slug]/page.tsx).
// No lee searchParams: el filtro de sus vinos se aplica en el navegador.

// Ver vino/[slug]/page.tsx: placeholder porque el catálogo no está en build.
export function generateStaticParams() {
  return [{ slug: "__placeholder__" }];
}

// La primera visita a cada slug espera a la lectura (con el esqueleto de
// loading.tsx); las siguientes salen de caché. No se valida como navegación instantánea.
export const instant = false;

type Props = PageProps<"/[lang]/bodega/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [bodega, dict] = await Promise.all([getBodega(slug), getDictionary()]);
  if (!bodega) return { title: dict.catalog.notFoundWinery.title };
  const place = [bodega.municipio, bodega.provincia].filter(Boolean).join(", ");
  return {
    title: place ? `${bodega.nombre} · ${place}` : bodega.nombre,
    description: (bodega.historia ?? bodega.descripcion)
      ? truncate((bodega.historia ?? bodega.descripcion)!)
      : undefined,
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
  // Sin foto propia: la botella de uno de sus vinos, entera (contain).
  const bottle = cover ? null : bodega.vinos.find((v) => v.imagen_url) ?? null;
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
  // Texto curado por el admin si lo hay; si no, el resumen propio generado a partir de hechos.
  const aboutText = bodega.historia ?? bodega.descripcion;
  const aboutSummary = aboutText ? null : pickResumen(bodega.resumenes, ["historia", "descripcion"], lang);
  const hasTourism =
    bodega.enoturismo_web || bodega.enoturismo_email || bodega.enoturismo_telefono || bodega.servicios.length > 0;
  const sources = (campos: string[]) => (
    <FieldSources
      lang={lang}
      labels={catalog.attribution}
      procedencia={bodega.procedencia}
      campos={campos}
      conValor={(c) => (bodega as Record<string, unknown>)[c] != null}
    />
  );
  // Las experiencias con más datos (precio, duración, idiomas, qué incluye) primero.
  const riqueza = (sv: (typeof bodega.servicios)[number]) =>
    Number(sv.precio_desde !== null) + Number(sv.duracion_minutos !== null) + Number(sv.idiomas.length > 0) +
    Number(Boolean(sv.descripcion)) + Number(Boolean(sv.url_reserva));
  const servicios = [...bodega.servicios].sort((a, b) => riqueza(b) - riqueza(a));
  const price = (n: number) =>
    formatNumber(lang, n, { style: "currency", currency: "EUR", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
  const externalLink = "inline-flex items-center gap-1 font-medium text-primary underline decoration-1 underline-offset-4 hover:decoration-2";

  return (
    <Container className="flex flex-col gap-12 py-8 sm:py-12">
      <article className="flex flex-col gap-10">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <CatalogImage
              key={cover?.url ?? bottle?.imagen_url ?? "none"}
              src={cover?.url ?? bottle?.imagen_url}
              alt={cover?.alt ?? (bottle ? bottle.imagen_alt ?? bottle.nombre : winery.imageAlt(bodega.nombre))}
              kind="bodega"
              placeholderLabel={winery.placeholderAlt}
              aspect="landscape"
              fit={cover ? "cover" : "contain"}
              priority
              className="max-h-[22rem] w-full sm:aspect-[21/9]"
            />
            <ImageCredit text={cover?.atribucion} label={winery.imageCredit} className="text-right" />
          </div>
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
            <BodegaActions lang={lang} dict={dict} bodegaId={bodega.id} slug={bodega.slug} />
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-12">
          <div className="flex flex-col gap-8">
            <section aria-labelledby="about-heading" className="flex flex-col gap-3">
              <h2 id="about-heading" className="text-2xl font-semibold">
                {winery.about}
              </h2>
              {aboutText ? (
                <>
                  <p className="max-w-prose whitespace-pre-line text-lg text-muted">{aboutText}</p>
                  {sources(["historia", "descripcion"])}
                </>
              ) : aboutSummary ? (
                <>
                  <p className="max-w-prose text-lg text-muted">{aboutSummary.texto}</p>
                  <SummarySources labels={catalog.attribution} resumen={aboutSummary} />
                </>
              ) : (
                <p className="text-muted">{winery.noAbout}</p>
              )}
            </section>

            <section aria-labelledby="tourism-heading" className="flex flex-col gap-4">
              <h2 id="tourism-heading" className="text-2xl font-semibold">
                {winery.tourism}
              </h2>
              {!hasTourism && <p className="text-muted">{winery.tourismEmpty}</p>}
              {(bodega.enoturismo_web || bodega.enoturismo_email || bodega.enoturismo_telefono) && (
                <div className="flex flex-col gap-1">
                  <ul className="flex flex-wrap gap-x-5 gap-y-2">
                    {bodega.enoturismo_web && (
                      <li>
                        <a href={bodega.enoturismo_web} target="_blank" rel="noopener noreferrer" className={externalLink}>
                          {winery.tourismWeb}
                          <ExternalIcon className="size-4" />
                        </a>
                      </li>
                    )}
                    {bodega.enoturismo_telefono && (
                      <li>
                        <span className="sr-only">{winery.phone}: </span>
                        <a href={`tel:${bodega.enoturismo_telefono.replace(/[^\d+]/g, "")}`} className={externalLink}>
                          {bodega.enoturismo_telefono}
                        </a>
                      </li>
                    )}
                    {bodega.enoturismo_email && (
                      <li>
                        <span className="sr-only">{winery.email}: </span>
                        <a href={`mailto:${bodega.enoturismo_email}`} className={`${externalLink} break-all`}>
                          {bodega.enoturismo_email}
                        </a>
                      </li>
                    )}
                  </ul>
                  {sources(["enoturismo_web", "enoturismo_telefono", "enoturismo_email"])}
                </div>
              )}
              {bodega.servicios.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {servicios.map((sv) => {
                    const datos = [
                      sv.precio_desde !== null && {
                        label: winery.price,
                        value: sv.precio_desde === 0 ? winery.free : winery.priceFrom(price(sv.precio_desde)),
                      },
                      sv.duracion_minutos !== null && { label: winery.duration, value: formatDuration(sv.duracion_minutos) },
                      sv.idiomas.length > 0 && { label: winery.languages, value: formatLanguages(lang, sv.idiomas) },
                      sv.horario && { label: winery.schedule, value: sv.horario },
                    ].filter((d): d is { label: string; value: string } => Boolean(d && d.value));
                    const reserva = sv.url_reserva ?? bodega.enoturismo_web;
                    return (
                      <li key={sv.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
                        <div className="flex flex-col gap-2">
                          <Badge tone="accent" className="self-start">{winery.serviceTypes[sv.tipo]}</Badge>
                          <h3 className="font-sans text-base font-semibold">{sv.titulo}</h3>
                        </div>
                        {sv.descripcion && <p className="text-sm text-muted">{sv.descripcion}</p>}
                        {datos.length > 0 && (
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            {datos.map((d) => (
                              <div key={d.label} className={cn("flex flex-col", d.label === winery.schedule && "col-span-2")}>
                                <dt className="text-muted">{d.label}</dt>
                                <dd className="font-medium">{d.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {reserva && (
                          <a href={reserva} target="_blank" rel="noopener noreferrer" className={cn(externalLink, "mt-auto")}>
                            {sv.url_reserva ? winery.book : winery.bookOnWeb}
                            <ExternalIcon className="size-4" />
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

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
                      <ImageCredit text={img.atribucion} label={winery.imageCredit} className="mt-1" />
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
            {facts.length > 0 && sources(["anio_fundacion", "hectareas"])}

            {address && (
              <div className="flex flex-col gap-1">
                <h2 className="font-sans text-sm font-semibold">{winery.address}</h2>
                <address className="not-italic">{address}</address>
                {sources(["direccion", "codigo_postal", "municipio", "provincia", "ubicacion"])}
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
                {sources(["web", "telefono", "email", "redes"])}
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
