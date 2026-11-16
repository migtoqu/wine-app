import type { Metadata } from "next";
import NextLink from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/layout/container";
import { Badge, buttonStyles, EmptyState, Link, Skeleton } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { getProfile, requireUser } from "@/lib/auth/server";
import { anadaKey } from "@/lib/catalog/format";
import { cn } from "@/lib/cn";
import {
  filterAndSortFavorites,
  parseFavoritesParams,
  type Orden,
  type TipoFiltro,
} from "@/lib/personal/favorites";
import { getFavoritos, getNotasRecientes, type FavoritoItem, type NotaItem } from "@/lib/personal/queries";

// Mi espacio (§5.6): favoritos y notas recientes. Todo depende de la sesión, así
// que la cabecera es estática y el resto va en <Suspense>.
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getDictionary();
  return { title: settings.spaceTitle };
}

export default async function YoPage({ searchParams }: PageProps<"/[lang]/yo">) {
  const lang = await getLocale();
  const { settings, auth } = await getDictionary();

  return (
    <Container className="flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">{settings.spaceTitle}</h1>
          <div className="flex flex-wrap gap-2">
            <NextLink href={localePath(lang, "/yo/cava")} className={buttonStyles({ size: "sm" })}>
              {auth.menu.cava}
            </NextLink>
            <NextLink
              href={localePath(lang, "/yo/ajustes")}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              {auth.menu.settings}
            </NextLink>
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-6 w-40" />}>
          <Greeting />
        </Suspense>
      </header>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Space searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Greeting() {
  await requireUser({ next: localePath(await getLocale(), "/yo") });
  const [{ settings }, profile] = await Promise.all([getDictionary(), getProfile()]);
  if (!profile?.nombre) return null;
  return <p className="text-lg">{settings.spaceGreeting(profile.nombre)}</p>;
}

async function Space({ searchParams }: Pick<PageProps<"/[lang]/yo">, "searchParams">) {
  const lang = await getLocale();
  await requireUser({ next: localePath(lang, "/yo") });
  const [dict, params] = await Promise.all([getDictionary(), searchParams]);
  const view = parseFavoritesParams(params);
  const [favoritos, notas] = await Promise.all([getFavoritos(), getNotasRecientes()]);

  return (
    <>
      <Favorites lang={lang} dict={dict} view={view} items={favoritos} />
      <Notes lang={lang} dict={dict} items={notas} />
    </>
  );
}

function viewHref(lang: Locale, view: { tipo: TipoFiltro; orden: Orden }) {
  const query = new URLSearchParams();
  if (view.tipo !== "todos") query.set("tipo", view.tipo);
  if (view.orden !== "reciente") query.set("orden", view.orden);
  const qs = query.toString();
  return `${localePath(lang, "/yo")}${qs ? `?${qs}` : ""}`;
}

function Pills<T extends string>({
  label,
  options,
  current,
  hrefFor,
}: {
  label: string;
  options: { value: T; label: string }[];
  current: T;
  hrefFor: (value: T) => string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">{label}</span>
      <ul className="flex flex-wrap gap-2">
        {options.map((o) => (
          <li key={o.value}>
            <NextLink
              href={hrefFor(o.value)}
              replace
              scroll={false}
              aria-current={o.value === current ? "true" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium",
                o.value === current
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border-strong bg-surface hover:bg-surface-2",
              )}
            >
              {o.label}
            </NextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Favorites({
  lang,
  dict,
  view,
  items,
}: {
  lang: Locale;
  dict: Dictionary;
  view: { tipo: TipoFiltro; orden: Orden };
  items: FavoritoItem[];
}) {
  const t = dict.space.favorites;
  const shown = filterAndSortFavorites(items, view, lang);

  return (
    <section aria-labelledby="favorites-heading" className="flex flex-col gap-4">
      <h2 id="favorites-heading" className="text-2xl font-semibold">
        {t.title}
      </h2>

      {items.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={t.emptyText}
          action={
            <NextLink href={localePath(lang, "/buscar")} className={buttonStyles()}>
              {t.explore}
            </NextLink>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Pills
              label={t.filterLabel}
              current={view.tipo}
              options={[
                { value: "todos", label: t.filterAll },
                { value: "vino", label: t.filterWines },
                { value: "bodega", label: t.filterWineries },
              ]}
              hrefFor={(tipo) => viewHref(lang, { ...view, tipo })}
            />
            <Pills
              label={t.sortLabel}
              current={view.orden}
              options={[
                { value: "reciente", label: t.sortRecent },
                { value: "nombre", label: t.sortName },
              ]}
              hrefFor={(orden) => viewHref(lang, { ...view, orden })}
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-muted">{t.emptyFilteredTitle}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {shown.map((f) => (
                <li key={f.id}>
                  <FavoriteRow lang={lang} dict={dict} item={f} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function FavoriteRow({ lang, dict, item }: { lang: Locale; dict: Dictionary; item: FavoritoItem }) {
  const t = dict.space.favorites;
  const { vino, bodega } = item;
  const href = vino
    ? localePath(lang, `/vino/${vino.slug}`)
    : bodega
      ? localePath(lang, `/bodega/${bodega.slug}`)
      : null;
  const title = vino?.nombre ?? bodega?.nombre;
  if (!href || !title) return null;
  const subtitle = vino
    ? vino.bodega.nombre
    : [bodega?.municipio, bodega?.provincia !== bodega?.municipio ? bodega?.provincia : null]
        .filter(Boolean)
        .join(", ");

  return (
    <div className="flex h-full flex-col gap-1 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={vino ? "primary" : "accent"}>{vino ? t.wine : t.winery}</Badge>
        <span className="text-xs text-muted">{t.addedOn(formatDate(lang, item.created_at, { dateStyle: "medium" }))}</span>
      </div>
      <Link href={href} className="text-lg">
        {title}
      </Link>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

function Notes({ lang, dict, items }: { lang: Locale; dict: Dictionary; items: NotaItem[] }) {
  const t = dict.space.notes;

  return (
    <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
      <h2 id="notes-heading" className="text-2xl font-semibold">
        {t.title}
      </h2>
      {items.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyText} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((n) => (
            <li key={n.id}>
              <NoteRow lang={lang} dict={dict} item={n} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteRow({ lang, dict, item }: { lang: Locale; dict: Dictionary; item: NotaItem }) {
  const t = dict.space.notes;
  let kind: string;
  let title: string;
  let href: string;
  if (item.anada) {
    const year = item.anada.anio === null ? t.noVintage : String(item.anada.anio);
    kind = t.onVintage(year);
    title = item.anada.vino.nombre;
    href = `${localePath(lang, `/vino/${item.anada.vino.slug}`)}?anada=${anadaKey(item.anada.anio)}`;
  } else if (item.vino) {
    kind = t.onWine;
    title = item.vino.nombre;
    href = localePath(lang, `/vino/${item.vino.slug}`);
  } else if (item.bodega) {
    kind = t.onWinery;
    title = item.bodega.nombre;
    href = localePath(lang, `/bodega/${item.bodega.slug}`);
  } else {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{kind}</Badge>
        <Link href={href} className="text-lg">
          {title}
        </Link>
      </div>
      <p className="line-clamp-4 max-w-prose whitespace-pre-line">{item.texto}</p>
      <p className="text-xs text-muted">
        {t.updatedOn(formatDate(lang, item.updated_at, { dateStyle: "medium" }))}
      </p>
    </div>
  );
}
