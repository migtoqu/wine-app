import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Container } from "@/components/layout/container";
import { WineryMap } from "@/components/map/winery-map";
import { EmptyState, Skeleton } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { getMapaBodegas } from "@/lib/catalog/queries";

// Mapa de bodegas (Fase 2): MapLibre + teselas OSM con clustering y «cerca de mí».
// Los puntos salen de la RPC mapa_bodegas (lectura cacheada del catálogo); las ubicaciones
// aproximadas (centro del municipio, de Nominatim) se pintan distintas y se avisan.

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.map.metaTitle };
}

export default async function MapPage() {
  const lang = await getLocale();
  const dict = await getDictionary();
  return (
    <Container className="flex flex-col gap-6 py-8 sm:py-10">
      <h1 className="text-3xl font-semibold sm:text-4xl">{dict.map.title}</h1>
      <Suspense fallback={<Skeleton className="h-[65vh] min-h-[22rem] w-full rounded-card" />}>
        <MapData lang={lang} dict={dict} />
      </Suspense>
    </Container>
  );
}

async function MapData({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  // Sin entradas por petición, Next prerenderizaría la lectura en el build (donde no hay
  // Supabase). connection() la deja para la petición; sigue cacheada con 'use cache'.
  await connection();
  const bodegas = await getMapaBodegas();
  const { intro, ...labels } = dict.map;
  if (bodegas.length === 0) return <EmptyState title={dict.map.empty} />;
  return (
    <>
      <p className="text-muted">{intro(formatNumber(lang, bodegas.length))}</p>
      <WineryMap lang={lang} bodegas={bodegas} labels={labels} />
    </>
  );
}
