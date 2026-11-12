import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Bodegas Díez Gómez (D.O. Toro; también un verdejo D.O. Rueda). Tienda a medida con enlaces
 * relativos que el genérico encadenaba (`/productos/jota/productos/americo/…`, cien páginas de menú
 * repetidas). Fichas reales: `/productos/<gama>/<vino>` de las gamas de vino (Américo, Jota); el h1
 * es «Productos» y el nombre va en `.productos_ficha_nombre`. Vermut y destilados fuera.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["bodegasdiezgomez.com"],
  version: 1,
  modo: "completa",
  notas: "Ola D, 2026-11-12. Enlaces relativos encadenados y h1 genérico: 0 vinos con el genérico.",
  rutas: {
    listados: ["/productos/americo", "/productos/jota"],
    patronFicha: /^https:\/\/www\.bodegasdiezgomez\.com\/productos\/(?:americo|jota)\/[a-z0-9_.]+$/,
    excluir: /\/(?:portada|lab|unpueblo|winemixology|contacto|lahistoria|lajota|americo|jota|promociones|recetas|terms\d?|error|precio|productos)$/,
    // «/productos/jota/productos/americo/americo_crianza_2021» → «/productos/americo/americo_crianza_2021».
    canonica: (u) => {
      const m = u.match(/^https?:\/\/www\.bodegasdiezgomez\.com\/(?:productos\/)+(?:[a-z_]+\/)*?((?:americo|jota)\/[a-z0-9_.]+)$/);
      return m ? `https://www.bodegasdiezgomez.com/productos/${m[1]}` : null;
    },
  },
  selectores: {
    contenido: ".productos_ficha_datos",
    nombre: ".productos_ficha_nombre",
    quitar: ".productos_ficha_contador, form",
    imagen: ".productos_izquierda img, .productos_ficha img",
    precio: ".productos_ficha_precio",
  },
  evidenciasMin: 1,
  minimoVinos: 8,
};
export default adaptador;
