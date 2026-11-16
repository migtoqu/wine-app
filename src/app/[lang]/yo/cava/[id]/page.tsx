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
    <Container className="max-w-2xl py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{cava.editTitle}</h1>
      <Suspense
        fallback={
          <Card className="mt-6">
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
  const [{ cava }, lote] = await Promise.all([getDictionary(), getCavaLote(id)]);
  if (!lote) notFound();

  const ficha = lote.vino ? await getVino(lote.vino.slug) : null;
  const vino: CavaVino | null = ficha
    ? {
        id: ficha.id,
        nombre: ficha.nombre,
        bodega: ficha.bodega.nombre,
        anadas: ficha.anadas.map((a) => ({ id: a.id, anio: a.anio })),
      }
    : null;

  return (
    <>
      <Card className="mt-6">
        <CardBody>
          <CavaForm lang={lang} labels={cava} vino={vino} values={lote} />
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
