// Web de las bodegas de Familia Martínez Zabala (Faustino, Campillo): mismo CMS a medida.
import { grado, texto } from "./comun.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Ficha `/es/vino/<slug>`: el h1 es el nombre de la bodega (el genérico descartaba el vino por
 * «Bodegas …»); el nombre va en `.nws h2` y la ficha técnica en `#winedata` (tipo, variedad,
 * barrica, D.O., formato y grado). Los premios citan otras añadas: fuera.
 */
export function adaptadorMartinezZabala(dominio: string, listado: string, excluir: RegExp, minimoVinos: number): AdaptadorSitio {
  return {
    dominios: [dominio],
    version: 2,
    modo: "completa",
    notas: "Ola D, 2026-11-12. h1 = bodega → 0 vinos con el genérico. Revisado a mano con dos fichas.",
    rutas: {
      listados: [listado],
      patronFicha: /^https:\/\/www\.[a-z]+\.com\/es\/vino\/[a-z0-9-]+$/,
      excluir,
      // El listado enlaza `vinos/<vino>` (redirige a `/es/vino/<vino>`), `/es/wines/<vino>` (la misma
      // ficha) y a veces por http: todo a la forma canónica https `/es/vino/<vino>`.
      canonica: (u) => {
        const m = u.match(/^https?:\/\/(?:www\.)?([a-z]+\.com)\/es\/(?:vinos?|wines)\/([a-z0-9-]+)$/);
        return m ? `https://www.${m[1]}/es/vino/${m[2]}` : null;
      },
    },
    selectores: { contenido: ".nws .data", nombre: ".nws h2", quitar: ".awards, .video-container, .newbuywine", imagen: '.nws img[src*="big.portrait"]' },
    evidenciasMin: 1,
    extraerVino: (f) => {
      const g = grado(texto(f, "#winedata .alc"));
      return g == null ? null : { grado: g };
    },
    minimoVinos,
  };
}
