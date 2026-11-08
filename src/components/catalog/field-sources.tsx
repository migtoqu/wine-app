import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { formatDate } from "@/i18n/format";
import { sourcesFor } from "@/lib/catalog/provenance";
import type { Procedencias, Resumen } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";

type Labels = Dictionary["catalog"]["attribution"];
const linkCls = "underline decoration-1 underline-offset-4 hover:text-fg";

// Atribución de un bloque de la ficha: «Fuente: X · actualizado el …», una
// línea por fuente de los campos mostrados (§7.3). Nada si no hay procedencia.
export function FieldSources({
  lang,
  labels,
  procedencia,
  campos,
  conValor,
  className,
}: {
  lang: Locale;
  labels: Labels;
  procedencia: Procedencias;
  campos: string[];
  conValor?: (campo: string) => boolean;
  className?: string;
}) {
  const lineas = sourcesFor(procedencia, campos, conValor);
  if (lineas.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-0.5 text-xs text-muted", className)}>
      {lineas.map((l) => (
        <li key={l.key}>
          {l.kind === "admin" ? (
            labels.editedByTeam
          ) : (
            <>
              {labels.source}:{" "}
              <a href={l.url} target="_blank" rel="noopener noreferrer" className={linkCls}>
                {l.nombre}
              </a>
            </>
          )}
          {" · "}
          <time dateTime={l.updatedAt}>{labels.updated(formatDate(lang, l.updatedAt))}</time>
        </li>
      ))}
    </ul>
  );
}

// Nota bajo un resumen propio: de qué fuentes salen los hechos que resume.
export function SummarySources({ labels, resumen }: { labels: Labels; resumen: Resumen }) {
  if (resumen.fuentes.length === 0) return <p className="text-xs text-muted">{labels.ownSummaryNoSource}</p>;
  return (
    <p className="text-xs text-muted">
      {labels.ownSummary}{" "}
      {resumen.fuentes.map((f, i) => (
        <span key={f.nombre}>
          {i > 0 && ", "}
          <a href={f.url_base} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {f.nombre}
          </a>
        </span>
      ))}
      .
    </p>
  );
}
