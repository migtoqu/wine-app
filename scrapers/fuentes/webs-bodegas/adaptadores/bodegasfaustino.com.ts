import { adaptadorMartinezZabala } from "./familiamartinezzabala.ts";

/** Bodegas Faustino (D.O.Ca. Rioja). `/es/wines/…` repite las mismas fichas. */
export default adaptadorMartinezZabala("bodegasfaustino.com", "/es/nuestros-vinos", /\/es\/wines\//, 15);
