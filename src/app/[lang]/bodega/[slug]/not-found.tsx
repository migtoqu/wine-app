import NextLink from "next/link";
import { Container } from "@/components/layout/container";
import { buttonStyles, EmptyState } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";

// 404 localizado para slugs inexistentes, con salida al buscador.
export default async function NotFound() {
  const lang = await getLocale();
  const { catalog, notFound } = await getDictionary();

  return (
    <Container className="max-w-xl py-16">
      <EmptyState
        as="h1"
        title={catalog.notFoundWinery.title}
        description={catalog.notFoundWinery.text}
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <NextLink href={localePath(lang, "/buscar")} className={buttonStyles()}>
              {catalog.searchCatalog}
            </NextLink>
            <NextLink href={localePath(lang)} className={buttonStyles({ variant: "secondary" })}>
              {notFound.back}
            </NextLink>
          </div>
        }
      />
    </Container>
  );
}
