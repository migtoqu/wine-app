import { cn } from "@/lib/cn";

// Crédito de una imagen enlazada (`imagenes.atribucion`). Las de Wikimedia Commons llegan como
// «Autor · Licencia · Wikimedia Commons · https://commons.wikimedia.org/wiki/File:…»: la URL
// final se convierte en enlace a la ficha del archivo (requisito de las licencias CC BY / BY-SA).
export function ImageCredit({ text, label, className }: { text: string | null | undefined; label: string; className?: string }) {
  if (!text) return null;
  const parts = text.split(" · ").map((p) => p.trim()).filter(Boolean);
  const last = parts.at(-1);
  const url = last && /^https:\/\/[^\s]+$/.test(last) ? last : null;
  const shown = url ? parts.slice(0, -1) : parts;
  return (
    <p className={cn("text-xs text-muted", className)}>
      <span className="sr-only">{label}: </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-1 underline-offset-2 hover:decoration-2"
        >
          {shown.join(" · ")}
        </a>
      ) : (
        shown.join(" · ")
      )}
    </p>
  );
}
