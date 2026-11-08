"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui";

// Enlace de solo lectura con botón de copiar. Sin JS se puede seleccionar a mano.
export function CopyField({
  label,
  value,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-2 font-mono text-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          aria-live="polite"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Sin permiso de portapapeles: queda el campo para copiar a mano.
            }
          }}
        >
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
    </div>
  );
}
