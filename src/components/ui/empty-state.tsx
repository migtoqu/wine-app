import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  // Nivel del título según dónde se use (h1 si es el contenido principal de la página).
  as?: "h1" | "h2" | "h3";
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  as: Heading = "h2",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-card border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div aria-hidden className="text-primary [&_svg]:size-10">
          {icon}
        </div>
      )}
      <Heading className="text-2xl font-semibold">{title}</Heading>
      {description && <div className="max-w-prose text-muted">{description}</div>}
      {action}
    </div>
  );
}
