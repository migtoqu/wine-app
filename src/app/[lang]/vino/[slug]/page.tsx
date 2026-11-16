import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Attribution } from "@/components/catalog/attribution";
import { CatalogImage } from "@/components/catalog/catalog-image";
import { FieldSources, SummarySources } from "@/components/catalog/field-sources";
import { AnadaNote, VinoActions } from "@/components/catalog/personal-actions";
import { WhereToBuy } from "@/components/catalog/where-to-buy";
import { WineCard, wineCardLabels } from "@/components/catalog/wine-card";
import { Container } from "@/components/layout/container";
import { Badge, Link } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import {
  anadaKey,
  formatAlcohol,
  parseCataResumen,
  formatPercent,
  formatTempRange,
  imageForAnada,
  latestDate,
  pickAnada,
  truncate,
} from "@/lib/catalog/format";
import { formatosDisponibles, pickFormato } from "@/lib/catalog/prices";
import { pickResumen } from "@/lib/catalog/provenance";
import { getOfertasVino, getOtrosVinos, getVino } from "@/lib/catalog/queries";
import type { Anada, Oferta, VinoFicha } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";

// Ficha de vino (§5.4). La lectura está cacheada (perfil "catalogo") y la
// página se genera en la primera visita a cada slug (ISR). `params` se espera
// fuera de <Suspense> para que un slug inexistente responda con un 404 real.
// Lo que depende de ?anada= (imagen y datos de la añada) va en <Suspense> con
// la añada por defecto como fallback: el HTML cacheado ya trae la ficha entera.

// Cache Components exige al menos un parámetro; el catálogo no está disponible
// en build (el CI no tiene acceso a Supabase), así que se usa un slug que
// nunca es válido y todas las fichas se generan bajo demanda.
export function generateStaticParams() {
  return [{ slug: "__placeholder__" }];
}

// La primera visita a cada slug espera a la lectura (para poder responder 404);
// las siguientes salen de caché. No se valida como navegación instantánea.
export const instant = false;

type Props = PageProps<"/[lang]/vino/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [vino, dict] = await Promise.all([getVino(slug), getDictionary()]);
  if (!vino) return { title: dict.catalog.notFoundWine.title };
  return {
    title: `${vino.nombre} · ${vino.bodega.nombre}`,
    description: vino.descripcion ? truncate(vino.descripcion) : undefined,
  };
}

export default async function WinePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const vino = await getVino(slug);
  if (!vino) notFound();

  const lang = await getLocale();
  const dict = await getDictionary();
  const { catalog } = dict;
  const updatedAt = latestDate([vino.updated_at, ...vino.anadas.map((a) => a.updated_at)]);
  const ofertas = await getOfertasVino(vino.id, vino.slug);

  return (
    <Container className="flex flex-col gap-12 py-8 sm:py-12">
      <article className="flex flex-col gap-10">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-10">
          <Suspense fallback={<WineImage vino={vino} anada={vino.anadas[0] ?? null} dict={dict} />}>
            <SelectedWineImage vino={vino} dict={dict} searchParams={searchParams} />
          </Suspense>

          <div className="flex flex-col gap-5">
            <header className="flex flex-col gap-3">
              <h1 className="text-display font-semibold">{vino.nombre}</h1>
              <p className="text-lg">
                <Link href={localePath(lang, `/bodega/${vino.bodega.slug}`)}>{vino.bodega.nombre}</Link>
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone="primary">{catalog.wineTypes[vino.tipo]}</Badge>
                {vino.crianza && <Badge tone="accent">{catalog.agings[vino.crianza]}</Badge>}
                {vino.denominacion && (
                  <Badge>
                    {catalog.appellationTypes[vino.denominacion.tipo]} {vino.denominacion.nombre}
                  </Badge>
                )}
              </div>
            </header>

            {vino.descripcion && (
              <div className="flex flex-col gap-1">
                <p className="max-w-prose whitespace-pre-line text-lg text-muted">{vino.descripcion}</p>
                <FieldSources
                  lang={lang}
                  labels={catalog.attribution}
                  procedencia={vino.procedencia}
                  campos={["descripcion"]}
                />
              </div>
            )}

            <VinoActions
              lang={lang}
              dict={dict}
              vinoId={vino.id}
              slug={vino.slug}
              anadaIds={vino.anadas.map((a) => a.id)}
            />
          </div>
        </div>

        {/* Formato elegido en ?formato=; el fallback (75 cl) ya trae todas las ofertas. */}
        <Suspense
          fallback={
            <BuyBlock lang={lang} dict={dict} vino={vino} ofertas={ofertas} params={{}} />
          }
        >
          <SelectedBuyBlock lang={lang} dict={dict} vino={vino} ofertas={ofertas} searchParams={searchParams} />
        </Suspense>

        <section aria-labelledby="vintages-heading" className="flex flex-col gap-6">
          <h2 id="vintages-heading" className="text-2xl font-semibold">
            {catalog.wine.vintages}
          </h2>
          <Suspense
            fallback={<VintageDetails lang={lang} vino={vino} anada={vino.anadas[0] ?? null} dict={dict} />}
          >
            <SelectedVintage lang={lang} vino={vino} dict={dict} searchParams={searchParams} />
          </Suspense>
        </section>

        <Attribution
          lang={lang}
          labels={catalog.attribution}
          fuente={vino.fuente}
          updatedAt={updatedAt}
        />
      </article>

      <MoreFromWinery lang={lang} vino={vino} dict={dict} />
    </Container>
  );
}

