import { useId } from "react";
import type { Dictionary } from "@/i18n/dictionaries/es";
import type { Locale } from "@/i18n/config";
import { formatDate, formatPrice } from "@/i18n/format";
import type { PuntoPrecio } from "@/lib/catalog/types";

// Gráfica del mejor precio entre tiendas (SVG propio, sin librerías ni JS). Accesible: la imagen
// lleva un resumen en texto y los datos completos van en una tabla plegable.

const W = 640;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

type Props = {
  lang: Locale;
  labels: Dictionary["catalog"]["prices"];
  serie: PuntoPrecio[];
  /** Último día de la gráfica (el precio vigente se prolonga hasta aquí). */
  hasta: string;
};

export function PriceChart({ lang, labels, serie, hasta }: Props) {
  const id = useId();
  if (serie.length === 0) return null;

  const t = (fecha: string) => new Date(`${fecha}T00:00:00Z`).getTime();
  const x0 = t(serie[0]!.fecha);
  const x1 = Math.max(t(hasta), t(serie.at(-1)!.fecha), x0 + 86_400_000);
  const precios = serie.map((p) => p.precio);
  const min = Math.min(...precios);
  const max = Math.max(...precios);
  const margen = max === min ? Math.max(1, min * 0.1) : (max - min) * 0.15;
  const y0 = Math.max(0, min - margen);
  const y1 = max + margen;

  const sx = (ms: number) => PAD.left + ((ms - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const sy = (p: number) => PAD.top + (1 - (p - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);

  // Escalones: cada precio se mantiene hasta el siguiente cambio y el último hasta `hasta`.
  let d = "";
  serie.forEach((p, i) => {
    const x = sx(t(p.fecha));
    const y = sy(p.precio);
    d += i === 0 ? `M${x},${y}` : `H${x}V${y}`;
  });
  d += `H${sx(x1)}`;

  const fecha = (f: string) => formatDate(lang, `${f}T12:00:00Z`, { dateStyle: "medium" });
  const resumen = labels.chartSummary(
    formatPrice(lang, min),
    formatPrice(lang, max),
    fecha(serie[0]!.fecha),
    fecha(hasta),
  );
  const ticks = max === min ? [min] : [min, max];

  return (
    <figure className="flex flex-col gap-3">
      <figcaption id={`${id}-t`} className="text-sm font-semibold">
        {labels.chartTitle}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        className="h-auto w-full text-muted"
      >
        <desc id={`${id}-d`}>{resumen}</desc>
        {ticks.map((p) => (
          <g key={p}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(p)}
              y2={sy(p)}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
            <text x={PAD.left - 8} y={sy(p)} dy="0.35em" textAnchor="end" fontSize="13" fill="currentColor">
              {formatPrice(lang, p)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} fontSize="13" fill="currentColor">
          {fecha(serie[0]!.fecha)}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="13" fill="currentColor">
          {fecha(hasta)}
        </text>
        <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
        {serie.map((p) => (
          <circle key={p.fecha} cx={sx(t(p.fecha))} cy={sy(p.precio)} r="3.5" fill="var(--primary)" />
        ))}
      </svg>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-primary">{labels.chartData}</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-1 font-semibold">{labels.date}</th>
              <th scope="col" className="py-1 text-right font-semibold">{labels.bestPrice}</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.fecha} className="border-b border-border last:border-0">
                <td className="py-1">{fecha(p.fecha)}</td>
                <td className="py-1 text-right tabular-nums">{formatPrice(lang, p.precio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
