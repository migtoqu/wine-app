import NextLink from "next/link";
import { buttonStyles } from "@/components/ui";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { AccountMenu } from "./account-menu";

type Props = { lang: Locale; labels: Dictionary["auth"]["menu"] };

// Enlace "Entrar": sin sesión y como fallback mientras se lee la sesión.
export function LoginLink({ lang, labels }: Props) {
  return (
    <NextLink href={localePath(lang, "/login")} className={buttonStyles({ size: "sm" })}>
      {labels.login}
    </NextLink>
  );
}

// Estado de sesión en la cabecera. Lee cookies: va siempre dentro de <Suspense>.
export async function UserMenu({ lang, labels }: Props) {
  const user = await getCurrentUser();
  if (!user) return <LoginLink lang={lang} labels={labels} />;

  const profile = await getProfile();
  const links = [
    { href: localePath(lang, "/yo"), label: labels.mySpace },
    { href: localePath(lang, "/yo/ajustes"), label: labels.settings },
  ];
  if (profile?.rol === "admin") links.push({ href: localePath(lang, "/admin"), label: labels.admin });
  const initial = (profile?.nombre || user.email || "?").trim().charAt(0);

  return <AccountMenu lang={lang} labels={labels} initial={initial} links={links} />;
}
