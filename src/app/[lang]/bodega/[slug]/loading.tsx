import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui";

// Se ve al instante al pulsar una bodega mientras llega la ficha (ver vino/[slug]/loading.tsx).
export default function Loading() {
  return (
    <Container aria-busy className="flex flex-col gap-10 py-8 sm:py-12">
      <Skeleton className="aspect-[3/1] w-full" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full max-w-prose" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    </Container>
  );
}
