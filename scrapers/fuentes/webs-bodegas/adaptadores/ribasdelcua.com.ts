import type { AdaptadorSitio } from "./tipos.ts";

/** Bodegas y Viñedos Arribes-Cúa / Ribas del Cúa (D.O. Bierzo): igual que Lozano, la ficha técnica está en el HTML del producto Woo. */
const adaptador: AdaptadorSitio = {
  dominios: ["ribasdelcua.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Woo con descripción corta; variedad, crianza y cata en el HTML.",
  rutas: { patronFicha: /\/producto\/[a-z0-9-]+\/?$/ },
  selectores: { quitar: ".related, .upsells, #reviews" },
  fichaHtmlWoo: true,
  evidenciasMin: 2,
  minimoVinos: 4,
};
export default adaptador;
