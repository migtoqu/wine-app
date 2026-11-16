import NextLink from "next/link";
import { Suspense } from "react";
import { MapIcon, SearchIcon } from "@/components/catalog/icons";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { Container } from "./container";
import { LanguageSwitcher } from "./language-switcher";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { LoginLink, UserMenu } from "./user-menu";

type Props = { lang: Locale; dict: Dictionary };

export function SiteHeader({ lang, dict }: Props) {
  const other: Locale = lang === "es" ? "en" : "es";

  return (
    <header className="border-b border-border bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75 sticky top-0 z-30">
      <Container className="flex h-16 items-center justify-between gap-4">
        <NextLink
          href={localePath(lang)}
          aria-label={dict.common.homeLabel}
          className="flex items-center gap-2 text-primary"
        >
          <LogoMark />
          <span className="font-display text-xl font-semibold tracking-tight text-fg max-sm:sr-only">
            wine-app
          </span>
        </NextLink>
        <div className="flex items-center gap-2">
          <NextLink
            href={localePath(lang, "/buscar")}
            aria-label={dict.search.label}
            className="inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-2"
          >
            <SearchIcon className="size-5" />
            <span aria-hidden className="hidden sm:inline">
              {dict.search.nav}
            </span>
          </NextLink>
          <NextLink
            href={localePath(lang, "/mapa")}
            aria-label={dict.map.title}
            // En móvil no cabe: el mapa se enlaza desde Buscar.
            className="max-sm:hidden inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-2"
          >
            <MapIcon className="size-5" />
            <span aria-hidden className="hidden sm:inline">
              {dict.map.nav}
            </span>
          </NextLink>
          <LanguageSwitcher
            target={other}
            label={dict.language.switchTo}
            short={dict.language.short}
          />
          <ThemeToggle labels={dict.theme} />
          <Suspense fallback={<LoginLink lang={lang} labels={dict.auth.menu} />}>
            <UserMenu lang={lang} labels={dict.auth.menu} />
          </Suspense>
        </div>
      </Container>
    </header>
  );
}
