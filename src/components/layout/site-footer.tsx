import NextLink from "next/link";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { Container } from "./container";

type Props = { lang: Locale; dict: Dictionary };

export function SiteFooter({ lang, dict }: Props) {
  const links = [
    { href: "/legal/privacidad", label: dict.footer.privacy },
    { href: "/legal/cookies", label: dict.footer.cookies },
    { href: "/legal/aviso-legal", label: dict.footer.legalNotice },
  ];

  return (
    <footer className="mt-auto border-t border-border bg-surface-2">
      <Container className="flex flex-col gap-6 py-8 text-sm">
        <p className="flex items-start gap-2 font-medium text-fg">
          <span
            aria-hidden
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 border-current text-[0.6rem] font-bold"
          >
            18
          </span>
          {dict.footer.responsible}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label={dict.footer.legalNav}>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {links.map((link) => (
                <li key={link.href}>
                  <NextLink
                    href={localePath(lang, link.href)}
                    className="inline-block py-1 text-muted underline-offset-4 hover:text-fg hover:underline"
                  >
                    {link.label}
                  </NextLink>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-muted">wine-app · {dict.footer.privateBeta}</p>
        </div>
      </Container>
    </footer>
  );
}
