"use client";

import { useEffect, useRef, useState } from "react";
import type { TipoVino } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";
import { WinePlaceholder, WineryPlaceholder } from "./placeholders";

type Props = {
  src: string | null | undefined;
  alt: string;
  // Qué ilustración mostrar si no hay imagen o no carga.
  kind: "vino" | "bodega";
  tipoVino?: TipoVino | null;
  placeholderLabel: string;
  // Relación de aspecto del hueco (evita saltos de maquetación).
  aspect?: "bottle" | "landscape" | "square";
  fit?: "contain" | "cover";
  priority?: boolean;
  className?: string;
};

const aspects = {
  bottle: "aspect-[3/4]",
  landscape: "aspect-[3/2]",
  square: "aspect-square",
};

// Imagen externa del catálogo: se enlaza la URL original, sin copiarla (§9).
// Por eso <img> nativo y no next/image: el optimizador descargaría y
// guardaría una copia, y además los dominios de las fuentes son arbitrarios.
// Si falta o falla al cargar en el navegador → ilustración por tipo.
export function CatalogImage({
  src,
  alt,
  kind,
  tipoVino = null,
  placeholderLabel,
  aspect = "bottle",
  fit = "contain",
  priority = false,
  className,
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  const failed = !src || failedSrc === src;

  // El error puede ocurrir antes de hidratar (y React no lo ve): se comprueba al montar.
  useEffect(() => {
    const img = ref.current;
    if (src && img?.complete && img.naturalWidth === 0) setFailedSrc(src);
  }, [src]);

  return (
    <div className={cn("relative overflow-hidden rounded-card bg-surface-2", aspects[aspect], className)}>
      {failed ? (
        kind === "vino" ? (
          <WinePlaceholder tipo={tipoVino} label={placeholderLabel} />
        ) : (
          <WineryPlaceholder label={placeholderLabel} />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- imágenes externas enlazadas, ver arriba
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          // Sin Referer: menos bloqueos por hotlinking y no filtramos la URL de la app.
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className={cn(
            "absolute inset-0 h-full w-full",
            fit === "contain" ? "object-contain p-2" : "object-cover",
          )}
        />
      )}
    </div>
  );
}
