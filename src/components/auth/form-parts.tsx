import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Piezas de formulario sin estado, válidas en cliente y servidor.

export function FormAlert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "success";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-control px-3 py-2 text-sm font-medium",
        tone === "danger" ? "bg-danger/10 text-danger" : "bg-success-soft text-success-soft-fg",
      )}
    >
      {children}
    </p>
  );
}

export function Checkbox({
  label,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 size-5 shrink-0 accent-primary"
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// Grupo de casillas o radios con leyenda accesible.
export function Fieldset({
  legend,
  error,
  children,
  className,
}: {
  legend: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {children}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
