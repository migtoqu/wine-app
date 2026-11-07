import { cn } from "@/lib/cn";

// Copa de vino estilizada; misma forma que el icono de la PWA (src/app/icon.svg).
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)} fill="none">
      <path
        d="M9 4h14c.6 4.6.2 8.4-1.6 10.8A7.4 7.4 0 0 1 17.2 17.6V25h4.3v2.5h-11V25h4.3v-7.4a7.4 7.4 0 0 1-4.2-2.8C8.8 12.4 8.4 8.6 9 4Z"
        fill="currentColor"
      />
      <path d="M10.2 9.5h11.6c-.2 2-.8 3.6-1.7 4.6-1 1.2-2.4 1.9-4.1 1.9s-3.1-.7-4.1-1.9c-.9-1-1.5-2.6-1.7-4.6Z" fill="var(--surface)" opacity="0.28" />
    </svg>
  );
}
