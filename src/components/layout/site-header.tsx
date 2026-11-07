import NextLink from "next/link";
import { Suspense } from "react";
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
