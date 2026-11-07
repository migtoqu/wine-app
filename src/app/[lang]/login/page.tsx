import type { Metadata } from "next";
import NextLink from "next/link";
import { Container } from "@/components/layout/container";
import { buttonStyles, EmptyState } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";

// Placeholder hasta la sesión de autenticación.
export async function generateMetadata(): Promise<Metadata> {
  const { login } = await getDictionary();
  return { title: login.title };
}

export default async function LoginPage() {
  const lang = await getLocale();
  const { login, common } = await getDictionary();

  return (
    <Container className="max-w-xl py-16">
      <EmptyState
        as="h1"
        title={login.title}
        description={
          <>
            <p className="font-medium text-fg">{common.comingSoon}</p>
            <p className="mt-1">{login.text}</p>
          </>
        }
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        }
        action={
          <NextLink href={localePath(lang)} className={buttonStyles({ variant: "secondary" })}>
            {login.back}
          </NextLink>
        }
      />
    </Container>
  );
}
