import type { NextRequest } from "next/server";
import { buscarCatalogo } from "@/lib/catalog/queries";

// Autocompletado del buscador: GET /api/buscar?q=texto → sugerencias de vinos
// y bodegas (como mucho 5 de cada). La consulta SQL está cacheada en el
// servidor y la respuesta en la CDN, porque el catálogo cambia cada semana.
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 2) return Response.json([]);

  try {
    const results = await buscarCatalogo(q, 5);
    return Response.json(results, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "search_failed" }, { status: 502 });
  }
}
