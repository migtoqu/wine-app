import { grado } from "./comun.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Alicia i Josep Viticultors (D.O.Q. Priorat). La tienda Woo está en catalán; la versión en español
 * de cada vino es `/es/vins/<vino>/` (Divi), con la ficha técnica en `#fitxa-tecnica`. Una ficha por
 * vino (sin añada): la Store API en catalán no se usa para vinos.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["ajv.wine"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Productos Woo en catalán con 0 evidencias; fichas en español en /es/vins/.",
  rutas: { listados: ["/es/vinos/"], patronFicha: /^https:\/\/ajv\.wine\/es\/vins\/[a-z0-9-]+\/?$/ },
  selectores: { contenido: "#fitxa-tecnica, .et_pb_section_2_tb_body", nombre: "h1", imagen: ".et_pb_section_2_tb_body img, .et_pb_image img" },
  evidenciasMin: 2,
  extraerVino: (f) => (f.vino.grado == null && grado(f.texto) != null ? { grado: grado(f.texto) } : null),
  minimoVinos: 5,
};
export default adaptador;
