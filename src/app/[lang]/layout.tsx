import type { Metadata, Viewport } from "next";
import { Fraunces, Geist } from "next/font/google";
import { AgeGate } from "@/components/layout/age-gate";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { ThemeScript } from "@/components/layout/theme-script";
import { localePath, locales } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

const APP_ID = "app";

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return {
    title: { default: dict.meta.title, template: `%s · ${dict.meta.title}` },
    description: dict.meta.description,
    applicationName: "wine-app",
    appleWebApp: { title: "wine-app", statusBarStyle: "default" },
    // Fase privada: que no se indexe hasta la apertura pública.
    robots: { index: false, follow: false },
    alternates: {
      languages: Object.fromEntries(locales.map((l) => [l, localePath(l)])),
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#161012" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const lang = await getLocale();
  const dict = await getDictionary();

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <AgeGate
          labels={dict.ageGate}
          cookiesHref={localePath(lang, "/legal/cookies")}
          appId={APP_ID}
        />
        <div id={APP_ID} className="flex min-h-dvh flex-col">
          <SkipLink label={dict.common.skipToContent} />
          <SiteHeader lang={lang} dict={dict} />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter lang={lang} dict={dict} />
        </div>
      </body>
    </html>
  );
}
