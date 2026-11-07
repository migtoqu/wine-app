import type { Metadata } from "next";
import NextLink from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/layout/container";
import { buttonStyles, Skeleton } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { getProfile, requireUser } from "@/lib/auth/server";

// Placeholder: otra sesión completará el espacio personal.
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getDictionary();
  return { title: settings.spaceTitle };
}

export default async function YoPage() {
  const lang = await getLocale();
  const { settings, auth } = await getDictionary();

  return (
    <Container className="py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{settings.spaceTitle}</h1>
      <Suspense fallback={<Skeleton className="mt-2 h-6 w-40" />}>
        <Greeting />
      </Suspense>
      <p className="mt-4 max-w-prose text-muted">{settings.spaceText}</p>
      <NextLink
        href={localePath(lang, "/yo/ajustes")}
        className={buttonStyles({ variant: "secondary", className: "mt-6" })}
      >
        {auth.menu.settings}
      </NextLink>
    </Container>
  );
}

async function Greeting() {
  await requireUser({ next: localePath(await getLocale(), "/yo") });
  const [{ settings }, profile] = await Promise.all([getDictionary(), getProfile()]);
  if (!profile?.nombre) return null;
  return <p className="mt-2 text-lg">{settings.spaceGreeting(profile.nombre)}</p>;
}
