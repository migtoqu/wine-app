// Vinatis (PrestaShop a medida): el listado de cada categoría incrusta `var product_elastic = {…}`
// con los productos de la página (nombre, bodega, D.O., color, añada, uvas, grado, formato,
// precio y stock). Con eso basta: no se piden fichas. Las notas de cata del JSON no se leen.
import type { FichaTienda, ListadoTienda } from "./tipos.ts";

interface ProductoVinatis {
  id?: number;
  name?: string;
  link_rewrite?: string;
  manufacturer_name?: string | null;
  contenance?: number | null;
  abv?: number | null;
  image?: string | null;
  active?: boolean;
  available_for_order?: boolean;
  disponible?: number | null;
  cache_is_pack?: boolean;
  affichage_special_pack?: boolean;
  prices?: { price?: number | null } | null;
  features?: {
    colour?: string;
    type?: string;
    vintage?: string | number;
    all_grapes?: string;
    grape_variety?: string[];
    service_temperature?: string;
    appellation?: string;
    appellation_type?: string;
  } | null;
}

interface ElasticVinatis {
  total?: { value?: number; pagination?: number; page_number?: number };
  products?: ProductoVinatis[];
}

/** Extrae el objeto JSON que sigue a `var product_elastic=` (null si no está). */
export function productoElastic(html: string): ElasticVinatis | null {
  const m = /var\s+product_elastic\s*=\s*/.exec(html);
  if (!m) return null;
  const desde = m.index + m[0].length;
  // Fin del objeto: llaves equilibradas, respetando cadenas.
  let nivel = 0;
  let enCadena = false;
  for (let i = desde; i < html.length; i++) {
    const c = html[i];
    if (enCadena) {
      if (c === "\\") i++;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) {
      try {
        return JSON.parse(html.slice(desde, i + 1)) as ElasticVinatis;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Un formato suelto como primer trozo del nombre («Magnum - Macán 2020 - Vega Sicilia»). */
const SOLO_FORMATO = /^(?:doble\s+)?(?:m[aá]gnum|jeroboam|rehoboam|matusal[eé]n|salmanazar|baltasar|nabucodonosor|imperial|media\s+botella|benjam[ií]n)$/i;

/** «El Espino 2021 - Áster - La Rioja Alta» → vino «El Espino 2021» y el resto como grupo. */
export function partesNombre(nombre: string): { vino: string; resto: string[] } {
  const partes = nombre.split(/\s+-\s+/).map((r) => r.trim()).filter(Boolean);
  if (partes.length > 1 && SOLO_FORMATO.test(partes[0]!)) partes.splice(0, 2, `${partes[0]} ${partes[1]}`);
  const [vino, ...resto] = partes;
  return { vino: vino ?? nombre.trim(), resto };
}

export function fichaVinatis(p: ProductoVinatis, base: string): FichaTienda | null {
  if (!p.id || !p.link_rewrite || !p.name) return null;
  const f = p.features ?? {};
  const { vino, resto } = partesNombre(p.name);
  const bodega = p.manufacturer_name?.trim() || resto[0] || null;
  const anio = Number(f.vintage);
  const pack = p.cache_is_pack || p.affichage_special_pack;
  const precio = p.prices?.price;
  const disponible = p.active !== false && p.available_for_order !== false && (p.disponible ?? 0) > 0;
  const imagen = p.image ? `${base}/${p.image.replace(/-fine_default\//, "-detail_default/")}` : null;
  return {
    url: `${base}/${p.id}-${p.link_rewrite}`,
    // Un pack se marca en el nombre para que la normalización lo descarte.
    nombre: pack ? `Pack ${vino}` : vino,
    sku: String(p.id),
    ean: null,
    precio: typeof precio === "number" && precio > 0 ? precio : null,
    moneda: "EUR",
    disponibilidad: disponible ? "InStock" : "OutOfStock",
    imagen,
    bodega,
    grupo: resto.filter((r) => r !== bodega),
    tipoTexto: [f.type && f.type !== "Vino" ? f.type : null, f.colour].filter(Boolean).join(" ") || null,
    denominacionTexto: f.appellation ? `${f.appellation_type ?? ""} ${f.appellation}`.trim() : null,
    uvasTexto: f.all_grapes ?? (f.grape_variety?.length ? f.grape_variety.join(", ") : null),
    anio: Number.isInteger(anio) && anio >= 1950 && anio <= 2049 ? anio : null,
    formatoMl: p.contenance && p.contenance > 0 ? Math.round(p.contenance * 1000) : null,
    grado: p.abv && p.abv > 0 && p.abv <= 25 ? p.abv : null,
    temperaturaTexto: f.service_temperature ?? null,
    descripcion: "",
  };
}

export function parsearListadoVinatis(html: string, base: string): ListadoTienda {
  const e = productoElastic(html);
  if (!e) throw new Error("Listado de Vinatis sin `product_elastic` (¿cambió la web?)");
  const fichas = (e.products ?? []).map((p) => fichaVinatis(p, base)).filter((f): f is FichaTienda => f !== null);
  const total = e.total?.value ?? null;
  const porPagina = e.total?.pagination ?? null;
  return {
    tarjetas: fichas.map((f) => ({ url: f.url, nombre: f.nombre })),
    fichas,
    maxPagina: total != null && porPagina ? Math.max(1, Math.ceil(total / porPagina)) : null,
    total,
  };
}

/** Página que dice el JSON (para comprobar que `?page=N` paginó de verdad). */
export function paginaVinatis(html: string): number | null {
  return productoElastic(html)?.total?.page_number ?? null;
}
