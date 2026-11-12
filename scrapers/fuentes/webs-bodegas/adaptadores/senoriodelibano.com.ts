import { adaptadorFichaEcomm } from "./tienda-fichaecomm.ts";

/** Señorío de Líbano (D.O.Ca. Rioja): tienda en tienda.senoriodelibano.com, fichas `/es/vinos/comprar-…` (cajas y estuches de un mismo vino se juntan). */
export default adaptadorFichaEcomm({
  dominio: "senoriodelibano.com",
  listado: "https://tienda.senoriodelibano.com/es/bodegas/todos-los-vinos",
  patronFicha: /^https:\/\/tienda\.senoriodelibano\.com\/es\/vinos\/comprar-[a-z0-9-]+$/,
  minimoVinos: 5,
  notas: "Ola D, 2026-11-12. Misma tienda que García de Olano; el genérico pedía rutas mal resueltas (404).",
});