type SearchParamsProp = { searchParams: Props["searchParams"] };

type BuyBlockProps = { lang: Locale; dict: Dictionary; vino: VinoFicha; ofertas: Oferta[] };

async function SelectedBuyBlock({ searchParams, ...props }: BuyBlockProps & SearchParamsProp) {
  return <BuyBlock {...props} params={await searchParams} />;
}

function BuyBlock({
  lang,
  dict,
  vino,
  ofertas,
  params,
}: BuyBlockProps & { params: Record<string, string | string[] | undefined> }) {
  const formato = pickFormato(params.formato, formatosDisponibles(ofertas));
  const anada = typeof params.anada === "string" ? params.anada : null;
  const hrefFormato = (ml: number) => {
    const q = new URLSearchParams();
    if (anada) q.set("anada", anada);
    q.set("formato", String(ml));
    return `${localePath(lang, `/vino/${vino.slug}`)}?${q}`;
  };
  return <WhereToBuy lang={lang} dict={dict} ofertas={ofertas} formato={formato} hrefFormato={hrefFormato} />;
}

async function SelectedWineImage({
  vino,
  dict,
  searchParams,
}: { vino: VinoFicha; dict: Dictionary } & SearchParamsProp) {
  const anada = pickAnada(vino.anadas, (await searchParams).anada);
  return <WineImage vino={vino} anada={anada} dict={dict} />;
}

function WineImage({
  vino,
  anada,
  dict,
}: {
  vino: VinoFicha;
  anada: Anada | null;
  dict: Dictionary;
}) {
  const { wine, wineTypes } = dict.catalog;
  const image = imageForAnada(vino, anada);
  return (
    <CatalogImage
      key={image?.url ?? "none"}
      src={image?.url}
      alt={image?.alt ?? wine.imageAlt(vino.nombre)}
      kind="vino"
      tipoVino={vino.tipo}
      placeholderLabel={wine.placeholderAlt(wineTypes[vino.tipo])}
      priority
      className="mx-auto w-full max-w-64 border border-border"
    />
  );
}

async function SelectedVintage({
  lang,
  vino,
  dict,
  searchParams,
}: { lang: Locale; vino: VinoFicha; dict: Dictionary } & SearchParamsProp) {
  const anada = pickAnada(vino.anadas, (await searchParams).anada);
  return (
    <>
      <VintageDetails lang={lang} vino={vino} anada={anada} dict={dict} />
      {anada && (
        <AnadaNote
          lang={lang}
          dict={dict}
          vinoId={vino.id}
          slug={vino.slug}
          anadaId={anada.id}
          anadaIds={vino.anadas.map((a) => a.id)}
          anio={anada.anio}
        />
      )}
    </>
  );
}

