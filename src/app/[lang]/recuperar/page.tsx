import type { Metadata } from "next";
import { RecoverForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import { Link } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { auth } = await getDictionary();
  return { title: auth.recoverTitle };
}

export default async function RecuperarPage() {
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
      <RecoverForm lang={lang} labels={auth} />
    </AuthShell>
  );
}
