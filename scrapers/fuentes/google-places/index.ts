// Google Places API (New): busca el place_id de cada bodega y guarda SOLO el place_id (lo único
// que los términos dejan conservar indefinidamente) en registros_fuente.datos. Valoraciones,
// horarios, teléfono, web y fotos se piden al mostrarlos (ClientePlaces.detalles), sin guardarlos.
// Sin GOOGLE_PLACES_API_KEY no hace nada. Presupuesto de peticiones por ejecución (--presupuesto).
import { coordenadas, type Coordenadas } from "../../emparejamiento/lugar.ts";
import { sinError } from "../../lib/db.ts";
import type { Contexto } from "../../lib/ejecucion.ts";
import { ClientePlaces, elegirLugar, PresupuestoAgotado } from "./cliente.ts";

export const SLUG_FUENTE = "google-places";
/** Google recomienda refrescar los place_id de más de 12 meses. */
const REFRESCO_DIAS = 365;

interface Bodega {
  id: string;
  nombre: string;
  municipio: string | null;
  provincia: string | null;
  punto: Coordenadas | null;
}

export async function scraperGooglePlaces(ctx: Contexto): Promise<void> {
  const presupuesto = Number(ctx.opciones.presupuesto ?? 100);
  const cliente = ClientePlaces.desdeEntorno(Number.isFinite(presupuesto) && presupuesto > 0 ? presupuesto : 100);
  if (!cliente) {
    ctx.log.warn("GOOGLE_PLACES_API_KEY no está definida: integración con Google Places desactivada (ver docs/SOURCES.md)");
    return;
  }
  if (!ctx.db) {
    ctx.log.warn("google-places no tiene dry-run con datos: necesita las bodegas de la BD");
    return;
  }
  const db = ctx.db;
  const vistos = new Map<string, string>();
  for (let desde = 0; ; desde += 1000) {
    const filas = sinError(
      await db.from("registros_fuente").select("entidad_id, visto_por_ultima_vez").eq("fuente_id", ctx.fuenteId!)
        .eq("estado_emparejamiento", "emparejado").order("id").range(desde, desde + 999),
      "leer registros",
    );
    for (const r of filas) if (r.entidad_id) vistos.set(r.entidad_id, r.visto_por_ultima_vez);
    if (filas.length < 1000) break;
  }
  const limite = Date.now() - REFRESCO_DIAS * 86_400_000;
  const pendientes: Bodega[] = [];
  for (let desde = 0; ; desde += 1000) {
    const filas = sinError(
      await db.from("bodegas").select("id, nombre, municipio, provincia, ubicacion").eq("estado", "activa").order("id").range(desde, desde + 999),
      "leer bodegas",
    );
    for (const b of filas) {
      const visto = vistos.get(b.id);
      if (visto && Date.parse(visto) > limite) continue;
      pendientes.push({ id: b.id, nombre: b.nombre, municipio: b.municipio, provincia: b.provincia, punto: coordenadas(b.ubicacion) });
    }
    if (filas.length < 1000) break;
  }
  ctx.log.info(`${pendientes.length} bodegas sin place_id reciente; presupuesto ${cliente.restantes} peticiones`);

  for (const b of pendientes.slice(0, ctx.limite ?? undefined)) {
    try {
      const texto = [b.nombre, b.municipio, b.provincia].filter(Boolean).join(", ");
      const elegido = elegirLugar(b.nombre, b.punto, await cliente.buscar(texto, b.punto));
      const ahora = new Date().toISOString();
      sinError(
        await db.from("registros_fuente").upsert(
          {
            fuente_id: ctx.fuenteId!, id_externo: `bodega:${b.id}`,
            url: elegido ? `https://www.google.com/maps/place/?q=place_id:${elegido.lugar.id}` : null,
            // Solo place_id y la confianza propia: ni nombre, ni coordenadas, ni nada más de Google.
            datos: { place_id: elegido?.lugar.id ?? null, confianza: elegido?.confianza ?? null },
            hechos: [],
            entidad_tipo: elegido ? "bodega" : null, entidad_id: elegido ? b.id : null,
            confianza_emparejamiento: elegido?.confianza ?? null,
            estado_emparejamiento: elegido ? "emparejado" : "descartado",
            visto_por_ultima_vez: ahora,
          },
          { onConflict: "fuente_id,id_externo" },
        ),
        "guardar registro",
      );
      if (elegido) ctx.contadores.nuevos++;
      else ctx.contadores.descartados++;
    } catch (e) {
      if (e instanceof PresupuestoAgotado) {
        ctx.marcarParcial(e.message, { esperado: true });
        break;
      }
      ctx.contadores.errores++;
      ctx.log.error(`${b.nombre}: ${(e as Error).message}`);
    }
  }
  ctx.log.info(`Google Places: ${cliente.peticiones} peticiones`);
}
