import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatDate } from "@/i18n/format";
import type { Fuente } from "@/lib/catalog/types";

type Props = {
  lang: Locale;
  labels: Dictionary["catalog"]["attribution"];
  fuente: Fuente;
  updatedAt: string | null;
};

// "Fuente: Consejo Regulador D.O. Ribera del Duero · actualizado el 7 de noviembre de 2026" (§5.4).
export function Attribution({ lang, labels, fuente, updatedAt }: Props) {
  return (
    <p className="text-sm text-muted">
      {fuente ? (
        <>
          {labels.source}:{" "}
          <a
            href={fuente.url_base}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-1 underline-offset-4 hover:text-fg"
          >
            {fuente.nombre}
          </a>
        </>
      ) : (
        labels.unknownSource
      )}
      {updatedAt && (
        <>
          {" · "}
          <time dateTime={updatedAt}>{labels.updated(formatDate(lang, updatedAt))}</time>
        </>
      )}
    </p>
  );
}
