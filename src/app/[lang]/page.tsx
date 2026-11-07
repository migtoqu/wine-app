import NextLink from "next/link";
import { SearchCombobox } from "@/components/catalog/search-combobox";
import { searchComboboxLabels } from "@/components/catalog/search-labels";
import { Container } from "@/components/layout/container";
import { Badge, buttonStyles, Card, CardBody } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function Home() {
  const lang = await getLocale();
  const dict = await getDictionary();
  const { landing } = dict;
  const tones = ["primary", "accent", "success"] as const;

  return (
    <Container className="flex flex-col gap-16 py-12 sm:py-20">
      <section className="flex flex-col items-start gap-6" aria-labelledby="hero-title">
        <Badge tone="accent">{landing.eyebrow}</Badge>
        <h1 id="hero-title" className="max-w-3xl text-display font-semibold">
          {landing.title}
        </h1>
        <p className="max-w-2xl text-lg text-muted sm:text-xl">{landing.subtitle}</p>
        <div className="flex w-full max-w-2xl flex-col gap-2">
          <SearchCombobox lang={lang} labels={searchComboboxLabels(dict)} size="lg" />
          <NextLink
            href={localePath(lang, "/buscar")}
            className="self-start text-sm font-medium text-primary underline underline-offset-4"
          >
            {dict.search.exploreCta}
          </NextLink>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <NextLink
            href={localePath(lang, "/login")}
            className={buttonStyles({ size: "lg" })}
          >
            {landing.ctaLogin}
          </NextLink>
          <NextLink
            href={localePath(lang, "/login")}
            className={buttonStyles({ size: "lg", variant: "secondary" })}
          >
            {landing.ctaInvite}
          </NextLink>
        </div>
      </section>

      <section aria-labelledby="features-title" className="flex flex-col gap-6">
        <h2 id="features-title" className="text-2xl font-semibold">
          {landing.featuresTitle}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {landing.features.map((feature, index) => (
            <li key={feature.title}>
              <Card className="h-full">
                <CardBody className="flex flex-col gap-3">
                  <Badge tone={tones[index % tones.length]} className="self-start">
                    {feature.badge}
                  </Badge>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted">{feature.text}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
