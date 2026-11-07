import type { ReactNode } from "react";
import { Prose } from "@/components/ui/prose";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { Container } from "./container";

type Props = {
  lang: Locale;
  dict: Dictionary;
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalPage({ lang, dict, title, lastUpdated, children }: Props) {
  return (
    <Container className="py-12">
      <article>
        <header className="mb-8 border-b border-border pb-6">
          <h1 className="text-4xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted">
            {dict.legal.lastUpdated}:{" "}
            <time dateTime={lastUpdated}>{formatDate(lang, lastUpdated)}</time>
          </p>
        </header>
        <Prose>{children}</Prose>
      </article>
    </Container>
  );
}
