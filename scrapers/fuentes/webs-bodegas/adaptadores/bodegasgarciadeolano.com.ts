import { adaptadorFichaEcomm } from "./tienda-fichaecomm.ts";

/** Bodegas García de Olano (D.O.Ca. Rioja). Las páginas `/es/vinos/<gama>` agrupan cajas: fichas en `/es/vino/comprar-…`. */
export default adaptadorFichaEcomm({
  dominio: "bodegasgarciadeolano.com",
  listado: "/es/vinos/todos-los-vinos",
  patronFicha: /\/es\/vino\/comprar-[a-z0-9-]+$/,
  minimoVinos: 8,
  notas: "Ola D, 2026-11-12. h1 «Tienda Online …» y enlaces relativos a <base href>: 0 vinos con el genérico.",
});
