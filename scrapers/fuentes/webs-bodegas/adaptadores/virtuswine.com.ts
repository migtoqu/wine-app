import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodegas Virtus (Aldeyuso, D.O. Ribera del Duero). Tienda WooCommerce con los vinos en
 * `/producto/`, pero el sitio publica decenas de entradas SEO («Descubre el Exquisito Vino de
 * Aldeyuso en Virtus Wine», «{VINO} en {LOCALIDADMADRID}» de Page Generator Pro) que hablan de
 * uvas y crianza y el genérico tomaba por fichas. Con `patronFicha` solo cuentan los productos;
 * fuera visitas, packs, cajas y regalos. Las fichas HTML no se rastrean como fichas propias
 * (`maxFichas: 0`; su título lleva emojis y la D.O.): completan el texto de cada producto de la
 * Store API (`fichaHtmlWoo`), que da el nombre limpio.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["virtuswine.com"],
  version: 1,
  modo: "completa",
  notas: "2026-11-26. Entradas SEO tomadas por vinos; solo /producto/ son fichas.",
  rutas: {
    patronFicha: /\/producto\/[a-z0-9-]+\/?$/,
    maxFichas: 0,
    excluir: /\/producto\/(?:visita|[\w-]*experiencia|panettone|dulce-escapada|pack|caja|otras-referencias)/,
  },
  fichaHtmlWoo: true,
  minimoVinos: 3,
};
export default adaptador;
