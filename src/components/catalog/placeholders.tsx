import type { TipoVino } from "@/lib/catalog/types";
import { cn } from "@/lib/cn";

// Ilustraciones de relleno cuando un vino o una bodega no tiene imagen (o
// falla al cargar, §9). Colores fijos por tipo de vino: son ilustración, no
// texto, así que no dependen del tema.
const WINE_COLORS: Record<TipoVino, { liquid: string; label: string }> = {
  tinto: { liquid: "#6d1630", label: "#f3e3c3" },
  blanco: { liquid: "#e9d38a", label: "#7b1e3a" },
  rosado: { liquid: "#ef9fb0", label: "#6a1832" },
  espumoso: { liquid: "#f1df9c", label: "#1f1a17" },
  generoso: { liquid: "#a8642a", label: "#f3e3c3" },
  dulce: { liquid: "#c98a1e", label: "#3d1a25" },
  naranja: { liquid: "#e08a3c", label: "#3d1a25" },
};

type PlaceholderProps = { label: string; className?: string };

export function WinePlaceholder({
  tipo,
  label,
  className,
}: PlaceholderProps & { tipo: TipoVino | null }) {
  const colors = WINE_COLORS[tipo ?? "tinto"];
  return (
    <svg
      viewBox="0 0 120 160"
      role="img"
      aria-label={label}
      className={cn("h-full w-full bg-surface-2", className)}
    >
      {/* Botella */}
      <path
        d="M52 14h16v26c0 6 14 12 14 30v68a8 8 0 0 1-8 8H46a8 8 0 0 1-8-8V70c0-18 14-24 14-30z"
        fill="#2b2326"
        opacity="0.9"
      />
      {/* Vino visto a través del vidrio */}
      <path d="M42 84h36v52a6 6 0 0 1-6 6H48a6 6 0 0 1-6-6z" fill={colors.liquid} />
      {/* Etiqueta */}
      <rect x="44" y="92" width="32" height="26" rx="2" fill={colors.label} opacity="0.92" />
      <rect x="50" y="100" width="20" height="3" rx="1.5" fill={colors.liquid} />
      <rect x="53" y="107" width="14" height="2" rx="1" fill={colors.liquid} opacity="0.7" />
      {/* Cápsula */}
      <rect x="51" y="10" width="18" height="10" rx="2" fill={colors.liquid} />
      {tipo === "espumoso" && (
        <g fill={colors.liquid} opacity="0.8">
          <circle cx="30" cy="40" r="3" />
          <circle cx="24" cy="56" r="2" />
          <circle cx="92" cy="34" r="2.5" />
          <circle cx="97" cy="52" r="2" />
        </g>
      )}
      {/* Brillo */}
      <path d="M46 74c0-8 4-12 8-15" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function WineryPlaceholder({ label, className }: PlaceholderProps) {
  return (
    <svg
      viewBox="0 0 240 160"
      role="img"
      aria-label={label}
      className={cn("h-full w-full bg-surface-2", className)}
      preserveAspectRatio="xMidYMid slice"
    >
      <circle cx="190" cy="38" r="16" fill="#e9c46a" opacity="0.8" />
      {/* Colinas */}
      <path d="M0 110c40-30 80-34 120-16s80 10 120-14v80H0z" fill="#8a9a5b" opacity="0.55" />
      <path d="M0 128c50-22 100-18 150-4s70 4 90-6v42H0z" fill="#6b7d3e" opacity="0.7" />
      {/* Hileras de viñas */}
      <g stroke="#3f4d22" strokeWidth="2" strokeLinecap="round" opacity="0.6">
        <path d="M20 150l30-22M50 154l34-24M84 156l36-24M122 156l36-22M160 156l34-20" />
      </g>
      {/* Bodega */}
      <g>
        <path d="M70 92l30-20 30 20v26H70z" fill="#c9a27e" />
        <path d="M64 94l36-26 36 26" stroke="#7b1e3a" strokeWidth="5" fill="none" strokeLinejoin="round" />
        <rect x="93" y="98" width="14" height="20" rx="7" fill="#5e410c" />
        <rect x="76" y="98" width="9" height="9" rx="1" fill="#f3e3c3" />
        <rect x="115" y="98" width="9" height="9" rx="1" fill="#f3e3c3" />
      </g>
    </svg>
  );
}
