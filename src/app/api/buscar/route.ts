import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { buscarCatalogo } from "@/lib/catalog/queries";

// Autocompletado del buscador: GET /api/buscar?q=texto → sugerencias de vinos
// y bodegas (como mucho 5 de cada). La consulta SQL está cacheada en el
// servidor; la respuesta es privada (solo para usuarios con sesión, como el
// resto del catálogo, y el proxy no cubre /api) y nunca va a la CDN.
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 2) return Response.json([]);

  try {
    const results = await buscarCatalogo(q, 5);
    return Response.json(results, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "search_failed" }, { status: 502 });
  }
}
