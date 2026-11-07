import type { Metadata } from "next";
import NextLink from "next/link";
import { Suspense } from "react";
import { ResetForm } from "@/components/auth/auth-forms";
import { AuthShell, FormFallback } from "@/components/auth/auth-shell";
import { buttonStyles } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/server";

export async function generateMetadata(): Promise<Metadata> {
  const { auth } = await getDictionary();
  return { title: auth.resetTitle };
}

export default async function RestablecerPage() {
  const lang = await getLocale();
  const { auth } = await getDictionary();

  return (
    <AuthShell title={auth.resetTitle} intro={auth.resetIntro}>
      <Suspense fallback={<FormFallback />}>
        <ResetOrExpired lang={lang} labels={auth} />
      </Suspense>
    </AuthShell>
  );
}

// La sesión la crea /auth/confirm al abrir el enlace del email; sin ella, el enlace caducó.
async function ResetOrExpired({ lang, labels }: { lang: Locale; labels: Dictionary["auth"] }) {
  if (await getCurrentUser()) return <ResetForm lang={lang} labels={labels} />;
  return (
    <div className="flex flex-col gap-4">
      <p>{labels.resetNoSession}</p>
      <NextLink href={localePath(lang, "/recuperar")} className={buttonStyles({ className: "self-start" })}>
        {labels.resetRequestNew}
      </NextLink>
    </div>
  );
}
