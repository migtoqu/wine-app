import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Estilo para texto largo (páginas legales, ayuda) sin depender de @tailwindcss/typography.
export function Prose({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "max-w-prose text-fg leading-relaxed",
        "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold",
        "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
        "[&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_th]:border-b [&_th]:border-border-strong [&_th]:p-2 [&_th]:text-left [&_td]:border-b [&_td]:border-border [&_td]:p-2 [&_td]:align-top",
        "[&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-sm",
        className,
      )}
      {...props}
    />
  );
}
