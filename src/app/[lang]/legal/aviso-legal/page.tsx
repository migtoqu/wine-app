import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { legalContent } from "@/content/legal";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { legal } = await getDictionary();
  return { title: legal.legalNoticeTitle };
}

export default async function Page() {
  const lang = await getLocale();
  const dict = await getDictionary();
  const content = legalContent[lang];

  return (
    <LegalPage lang={lang} dict={dict} title={dict.legal.legalNoticeTitle} lastUpdated={content.lastUpdated}>
      {content.legalNotice}
    </LegalPage>
  );
}
