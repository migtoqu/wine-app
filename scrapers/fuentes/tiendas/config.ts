// Tiendas dadas de alta (auditadas el 2026-11-10; ver docs/SOURCES.md §4.6).
// Descartadas en el audit: Vila Viniteca (aviso legal prohíbe extraer datos), Mariskal (no vende
// vino) y Coalla Gourmet (robots.txt veta por nombre a Scrapy y a bots de IA).
import type { ConfigTienda } from "./tipos.ts";

/** ≥ 10 s entre peticiones: Vinopremier nos bloqueó la IP pidiendo cada 3–7 s. */
const PAUSA = { minMs: 10_000, maxMs: 14_000 };

export const VINATIS: ConfigTienda = {
  slug: "vinatis",
  nombre: "Vinatis",
  base: "https://www.vinatis.es",
  plataforma: "vinatis",
  // Vinatis solo tiene categoría propia para estas D.O. del foco (sitemap de categorías, 2026-11-10).
  categorias: [
    { denominacion: "ribera-del-duero", nombre: "Ribera del Duero", ruta: "/comprar-vino-ribera-del-duero" },
    { denominacion: "rioja", nombre: "Rioja", ruta: "/comprar-vino-rioja" },
    { denominacion: "bierzo", nombre: "Bierzo", ruta: "/comprar-vino-denominacion-bierzo" },
  ],
  paramPagina: "page",
  // Solo listados (35 productos por página con todos los datos): ~10 peticiones hoy.
  maxPeticiones: 60,
  maxPaginas: 10,
  pausaMs: PAUSA,
};

export const VINOREA: ConfigTienda = {
  slug: "vinorea",
  nombre: "Vinorea",
  base: "https://www.vinorea.com",
  plataforma: "prestashop",
  // PrestaShop 8 (tema Hummingbird) desde ~2026-11-11: categorías `/do/<d.o.>/` (antes
  // `/vino/espana/<d.o.>/`, que ahora redirige con 301). Son las D.O. del foco que enlaza su menú.
  categorias: [
    { denominacion: "ribera-del-duero", nombre: "Ribera del Duero", ruta: "/do/ribera-del-duero/" },
    { denominacion: "rioja", nombre: "Rioja", ruta: "/do/rioja/" },
    { denominacion: "rueda", nombre: "Rueda", ruta: "/do/rueda/" },
    { denominacion: "bierzo", nombre: "Bierzo", ruta: "/do/bierzo/" },
  ],
  // `?page=N`, 36 por página. La bodega y la D.O. salen de la ficha técnica (`dl.vnr-sheet`).
  paramPagina: "page",
  // ~200 fichas + ~10 listados hoy.
  maxPeticiones: 700,
  maxPaginas: 30,
  pausaMs: PAUSA,
};

export const TIENDAS: ConfigTienda[] = [VINATIS, VINOREA];
