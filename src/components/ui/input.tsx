import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

type InputProps = ComponentProps<"input"> & {
  // La etiqueta es obligatoria por accesibilidad; usa hideLabel si el diseño no la muestra.
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
};

export function Input({
  label,
  hideLabel = false,
  hint,
  error,
  id,
  className,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={cn("text-sm font-medium", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hintId, errorId) || undefined}
        // text-base (16px) evita el zoom automático de iOS al enfocar.
        className={cn(
          "h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-muted",
          "aria-invalid:border-danger disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
