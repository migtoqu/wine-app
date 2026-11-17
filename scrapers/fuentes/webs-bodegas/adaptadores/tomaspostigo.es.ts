import { campo, grado, texto } from "./comun.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Tomás Postigo (Ribera del Duero; blanco V.T. Castilla y León). Cada añada tiene su página
 * `/anada/<vino>-<año>/` hecha con Elementor + JetTabs: la ficha técnica está en las pestañas
 * (`.jet-tabs__content`) y el genérico solo veía los títulos de las pestañas. El carrusel
 * «otras añadas» se quita para no mezclar años.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["tomaspostigo.es"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Fichas por añada en pestañas JetTabs; 0 vinos con el genérico.",
  rutas: { sitemaps: ["/anada-sitemap.xml"], patronFicha: /\/anada\/[a-z0-9-]+\/?$/ },
  selectores: { contenido: "#botella h2, .jet-tabs__content", nombre: "#botella h2", quitar: ".wrapper-anadas, .jet-tabs__control-wrapper", imagen: "#botella img" },
  evidenciasMin: 2,
  extraerVino: (f) => {
    // «Verdejo 23 F.B.»: añada de dos cifras en el nombre; el vino es el mismo en todas las añadas.
    const t = texto(f, "#botella h2");
    const corto = t.match(/^(.*?)\s+(\d{2})\s+(F\.?\s?B\.?)\s*$/i);
    const g = grado(campo(f.texto, /grado alcoh[oó]lico/));
    return {
      ...(corto ? { nombre: `${corto[1]} F.B.`, anio: 2000 + Number(corto[2]) } : {}),
      ...(g != null ? { grado: g } : {}),
    };
  },
  minimoVinos: 30,
};
export default adaptador;
