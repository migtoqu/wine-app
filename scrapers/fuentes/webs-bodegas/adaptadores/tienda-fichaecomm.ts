// Tienda online a medida que comparten varias bodegas de Rioja (García de Olano, Señorío de Líbano):
// `<base href="/es/">`, h1 = «Tienda Online <bodega>», ficha en `.fichaecomm` con nombre en
// `h2.viewWeb`, formato de venta en `h3.viewWeb` y precio en `.price`. Sin JSON-LD.
import { grado, texto } from "./comun.ts";
import type { AdaptadorSitio } from "./tipos.ts";

export function adaptadorFichaEcomm(o: { dominio: string; listado: string; patronFicha: RegExp; minimoVinos: number; notas: string }): AdaptadorSitio {
  return {
    dominios: [o.dominio],
    version: 1,
    modo: "completa",
    notas: o.notas,
    rutas: { listados: [o.listado], patronFicha: o.patronFicha },
    selectores: {
      contenido: ".fichaecomm .texto",
      nombre: ".fichaecomm h2.viewWeb, .fichaecomm h2",
      quitar: ".masinteres, .noview, .viewMovil, .addecomm",
      imagen: ".fichaecomm .imagen img, .fichaecomm img",
      precio: ".fichaecomm .texto .price",
      formato: ".fichaecomm h3.viewWeb, .fichaecomm h3",
    },
    evidenciasMin: 1,
    extraerVino: (f) => {
      const g = grado(texto(f, ".fichaecomm .winechar"));
      return g == null ? null : { grado: g };
    },
    minimoVinos: o.minimoVinos,
  };
}
