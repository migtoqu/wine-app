import type { Metadata } from "next";
import { Suspense } from "react";
import { RecoverForm } from "@/components/auth/auth-forms";
import { AuthShell, FormFallback } from "@/components/auth/auth-shell";
import { Link } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { auth } = await getDictionary();
  return { title: auth.recoverTitle };
}

export default async function RecuperarPage({ searchParams }: PageProps<"/[lang]/recuperar">) {
  const lang = await getLocale();
  const { auth } = await getDictionary();

  return (
    <AuthShell
      title={auth.recoverTitle}
      intro={auth.recoverIntro}
      footer={
        <p>
          <Link href={localePath(lang, "/login")}>{auth.toLogin}</Link>
        </p>
      }
    >
      <Suspense fallback={<FormFallback fields={1} />}>
        <RecoverFormWithParams lang={lang} labels={auth} searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

// searchParams es dato de la petición: va dentro de Suspense para no bloquear el shell.
async function RecoverFormWithParams({
  lang,
  labels,
  searchParams,
}: {
  lang: Locale;
  labels: Dictionary["auth"];
  searchParams: PageProps<"/[lang]/recuperar">["searchParams"];
}) {
  const { error } = await searchParams;
  return <RecoverForm lang={lang} labels={labels} browserError={error === "navegador"} />;
}
