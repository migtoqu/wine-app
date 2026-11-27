import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { interpretarConsulta } from "@/lib/personal/cava-busqueda";
import type { ResultadoBusquedaCava, VinoSugerido } from "@/lib/personal/cava";
import { createClient } from "@/lib/supabase/server";

// Buscador general de Mi cava: GET /api/cava/buscar?q=texto libre →
// lo que se ha entendido del texto (añada, formato, cantidad…) y los vinos del
// catálogo que mejor encajan. Solo con sesión; respuesta privada.
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!(await getCurrentUser())) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }

  const consulta = interpretarConsulta(request.nextUrl.searchParams.get("q") ?? "");
  const vacio: ResultadoBusquedaCava = { consulta, vinos: [] };
  if (consulta.palabras.length === 0) return Response.json(vacio, { headers });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buscar_vinos_cava", {
    palabras: consulta.palabras,
    anio: consulta.anio ?? undefined,
    meses: consulta.meses ?? undefined,
    limite: 6,
  });
  if (error) {
    console.error(`buscar_vinos_cava: ${error.message}`);
    return Response.json({ error: "search_failed" }, { status: 502, headers });
  }

  const vinos: VinoSugerido[] = data.map((v) => ({
    id: v.id,
    slug: v.slug,
    nombre: v.nombre,
    tipo: v.tipo,
    crianza: v.crianza,
    bodega_id: v.bodega_id,
    bodega: v.bodega_nombre,
    denominacion: v.denominacion_nombre,
    imagen_url: v.imagen_url,
    precio_desde: v.precio_desde,
    anadas: Array.isArray(v.anadas) ? (v.anadas as VinoSugerido["anadas"]) : [],
  }));
  return Response.json({ consulta, vinos } satisfies ResultadoBusquedaCava, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
