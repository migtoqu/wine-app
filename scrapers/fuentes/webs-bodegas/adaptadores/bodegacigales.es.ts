import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodega Cooperativa Cigales (D.O. Cigales). WordPress con Avada (Fusion Builder) y una tienda
 * WooCommerce cuya Store API sale vacía. Las fichas técnicas están en dos páginas de gama
 * (`/gran_torondos_cigales/` y `/torondos_cigales/`), con un vino por columna: el h3 con el nombre y
 * debajo «Variedades», «Viñedo», «Elaboración» y «Consumo»/«Maridaje». El genérico toma cada página
 * por un solo vino sin nombre (h1 «GAMA …»): 0 vinos. Las páginas sueltas («vino para casa», «Viña
 * Torondos», «Skake») solo traen la tabla nutricional y no dan vinos. No necesita navegador.
 * La cooperativa también embotella un verdejo de Rueda («Torondos Verdejo Rueda», «100% verdejo de
 * Rueda»): sin la sigla el genérico no lo ve y le asignaría la D.O. de la bodega (Cigales).
 */
const adaptador: AdaptadorSitio = {
  dominios: ["bodegacigales.es"],
  version: 1,
  modo: "completa",
  notas: "2026-11-27. Un vino por columna Fusion en las páginas de gama; Store API vacía: 0 vinos con el genérico.",
  rutas: {
    sitemaps: ["/wp-sitemap-posts-page-1.xml"],
    patronFicha: /^https:\/\/bodegacigales\.es\/(?:gran_)?torondos_cigales\/?$/,
  },
  selectores: {
    fichas: ".fusion-layout-column:has(.fusion-title h3)",
    nombre: ".fusion-title h3",
  },
  evidenciasMin: 1,
  extraerVino: (f) => {
    const zona = `${f.vino.nombre}\n${f.texto}`.match(/\b(?:verdejo|uva)s?\s+de\s+(Rueda|Cigales)\b|\s(Rueda|Cigales)\s*$/im);
    const d = zona?.[1] ?? zona?.[2];
    return d ? { denominacion: `D.O. ${d}` } : null;
  },
  minimoVinos: 6,
};
export default adaptador;
