import { Badge, type BadgeTone } from "@/components/ui";
import type { EstadoEjecucion } from "@/lib/admin/enlaces";

const TONO: Record<EstadoEjecucion, BadgeTone> = {
  en_curso: "primary",
  ok: "success",
  parcial: "warning",
  error: "accent",
};

export function EstadoBadge({ estado, labels }: { estado: EstadoEjecucion; labels: Record<EstadoEjecucion, string> }) {
  return <Badge tone={TONO[estado]}>{labels[estado]}</Badge>;
}
