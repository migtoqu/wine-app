import type { Metadata } from "next";
import NextLink from "next/link";
import { Suspense } from "react";
import { CavaCounter } from "@/components/personal/cava-counter";
import { Container } from "@/components/layout/container";
import { Badge, buttonStyles, EmptyState, Link, Skeleton } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import { currentYear, formatDate, formatNumber, formatPrice } from "@/i18n/format";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/server";
import { cavaTotals, drinkWindow, type DrinkWindow } from "@/lib/personal/cava";
import { deleteCavaLote } from "@/lib/personal/cava-actions";
import { getCava, type CavaLote } from "@/lib/personal/queries";

// Mi cava (§5.6): lotes de botellas en casa. Cabecera estática; la lista
// depende de la sesión y va en <Suspense>.
export async function generateMetadata(): Promise<Metadata> {
  const { cava } = await getDictionary();
  return { title: cava.title };
}

export default async function CavaPage() {
  const lang = await getLocale();
  const { cava } = await getDictionary();

  return (
    <Container className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">{cava.title}</h1>
          <NextLink href={localePath(lang, "/yo/cava/nueva")} className={buttonStyles({ size: "sm" })}>
            {cava.add}
          </NextLink>
        </div>
        <p className="max-w-prose text-muted">{cava.intro}</p>
      </header>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <CavaList />
      </Suspense>
    </Container>
  );
}

async function CavaList() {
  const lang = await getLocale();
  await requireUser({ next: localePath(lang, "/yo/cava") });
  const [dict, lotes] = await Promise.all([getDictionary(), getCava()]);
  const { cava } = dict;

  if (lotes.length === 0) {
    return (
      <EmptyState
        title={cava.empty}
        description={cava.emptyHint}
        action={
          <NextLink href={localePath(lang, "/buscar")} className={buttonStyles({ variant: "secondary" })}>
            {dict.search.exploreCta}
          </NextLink>
        }
      />
    );
  }

  const year = currentYear();
  const enCasa = lotes.filter((l) => l.cantidad > 0);
  const bebidas = lotes.filter((l) => l.cantidad === 0);
  const totals = cavaTotals(enCasa);

  return (
    <div className="flex flex-col gap-10">
      <p className="text-lg font-semibold">
        {cava.total(totals.botellas, formatNumber(lang, totals.botellas), totals.valor > 0 ? formatPrice(lang, totals.valor) : null)}
      </p>
      {enCasa.length > 0 && (
        <ul className="flex flex-col gap-4">
          {enCasa.map((lote) => (
            <LoteItem key={lote.id} lang={lang} dict={dict} lote={lote} year={year} />
          ))}
        </ul>
      )}
      {bebidas.length > 0 && (
        <section aria-labelledby="cava-bebidas" className="flex flex-col gap-3">
          <h2 id="cava-bebidas" className="text-xl font-semibold">
            {cava.finished}
          </h2>
          <p className="text-sm text-muted">{cava.finishedHint}</p>
          <ul className="flex flex-col gap-4">
            {bebidas.map((lote) => (
              <LoteItem key={lote.id} lang={lang} dict={dict} lote={lote} year={year} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const windowTone: Record<DrinkWindow, "success" | "accent" | "primary" | "neutral"> = {
  unknown: "neutral",
  wait: "accent",
  ready: "success",
  last: "primary",
  past: "neutral",
};

function LoteItem({ lang, dict, lote, year }: { lang: Locale; dict: Dictionary; lote: CavaLote; year: number }) {
  const { cava } = dict;
  const status = drinkWindow(lote.beber_desde, lote.beber_hasta, year);
  const windowText =
    status === "wait" ? cava.window.wait(lote.beber_desde!) : status === "unknown" ? null : cava.window[status];
  const title = [lote.nombre, lote.anio].filter(Boolean).join(" ");
  const meta = [
    lote.formato_ml !== 750 ? (cava.formatos[lote.formato_ml] ?? `${lote.formato_ml / 10} cl`) : null,
    lote.precio_compra !== null ? cava.perBottle(formatPrice(lang, lote.precio_compra)) : null,
    lote.fecha_compra ? cava.bought(formatDate(lang, lote.fecha_compra, { dateStyle: "medium" })) : null,
    lote.tienda,
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="font-semibold">
            {lote.vino ? <Link href={localePath(lang, `/vino/${lote.vino.slug}`)}>{title}</Link> : title}
          </h3>
          {lote.bodega_nombre && <p className="text-sm text-muted">{lote.bodega_nombre}</p>}
        </div>
        {windowText && lote.cantidad > 0 && <Badge tone={windowTone[status]}>{windowText}</Badge>}
      </div>
      {meta.length > 0 && <p className="text-sm text-muted">{meta.join(" · ")}</p>}
      {lote.ubicacion && <p className="text-sm">📍 {lote.ubicacion}</p>}
      {lote.notas && <p className="whitespace-pre-line text-sm text-muted">{lote.notas}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CavaCounter
          lang={lang}
          id={lote.id}
          cantidad={lote.cantidad}
          labels={{
            open: cava.open,
            openLabel: cava.openLabel(lote.nombre),
            plusLabel: cava.plusLabel(lote.nombre),
            bottles: cava.bottles(lote.cantidad),
          }}
        />
        <div className="flex gap-2">
          <NextLink
            href={localePath(lang, `/yo/cava/${lote.id}`)}
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            {cava.edit}
          </NextLink>
          {lote.cantidad === 0 && (
            <form action={deleteCavaLote}>
              <input type="hidden" name="lang" value={lang} />
              <input type="hidden" name="id" value={lote.id} />
              <button type="submit" className={buttonStyles({ variant: "ghost", size: "sm" })}>
                {cava.delete}
              </button>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}
