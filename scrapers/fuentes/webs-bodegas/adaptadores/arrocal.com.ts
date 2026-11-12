import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodegas Arrocal (D.O. Ribera del Duero). Ficha `/es/wine/<slug>/`: el h1 es la marca («ARROCAL»)
 * para todos los vinos; el nombre está en el <title> («Arrocal Selección Especial - Bodegas Arrocal»).
 * La ficha técnica va en `.wine-description .information` (título/valor).
 */
const adaptador: AdaptadorSitio = {
  dominios: ["arrocal.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Todos los vinos con h1 «ARROCAL» se fundían en uno: 0 vinos con el genérico.",
  rutas: { sitemaps: ["/wine-sitemap.xml"], patronFicha: /\/es\/wine\/[a-z0-9-]+\/?$/ },
  selectores: { contenido: ".wine-description", nombre: "title", imagen: ".wine-description img" },
  evidenciasMin: 2,
  minimoVinos: 4,
};
export default adaptador;
