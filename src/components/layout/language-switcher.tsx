"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { LOCALE_COOKIE, switchLocalePath, type Locale } from "@/i18n/config";
import { setClientCookie } from "@/lib/preferences";

type Props = {
  target: Locale;
  label: string;
  short: string;
};

// Enlace a la misma página en el otro idioma; recuerda la elección para próximas visitas a "/".
export function LanguageSwitcher({ target, label, short }: Props) {
  const pathname = usePathname();

  return (
    <NextLink
      href={switchLocalePath(pathname, target)}
      hrefLang={target}
      lang={target}
      onClick={() => setClientCookie(LOCALE_COOKIE, target)}
      className="grid h-10 min-w-10 place-items-center rounded-full border border-border bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-2"
    >
      <span aria-hidden>{short}</span>
      <span className="sr-only">{label}</span>
    </NextLink>
  );
}
