"use client";

import { useTransition } from "react";
import { adjustCantidad } from "@/lib/personal/cava-actions";
import { cn } from "@/lib/cn";

const btn =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-control border border-border-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-50";

// «Abrir una» (−1) y «+1» sobre un lote. La cantidad mostrada llega del servidor
// tras refresh(); mientras, los botones quedan deshabilitados.
export function CavaCounter({
  lang,
  id,
  cantidad,
  labels,
}: {
  lang: string;
  id: string;
  cantidad: number;
  labels: { open: string; openLabel: string; plusLabel: string; bottles: string };
}) {
  const [pending, start] = useTransition();
  const adjust = (delta: number) => start(async () => void (await adjustCantidad({ lang, id, delta })));

  return (
    <div className={cn("flex items-center gap-2", pending && "opacity-70")} aria-busy={pending}>
      <span className="min-w-20 font-semibold tabular-nums" aria-live="polite">
        {labels.bottles}
      </span>
      {cantidad > 0 && (
        <button type="button" className={btn} disabled={pending} onClick={() => adjust(-1)} aria-label={labels.openLabel}>
          {labels.open}
        </button>
      )}
      <button type="button" className={btn} disabled={pending} onClick={() => adjust(1)} aria-label={labels.plusLabel}>
        +1
      </button>
    </div>
  );
}
