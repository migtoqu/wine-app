import NextLink from "next/link";
import { Container } from "@/components/layout/container";
import { buttonStyles, EmptyState } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function NotFound() {
  const lang = await getLocale();
  const { notFound } = await getDictionary();

  return (
    <Container className="max-w-xl py-16">
      <EmptyState
        as="h1"
        title={notFound.title}
        description={notFound.text}
        action={
          <NextLink href={localePath(lang)} className={buttonStyles()}>
            {notFound.back}
          </NextLink>
        }
      />
    </Container>
  );
}
