import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Viña Zorzal (D.O. Navarra). Shopify: ficha `/products/<slug>` con JSON-LD `Product` (precio) y una
 * ficha corta (uvas, D.O., añada): 1 evidencia. Mientras no haya extractor Shopify de plataforma
 * (`/products.json`, PR aparte) se lee por HTML.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["vinazorzalwines.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Fichas Shopify con 1 evidencia; el genérico pedía 2.",
  rutas: { listados: ["/collections/todos-los-vinos"], patronFicha: /\/products\/[a-z0-9-]+$/, excluir: /pack|caja|estuche|regalo|tarjeta/ },
  selectores: { contenido: ".product__info-wrapper", nombre: "h1", imagen: ".product__media img" },
  evidenciasMin: 1,
  minimoVinos: 4,
};
export default adaptador;
