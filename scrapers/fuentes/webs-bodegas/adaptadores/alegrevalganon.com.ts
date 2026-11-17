import { texto } from "./comun.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Alegre Valgañón (D.O.Ca. Rioja). WordPress + Divi: ficha `/seres-vinos/<vino>/` con el nombre en
 * el h2 (el h1 es la bodega) y la ficha técnica en `.row-tecnica-vino`. Los vinos de «gama» se
 * llaman «Blanco», «Tinto», «Clarete»: se antepone la marca para que no se tomen por un título genérico.
 */
const GENERICO = /^(blanco|tinto|rosado|clarete|garnacha)$/i;

const adaptador: AdaptadorSitio = {
  dominios: ["alegrevalganon.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. h1 = bodega y nombres genéricos; 1 vino con el genérico.",
  rutas: { listados: ["/seres-vinos/"], patronFicha: /\/seres-vinos\/[a-z0-9-]+\/?$/ },
  selectores: { contenido: "#datos-ficha-vino, .row-tecnica-vino", nombre: ".detalle-vino h2", imagen: ".detalle-vino img" },
  evidenciasMin: 1,
  extraerVino: (f) => {
    const n = texto(f, ".detalle-vino h2");
    return GENERICO.test(n) ? { nombre: `Alegre Valgañón ${n}` } : null;
  },
  minimoVinos: 6,
};
export default adaptador;
