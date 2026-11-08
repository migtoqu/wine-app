import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";
import { AuthShell, FormFallback } from "@/components/auth/auth-shell";
import { Link } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { auth } = await getDictionary();
  return { title: auth.loginTitle };
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const lang = await getLocale();
  const { auth } = await getDictionary();

  return (
    <AuthShell
      title={auth.loginTitle}
      intro={auth.loginIntro}
      footer={
        <p>
          {auth.noAccount} <Link href={localePath(lang, "/registro")}>{auth.toRegister}</Link>
        </p>
      }
    >
      <Suspense fallback={<FormFallback />}>
        <LoginFormWithParams lang={lang} labels={auth} searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

// searchParams es dato de la petición: va dentro de Suspense para no bloquear el shell.
async function LoginFormWithParams({
  lang,
  labels,
  searchParams,
}: {
  lang: Locale;
  labels: Dictionary["auth"];
  searchParams: PageProps<"/[lang]/login">["searchParams"];
}) {
  const { next, error, confirmado, email } = await searchParams;
  return (
    <LoginForm
      lang={lang}
      labels={labels}
      next={typeof next === "string" ? next : null}
      notice={confirmado === "1" ? "confirmed" : error === "enlace" ? "linkError" : null}
      email={typeof email === "string" ? email.slice(0, 254) : null}
    />
  );
}
