import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui";

// Se ve al instante al pulsar un vino mientras llega la ficha (la primera
// visita a cada slug tras un despliegue la genera el servidor). Es parte del
// App Shell que se precarga con cada <Link>.
export default function Loading() {
  return (
    <Container aria-busy className="flex flex-col gap-12 py-8 sm:py-12">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-10">
        <Skeleton className="mx-auto aspect-[3/4] w-full max-w-64" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
          <Skeleton className="h-24 w-full max-w-prose" />
        </div>
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </Container>
  );
}
