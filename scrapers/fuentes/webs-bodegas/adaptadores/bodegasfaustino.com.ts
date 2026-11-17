import { adaptadorMartinezZabala } from "./familiamartinezzabala.ts";

/** Bodegas Faustino (D.O.Ca. Rioja). `/es/wines/…` y `/es/vinos/…` repiten las mismas fichas (se canonizan). */
export default adaptadorMartinezZabala("bodegasfaustino.com", "/es/nuestros-vinos", /\/es\/vino\/(?:inicio|vinos|aviso-legal)$/, 15);
