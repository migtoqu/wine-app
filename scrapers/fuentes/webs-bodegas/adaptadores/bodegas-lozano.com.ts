import { grado } from "./comun.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodegas Lozano (La Mancha y Rioja). La Store API de Woo da el nombre y el precio, pero la
 * descripción está vacía: tipo, grado, temperatura y cata están en el HTML de la ficha
 * (`/producto/<slug>/`). Se lee la ficha y se suma al producto.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["bodegas-lozano.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Woo con descripción vacía: 0 vinos con el genérico.",
  rutas: { patronFicha: /\/producto\/[a-z0-9-]+\/?$/ },
  selectores: { quitar: ".related, .upsells, .woocommerce-tabs .reviews_tab, #reviews" },
  fichaHtmlWoo: true,
  evidenciasMin: 1,
  extraerVino: (f) => (f.vino.grado == null && grado(f.texto) != null ? { grado: grado(f.texto) } : null),
  minimoVinos: 8,
};
export default adaptador;
