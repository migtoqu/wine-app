import type { AdaptadorSitio } from "./tipos.ts";

/**
 * Señorío de Líbano (D.O.Ca. Rioja). Tienda en tienda.senoriodelibano.com, rehecha en noviembre de
 * 2026 (Next.js renderizado en servidor): una ficha por vino en `/<vino>` con h1, ficha técnica
 * («Graduación: 14,5 % vol. Crianza: …») y JSON-LD `Product`/`Offer`. El listado es la portada de
 * la tienda; las páginas de servicio (envíos, carrito…) cuelgan de la misma raíz y no son fichas.
 * v1 (tienda a medida «fichaecomm», como García de Olano) dejó de valer con el cambio.
 */
const adaptador: AdaptadorSitio = {
  dominios: ["senoriodelibano.com"],
  version: 2,
  modo: "completa",
  notas: "Ola D, 2026-11-16 (v2 tras el rediseño de la tienda). Fichas en la raíz del subdominio.",
  rutas: {
    listados: ["https://tienda.senoriodelibano.com/es"],
    patronFicha: /^https:\/\/tienda\.senoriodelibano\.com\/[a-z0-9-]+$/,
    excluir: /\/(?:es|en|carrito|condiciones-de-venta|devoluciones|envios|contacto|aviso-legal|privacidad|cookies)$/,
  },
  selectores: { contenido: "main header, main section", nombre: "main h1" },
  evidenciasMin: 1,
  minimoVinos: 4,
};
export default adaptador;
