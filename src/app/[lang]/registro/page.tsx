import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import { Link } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { auth } = await getDictionary();
  return { title: auth.registerTitle };
}

export default async function RegistroPage() {
  const lang = await getLocale();
  const { auth } = await getDictionary();

  return (
    <AuthShell
      title={auth.registerTitle}
      intro={auth.registerIntro}
      footer={
        <p>
          {auth.haveAccount} <Link href={localePath(lang, "/login")}>{auth.toLogin}</Link>
        </p>
      }
    >
      <RegisterForm lang={lang} labels={auth} />
    </AuthShell>
  );
}
