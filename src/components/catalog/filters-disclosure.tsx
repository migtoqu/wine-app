"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FilterIcon } from "./icons";

type Props = { label: string; children: ReactNode; className?: string };

// Panel de filtros plegable en móvil; en pantallas grandes siempre visible
// como columna lateral (el botón se oculta).
export function FiltersDisclosure({ label, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control border border-border-strong bg-surface px-4 font-medium hover:bg-surface-2 lg:hidden"
      >
        <FilterIcon className="size-5" />
        {label}
      </button>
      <div id={regionId} className={cn("mt-4 lg:mt-0 lg:block", open ? "block" : "hidden")}>
        {children}
      </div>
    </div>
  );
}
