import { extraerVariedades } from "../extraer.ts";
import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Dominio Lubiano (Pesquera de Duero, D.O. Ribera del Duero). En el consejo figura por su razón
 * social, «Velvety Wines», cuya web (velvetywines.com) redirige aquí. Es un WordPress con la
 * plantilla «Laon Wine House»: sus páginas de demostración (shop, wine-list, blog-style-*) siguen
 * publicadas y «Nuestros vinos» está vacía. Los cuatro vinos solo están en las pestañas de la
 * portada (`.vc_tta-panel`, Visual Composer): un vino por pestaña, con su ficha técnica en el
 * `.sc_promo_descr` y la foto como `background-image`. «reemplaza»: el genérico tomaba la portada
 * entera por un único vino con el nombre de la plantilla.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["dominiolubiano.com", "velvetywines.com"],
  version: 1,
  modo: "reemplaza",
  notas: "2026-11-26. Vinos en las pestañas de la portada; plantilla Laon con páginas demo publicadas.",
  rutas: {
    patronFicha: /^https?:\/\/(?:www\.)?dominiolubiano\.com\/?(?:\?.*)?$/,
    excluir: /\/en\//,
  },
  selectores: {
    fichas: ".vc_tta-panel",
    nombre: ".sc_promo_title",
    quitar: ".vc_tta-panel-heading",
    imagen: ".sc_promo_image",
  },
  evidenciasMin: 3,
  extraerVino: (f) => {
    // El subtítulo de cada pestaña («Vino tinto envejecido durante 24 meses en barrica / …») manda
    // sobre la crianza del texto, que en Caminos Blancos dice otra cifra. Erratas de la web:
    // «Edicion» sin tilde y «Uva atempranillo100%».
    const meses = f.texto.match(/envejecido durante (\d{1,2}) meses/i);
    const variedades = f.vino.variedades.length ? f.vino.variedades : extraerVariedades(f.texto.replace(/\batempranillo(\d)/gi, "tempranillo $1"));
    return {
      nombre: f.vino.nombre.replace(/\bEdicion\b/, "Edición"),
      variedades,
      ...(meses ? { barrica_meses: Number(meses[1]) } : {}),
    };
  },
  minimoVinos: 3,
};
export default adaptador;
