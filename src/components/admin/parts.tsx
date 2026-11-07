import NextLink from "next/link";
import type { ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-parts";
import { Button, buttonStyles } from "@/components/ui";
import type { AdminDictionary } from "@/i18n/dictionaries/admin/es";
import type { AdminErrorKey } from "@/lib/admin/validation";
import { cn } from "@/lib/cn";

// Piezas de servidor del panel de admin: cabecera, avisos, búsqueda, listados
// y borrado. Sin JS de cliente.

export function AdminHeader({
  title,
  back,
  actions,
  children,
}: {
  title: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <NextLink href={back.href} className="text-sm font-medium text-muted hover:text-fg">
          ← {back.label}
        </NextLink>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function NewButton({ href, label }: { href: string; label: string }) {
  return (
    <NextLink href={href} className={buttonStyles({ size: "sm" })}>
      + {label}
    </NextLink>
  );
}

// Aviso tras una redirección (?ok=… o ?error=…).
export function Flash({
  ok,
  error,
  messages,
  errors,
}: {
  ok?: string;
  error?: string;
  messages: Record<string, string>;
  errors: AdminDictionary["errors"];
}) {
  if (error) {
    const key = (error in errors ? error : "generic") as AdminErrorKey;
    return <FormAlert>{errors[key]}</FormAlert>;
  }
  if (ok && messages[ok]) return <FormAlert tone="success">{messages[ok]}</FormAlert>;
  return null;
}

export function SearchForm({
  action,
  q,
  labels,
  hidden = {},
}: {
  action: string;
  q: string;
  labels: AdminDictionary["common"];
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action} role="search" className="flex gap-2">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor="admin-q" className="sr-only">
        {labels.searchLabel}
      </label>
      <input
        id="admin-q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder={labels.searchLabel}
        className="h-11 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 text-base"
      />
      <Button type="submit" variant="secondary">
        {labels.search}
      </Button>
      {q && (
        <NextLink href={action} className={buttonStyles({ variant: "ghost", className: "hidden sm:inline-flex" })}>
          {labels.clear}
        </NextLink>
      )}
    </form>
  );
}

export type ListItem = { id: string; href: string; title: string; meta?: ReactNode; badge?: ReactNode };

export function AdminList({ items, empty }: { items: ListItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-6 text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {items.map((item) => (
        <li key={item.id}>
          <NextLink
            href={item.href}
            className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{item.title}</span>
              {item.meta && <span className="truncate text-sm text-muted">{item.meta}</span>}
            </span>
            {item.badge}
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export type Count = { label: string; count: number };

// Borrado con confirmación. Si hay dependencias que lo impiden (FK restrict) no
// se muestra el botón y se explica por qué.
export function DeletePanel({
  action,
  hidden,
  cascade,
  blocked,
  labels,
  scraperNote = true,
}: {
  action: (form: FormData) => Promise<void>;
  hidden: Record<string, string>;
  cascade: Count[];
  blocked: Count[];
  labels: AdminDictionary["delete"];
  scraperNote?: boolean;
}) {
  const blockers = blocked.filter((b) => b.count > 0);
  const cascades = cascade.filter((c) => c.count > 0);
  return (
    <section className="flex flex-col gap-3 rounded-card border border-danger/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-danger">{labels.title}</h2>
      {blockers.length > 0 ? (
        <>
          <p className="text-sm">{labels.blockedIntro}</p>
          <CountList items={blockers} />
        </>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {cascades.length > 0 ? (
            <>
              <p className="text-sm">{labels.cascadeIntro}</p>
              <CountList items={cascades} />
            </>
          ) : (
            <p className="text-sm text-muted">{labels.nothingElse}</p>
          )}
          {scraperNote && <p className="text-sm text-muted">{labels.scraperNote}</p>}
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" name="confirmar" required className="size-5 accent-danger" />
            {labels.confirm}
          </label>
          <Button type="submit" variant="danger" className="w-full sm:w-auto sm:self-start">
            {labels.button}
          </Button>
        </form>
      )}
    </section>
  );
}

function CountList({ items }: { items: Count[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((c) => (
        <li key={c.label} className="flex justify-between gap-3 border-b border-border py-1 last:border-0">
          <span>{c.label}</span>
          <span className="font-semibold tabular-nums">{c.count}</span>
        </li>
      ))}
    </ul>
  );
}
