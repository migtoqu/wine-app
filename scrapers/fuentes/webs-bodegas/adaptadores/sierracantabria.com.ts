import type { AdaptadorSitio } from "./tipos.ts";

/**
 * sierracantabria.com: web común del grupo Eguren (Sierra Cantabria, Viñedos Sierra Cantabria,
 * Viñedos de Páganos). Cada ficha cuelga de `/bodegas/<bodega>/<vino>/`: el vino va a la bodega de
 * esa ruta; si no es la bodega del sitio, a revisión (nunca todos a una). Las fichas son textos de
 * marca sin ficha técnica: basta el nombre (tipo y crianza salen de él) y la D.O.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["sierracantabria.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Dominio compartido por el grupo; 0 vinos con el genérico (h1 sin espacios y sin ficha técnica).",
  rutas: { listados: ["/vinos/"], patronFicha: /\/bodegas\/[a-z0-9-]+\/[a-z0-9-]+\/?$/ },
  selectores: { contenido: ".elementor-widget-heading, .elementor-widget-text-editor", nombre: "h1", quitar: ".slider-anadas, .wrapper-anadas" },
  evidenciasMin: 0,
  marcas: [
    { patron: /\/bodegas\/vinedos-de-paganos\//, bodega: "Viñedos de Páganos" },
    { patron: /\/bodegas\/vinedos-sierra-cantabria\//, bodega: "Viñedos Sierra Cantabria" },
    { patron: /\/bodegas\/sierra-cantabria\//, bodega: "Bodegas Sierra Cantabria" },
    { patron: /\/bodegas\/teso-la-monja\//, bodega: "Teso La Monja" },
  ],
  // «Gran Reserva», «Reserva», «Crianza» sin color en el nombre: en este grupo son tintos.
  extraerVino: (f) => (f.vino.tipo == null && f.vino.crianza && !/blanco|rosado/i.test(f.vino.nombre) ? { tipo: "tinto" } : null),
  minimoVinos: 1,
};
export default adaptador;