function VintageDetails({
  lang,
  vino,
  anada,
  dict,
}: {
  lang: Locale;
  vino: VinoFicha;
  anada: Anada | null;
  dict: Dictionary;
}) {
  const { wine } = dict.catalog;
  if (!anada) return <p className="text-muted">{wine.noDetails}</p>;

  const facts = [
    { label: wine.alcohol, value: formatAlcohol(lang, anada.grado) },
    {
      label: wine.monthsInOak,
      value: anada.meses_crianza !== null ? wine.months(anada.meses_crianza) : null,
    },
    {
      label: wine.servingTemp,
      value: formatTempRange(lang, anada.temp_servicio_min, anada.temp_servicio_max),
    },
    {
      label: wine.production,
      value:
        anada.produccion_botellas !== null
          ? wine.bottles(formatNumber(lang, anada.produccion_botellas))
          : null,
    },
  ].filter((f): f is { label: string; value: string } => f.value !== null);
  // Textos: el curado por el admin (añada, después vino) o el resumen propio generado a partir de hechos.
  const elaboracion = anada.elaboracion ?? vino.elaboracion;
  const resumenElaboracion = elaboracion ? null : pickResumen(anada.resumenes, ["elaboracion"], lang);
  // Cata: columnas curadas por el admin; si no hay, el resumen propio (vocabulario cerrado) por partes.
  const curada = Boolean(anada.cata_vista || anada.cata_nariz || anada.cata_boca || anada.notas_cata);
  const resumenCata = curada && anada.maridaje ? null : pickResumen(anada.resumenes, ["cata"], lang);
  const partes = resumenCata ? parseCataResumen(resumenCata.texto) : null;
  const cata = [
    { label: wine.sight, value: curada ? anada.cata_vista : partes?.vista ?? null },
    { label: wine.nose, value: curada ? anada.cata_nariz : partes?.nariz ?? null },
    { label: wine.palate, value: curada ? anada.cata_boca : partes?.boca ?? null },
  ].filter((c): c is { label: string; value: string } => c.value !== null);
  const notasCata = curada ? anada.notas_cata : partes?.resto ?? null;
  const maridaje = anada.maridaje ?? partes?.maridaje ?? null;
  // La atribución del resumen solo se muestra si de verdad se usa alguna parte.
  const usaResumenCata = Boolean(resumenCata && ((!curada && (cata.length > 0 || notasCata)) || (!anada.maridaje && partes?.maridaje)));
  const hasDetails =
    facts.length > 0 || anada.variedades.length > 0 || maridaje || notasCata ||
    elaboracion || resumenElaboracion || cata.length > 0;
  const title = anada.anio === null ? wine.noVintageData : wine.vintageData(String(anada.anio));

  return (
    <div className="flex flex-col gap-6">
      {vino.anadas.length > 1 && (
        <nav aria-label={wine.vintage}>
          <ul className="flex flex-wrap gap-2">
            {vino.anadas.map((a) => {
              const current = a.id === anada.id;
              return (
                <li key={a.id}>
                  <NextLink
                    href={`${localePath(lang, `/vino/${vino.slug}`)}?anada=${anadaKey(a.anio)}`}
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
                    {a.anio ?? wine.noVintage}
                  </NextLink>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="flex flex-col gap-6 rounded-card border border-border bg-surface p-5 sm:p-6">
        <h3 className="text-xl font-semibold">{title}</h3>
        {!hasDetails && <p className="text-muted">{wine.noDetails}</p>}

        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col gap-1">
                <dt className="text-sm text-muted">{f.label}</dt>
                <dd className="font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {anada.variedades.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">{wine.grapes}</h4>
            <ul className="flex flex-wrap gap-2">
              {anada.variedades.map((v) => (
                <li key={v.slug}>
                  <Badge className="text-sm">
                    {v.nombre}
                    {v.porcentaje !== null && (
                      <span className="ml-1.5 font-normal">{formatPercent(lang, v.porcentaje)}</span>
                    )}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(elaboracion || resumenElaboracion) && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">{wine.elaboration}</h4>
            <p className="max-w-prose whitespace-pre-line">{elaboracion ?? resumenElaboracion!.texto}</p>
            {resumenElaboracion && (
              <SummarySources labels={dict.catalog.attribution} resumen={resumenElaboracion} />
            )}
          </div>
        )}

        {(cata.length > 0 || notasCata) && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">{wine.tastingNotes}</h4>
            {cata.length > 0 && (
              <dl className="grid gap-3 sm:grid-cols-3">
                {cata.map((c) => (
                  <div key={c.label} className="flex flex-col gap-1 rounded-card bg-surface-2 p-3">
                    <dt className="text-sm text-muted">{c.label}</dt>
                    <dd className="whitespace-pre-line">{c.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {notasCata && <p className="max-w-prose whitespace-pre-line">{notasCata}</p>}
          </div>
        )}

        {maridaje && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold">{wine.pairing}</h4>
            <p className="max-w-prose whitespace-pre-line">{maridaje}</p>
          </div>
        )}

        {usaResumenCata && <SummarySources labels={dict.catalog.attribution} resumen={resumenCata!} />}

        <FieldSources
          lang={lang}
          labels={dict.catalog.attribution}
          procedencia={anada.procedencia}
          campos={[
            "grado", "meses_crianza", "temp_servicio_min", "temp_servicio_max", "produccion_botellas",
            "elaboracion", "cata_vista", "cata_nariz", "cata_boca", "notas_cata", "maridaje",
          ]}
          conValor={(c) => (anada as Record<string, unknown>)[c] != null}
          className="border-t border-border pt-3"
        />
      </div>
    </div>
  );
}

async function MoreFromWinery({
  lang,
  vino,
  dict,
}: {
  lang: Locale;
  vino: VinoFicha;
  dict: Dictionary;
}) {
  const otros = await getOtrosVinos(vino.bodega.slug, vino.id);
  if (otros.length === 0) return null;
  const { wine } = dict.catalog;
  const labels = wineCardLabels(dict);

  return (
    <section aria-labelledby="more-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="more-heading" className="text-2xl font-semibold">
          {wine.moreFromWinery(vino.bodega.nombre)}
        </h2>
        <Link href={localePath(lang, `/bodega/${vino.bodega.slug}`)}>{wine.seeWinery}</Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {otros.map((w) => (
          <li key={w.id} className="flex">
            <WineCard lang={lang} wine={w} labels={labels} showWinery={false} className="w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}
