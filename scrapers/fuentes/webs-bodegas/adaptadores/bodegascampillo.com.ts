import { adaptadorMartinezZabala } from "./familiamartinezzabala.ts";

/** Bodegas Campillo (D.O.Ca. Rioja). Bajo `/es/vino/` cuelgan también enlaces relativos rotos a páginas del sitio. */
export default adaptadorMartinezZabala(
  "bodegascampillo.com",
  "/es/vinos",
  /\/es\/vino\/(?:inicio|nuestra-esencia|vinedos|vinos|enologo|contactar|aviso-legal|politica-[a-z-]+|index\.php)\b/,
  10,
);
