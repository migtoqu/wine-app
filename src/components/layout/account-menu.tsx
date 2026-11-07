"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { signOut } from "@/lib/auth/actions";

type Props = {
  lang: Locale;
  labels: Dictionary["auth"]["menu"];
  // Inicial del nombre o del email, para el botón.
  initial: string;
  links: { href: string; label: string }[];
};

const itemClass =
  "block w-full rounded-control px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2";

// Menú de cuenta sobre <details>: funciona sin JS; con JS se cierra al navegar,
// al pulsar fuera y con Escape.
export function AccountMenu({ lang, labels, initial, links }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    ref.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        details.open = false;
        details.querySelector("summary")?.focus();
      } else if (!details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        className="grid size-10 cursor-pointer list-none place-items-center rounded-full bg-primary text-sm font-semibold uppercase text-primary-fg hover:bg-primary-hover [&::-webkit-details-marker]:hidden"
        aria-label={labels.account}
        title={labels.account}
      >
        <span aria-hidden>{initial}</span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-48 rounded-card border border-border bg-surface p-1 shadow-card">
        <ul className="flex flex-col">
          {links.map((link) => (
            <li key={link.href}>
              <NextLink href={link.href} className={itemClass}>
                {link.label}
              </NextLink>
            </li>
          ))}
          <li className="mt-1 border-t border-border pt-1">
            <form action={signOut}>
              <input type="hidden" name="lang" value={lang} />
              <button type="submit" className={itemClass}>
                {labels.logout}
              </button>
            </form>
          </li>
        </ul>
      </div>
    </details>
  );
}
