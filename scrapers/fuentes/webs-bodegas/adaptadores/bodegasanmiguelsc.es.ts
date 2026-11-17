import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodega San Miguel (Ribera del Duero). `bodegasanmiguelsc.es` redirige a `bodegasanmiguel.es`, una
 * tienda Joomla + HikaShop: ficha `…/product/<id>-<slug>` con la cata en la descripción y el precio
 * por envase (botella, caja de 6, caja de 12) en `.hikashop_variants_table`; la primera fila es la
 * botella. El genérico no llegaba a 2 evidencias (la ficha no da uvas ni grado).
 */
const adaptador: AdaptadorSitio = {
  dominios: ["bodegasanmiguelsc.es", "bodegasanmiguel.es"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. HikaShop; fichas con 1 evidencia (cata). Bag in box fuera.",
  rutas: {
    listados: ["https://bodegasanmiguel.es/index.php/es/tienda-d-2/xcolor"],
    patronFicha: /\/index\.php\/es\/tienda-d-2\/[a-z0-9-]+\/product\/\d+-[a-z0-9-]+$/,
    excluir: /vino-de-mesa|bag-in-box/,
  },
  selectores: {
    contenido: "#hikashop_product_description_main",
    nombre: "#hikashop_product_name_main, .hikashop_product_page h1",
    imagen: ".hikashop_product_main_image img, #hikashop_main_image",
    precio: ".hikashop_variants_table tbody tr:first-child",
    formato: ".hikashop_variants_table tbody tr:first-child",
  },
  evidenciasMin: 1,
  minimoVinos: 8,
};
export default adaptador;
