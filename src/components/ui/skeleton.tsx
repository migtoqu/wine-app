import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Marcador de carga. Decorativo: anuncia la carga en el contenedor con aria-busy, no aquí.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-control bg-surface-2", className)}
      {...props}
    />
  );
}
