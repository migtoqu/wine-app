import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodegas Sinforiano (D.O. Cigales). Fichas Elementor con el h1 de la bodega y la ficha técnica en
 * contenedores sin párrafos («AÑADA», «VARIEDADES», «ALCOHOL» y su valor): nombre del <title>.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["sinforianobodegas.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. h1 = bodega y etiquetas/valores en <div>: 0 vinos con el genérico.",
  rutas: {
    listados: ["/vinos/"],
    patronFicha: /^https:\/\/sinforianobodegas\.com\/(?:vinos\/[a-z0-9-]+\/vino-[a-z0-9-]+|sinfo-[a-z0-9-]+|sinforiano-[a-z0-9-]+|[a-z0-9-]+-(?:crianza|reserva|roble|rose|rosado|blanco|tinto))\/?$/,
  },
  selectores: { contenido: "#lqd-contents-wrap", nombre: "title", quitar: "template, .age-gate" },
  evidenciasMin: 2,
  minimoVinos: 4,
};
export default adaptador;
