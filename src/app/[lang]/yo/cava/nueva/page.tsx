import type { Metadata } from "next";
import { Suspense } from "react";
import { FormFallback } from "@/components/auth/auth-shell";
import { Container } from "@/components/layout/container";
import { CavaForm, type CavaVino } from "@/components/personal/cava-form";
import { Card, CardBody } from "@/components/ui";
import { localePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/server";
import { cavaFormLabels, toCavaVino } from "@/lib/personal/cava";
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
    <Container className="max-w-2xl py-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{cava.newTitle}</h1>
      {/* En el móvil sin tarjeta: el formulario usa todo el ancho. */}
      <Card className="mt-4 border-0 bg-transparent shadow-none sm:mt-6 sm:border sm:bg-surface sm:shadow-card">
        <CardBody className="p-0 sm:p-5">
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
  const [dict, ficha] = await Promise.all([
    getDictionary(),
    typeof slug === "string" && slug.length <= 200 ? getVino(slug) : null,
  ]);

  const vino: CavaVino | null = ficha ? toCavaVino(ficha) : null;
  const anada = vino?.anadas[0] ?? null;

  return (
    <CavaForm
      lang={lang}
      labels={cavaFormLabels(dict)}
      vino={vino}
      values={{
        vino_id: vino?.id ?? null,
        anada_id: anada?.id ?? null,
        bodega_id: vino?.bodega_id ?? null,
        nombre: vino?.nombre ?? "",
        bodega_nombre: vino?.bodega ?? null,
        anio: anada?.anio ?? null,
        cantidad: 1,
        formato_ml: 750,
        precio_compra: null,
        // Hoy en España: casi siempre se apunta al volver de comprar.
        fecha_compra: hoyMadrid(),
        tienda: null,
        ubicacion: null,
        beber_desde: null,
        beber_hasta: null,
        notas: null,
      }}
    />
  );
}

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}
