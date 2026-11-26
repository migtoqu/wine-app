import type { Metadata } from "next";
import { Suspense } from "react";
import { FormFallback } from "@/components/auth/auth-shell";
import { Container } from "@/components/layout/container";
import { CavaForm, type CavaVino } from "@/components/personal/cava-form";
import { Card, CardBody } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/server";
import { cavaFormLabels } from "@/lib/personal/cava";
import { getVino } from "@/lib/catalog/queries";

// Alta de un lote. Con ?vino=slug (botón «Añadir a mi cava» de la ficha) queda
// enlazado al vino del catálogo; sin él, nombre y bodega son texto libre.
export async function generateMetadata(): Promise<Metadata> {
  const { cava } = await getDictionary();
  return { title: cava.newTitle };
}

export default async function NuevaCavaPage({ searchParams }: PageProps<"/[lang]/yo/cava/nueva">) {
  const { cava } = await getDictionary();
  return (
    <Container className="max-w-2xl py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{cava.newTitle}</h1>
      <Card className="mt-6">
        <CardBody>
          <Suspense fallback={<FormFallback fields={6} />}>
            <NuevaForm searchParams={searchParams} />
          </Suspense>
        </CardBody>
      </Card>
    </Container>
  );
}

async function NuevaForm({ searchParams }: Pick<PageProps<"/[lang]/yo/cava/nueva">, "searchParams">) {
  const lang = await getLocale();
  const { vino: slug } = await searchParams;
  await requireUser({ next: localePath(lang, "/yo/cava/nueva") });
  const [{ cava }, ficha] = await Promise.all([
    getDictionary(),
    typeof slug === "string" && slug.length <= 200 ? getVino(slug) : null,
  ]);

  const vino: CavaVino | null = ficha
    ? {
        id: ficha.id,
        nombre: ficha.nombre,
        bodega: ficha.bodega.nombre,
        anadas: ficha.anadas.map((a) => ({ id: a.id, anio: a.anio })),
      }
    : null;
  const anada = vino?.anadas[0] ?? null;

  return (
    <CavaForm
      lang={lang}
      labels={cavaFormLabels(cava)}
      vino={vino}
      values={{
        vino_id: vino?.id ?? null,
        anada_id: anada?.id ?? null,
        nombre: vino?.nombre ?? "",
        bodega_nombre: vino?.bodega ?? null,
        anio: anada?.anio ?? null,
        cantidad: 1,
        formato_ml: 750,
        precio_compra: null,
        fecha_compra: null,
        tienda: null,
        ubicacion: null,
        beber_desde: null,
        beber_hasta: null,
        notas: null,
      }}
    />
  );
}
