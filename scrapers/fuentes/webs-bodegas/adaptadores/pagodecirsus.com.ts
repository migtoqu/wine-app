import { limpiarEspacios } from "../../../lib/texto.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Pago de Cirsus (Vino de Pago, Navarra). La tienda (`/es/<id>_<slug>.html`) vende también vinos de
 * otras bodegas del grupo (Zifar, Irache) y experiencias: la dueña de cada vino es la tercera miga
 * («Inicio › Catálogo › Pago de Cirsus › Vidure»); los de otra bodega van a revisión. El h1 es
 * «Tienda online»: el nombre está en `.product-title`.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["pagodecirsus.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. h1 genérico; tienda con vinos de varias bodegas del grupo.",
  rutas: { listados: ["/es/tienda.html"], patronFicha: /\/es\/\d+_[a-z0-9-]+\.html$/, excluir: /experiencia|visita|pack|regala|cata-/ },
  selectores: {
    contenido: "#file.product-sheet .txt-file",
    nombre: "#file .product-title",
    imagen: "#file img.pic0",
  },
  evidenciasMin: 2,
  extraerVino: (f) => {
    const migas = f.$(".breadcum li").toArray().map((e) => limpiarEspacios(f.$(e).text()));
    return { bodega: migas.length >= 4 ? migas[2]! : null };
  },
  minimoVinos: 5,
};
export default adaptador;
