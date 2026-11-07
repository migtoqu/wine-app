import NextLink from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Enlace de texto con estilo de la app. Para rutas internas construye el href con localePath().
export function Link({ className, ...props }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink
      className={cn(
        "font-medium text-primary underline decoration-1 underline-offset-4 hover:decoration-2",
        className,
      )}
      {...props}
    />
  );
}
