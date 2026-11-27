import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormFallback } from "@/components/auth/auth-shell";
import { Container } from "@/components/layout/container";
import { CavaForm, type CavaVino } from "@/components/personal/cava-form";
import { buttonStyles, Card, CardBody } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/server";
import { cavaFormLabels, toCavaVino } from "@/lib/personal/cava";
import { getVino } from "@/lib/catalog/queries";
import { deleteCavaLote } from "@/lib/personal/cava-actions";
import { getCavaLote } from "@/lib/personal/queries";
import { isUuid } from "@/lib/personal/validation";

// Cache Components exige al menos un parámetro para prerenderizar el shell;
// el formulario depende de la sesión y siempre se genera por petición.
export function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const { cava } = await getDictionary();
  return { title: cava.editTitle };
}

export default async function EditCavaPage({ params }: PageProps<"/[lang]/yo/cava/[id]">) {
  const { cava } = await getDictionary();
  return (
    <Container className="max-w-2xl py-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{cava.editTitle}</h1>
      <Suspense
        fallback={
          <Card className="mt-4 sm:mt-6">
            <CardBody>
              <FormFallback fields={6} />
            </CardBody>
          </Card>
        }
      >
        <EditForm params={params} />
      </Suspense>
    </Container>
  );
}

async function EditForm({ params }: Pick<PageProps<"/[lang]/yo/cava/[id]">, "params">) {
  const lang = await getLocale();
  const { id } = await params;
  await requireUser({ next: localePath(lang, `/yo/cava/${id}`) });
  if (!isUuid(id)) notFound();
  const [dict, lote] = await Promise.all([getDictionary(), getCavaLote(id)]);
  const { cava } = dict;
  if (!lote) notFound();

  const ficha = lote.vino ? await getVino(lote.vino.slug) : null;
  const vino: CavaVino | null = ficha ? toCavaVino(ficha) : null;

  return (
    <>
      {/* En el móvil sin tarjeta: el formulario usa todo el ancho. */}
      <Card className="mt-4 border-0 bg-transparent shadow-none sm:mt-6 sm:border sm:bg-surface sm:shadow-card">
        <CardBody className="p-0 sm:p-5">
          <CavaForm lang={lang} labels={cavaFormLabels(dict)} vino={vino} values={lote} />
        </CardBody>
      </Card>
      <form action={deleteCavaLote} className="mt-6">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="id" value={lote.id} />
        <button type="submit" className={buttonStyles({ variant: "ghost", className: "text-danger" })}>
          {cava.delete}
        </button>
      </form>
    </>
  );
}
