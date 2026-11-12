import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Juan José Martínez Yebra (D.O. Bierzo). Fichas `index.php?seccion=vinos&id=N` con el mismo <title>
 * («MARTINEZ YEBRA, S.L.: Vinos») y h1 vacíos en la cabecera: el genérico las fundía en un vino. El
 * nombre (con añada) es el h1 de la ficha; la ficha técnica, `.ficha_vino`.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["bodegamartinezyebra.es"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Mismo título en todas las fichas → 1 vino con el genérico.",
  rutas: { listados: ["/index.php?seccion=tienda"], patronFicha: /\/index\.php\?seccion=vinos&id=\d+$/ },
  selectores: { contenido: ".ficha_vino", nombre: ".sqs-row h1", imagen: ".ficha_vino img" },
  evidenciasMin: 2,
  minimoVinos: 4,
};
export default adaptador;
