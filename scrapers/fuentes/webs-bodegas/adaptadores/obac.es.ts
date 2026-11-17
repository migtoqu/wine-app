import type { AdaptadorSitio } from "./tipos.ts";

/** Clos de l'Obac (D.O.Q. Priorat). Versión en español `/es_ES/vino/<slug>`; fichas cortas (1 evidencia). */
const adaptador: AdaptadorSitio = {
  dominios: ["obac.es"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Fichas en prosa con 1 marcador; el genérico pedía 2.",
  rutas: { listados: ["/es_ES/vinos"], patronFicha: /\/es_ES\/vino\/[a-z0-9-]+$/ },
  selectores: { contenido: ".page-fiche-vin", nombre: ".page-fiche-vin h1, h1", imagen: ".page-fiche-vin img" },
  evidenciasMin: 1,
  minimoVinos: 3,
};
export default adaptador;
