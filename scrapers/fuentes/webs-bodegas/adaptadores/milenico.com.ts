import { grado } from "./comun.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodega y Viñedos Milénico (D.O. Ribera del Duero). La ficha técnica es una tabla
 * (`td.camp` / `td.descrip`) que el genérico no leía: `principal()` cogía otro bloque.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["milenico.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Tabla de ficha técnica fuera del bloque principal; 0 vinos con el genérico.",
  rutas: {
    listados: ["/es/bodega-y-vinedos-milenico/nuestros-vinos"],
    patronFicha: /\/es\/bodega-y-vinedos-milenico(?:-nuestros-vinos|\/nuestros-vinos)\/[a-z0-9-]+$/,
  },
  selectores: { contenido: "table.table, .gpi-contingut .container .row p", nombre: "h1" },
  evidenciasMin: 2,
  extraerVino: (f) => (f.vino.grado == null && grado(f.texto) != null ? { grado: grado(f.texto) } : null),
  minimoVinos: 4,
};
export default adaptador;
