// CMS a medida de Luis Cañas y Dominio de Cair (misma familia): ficha `/vino/<slug>` con `<base href>`
// a la raíz, nombre en el h1 y la ficha técnica en `#contenido .large-9`, donde las etiquetas
// («Variedad», «Grado alcohólico»…) van en pestañas separadas de sus valores. Las mismas fichas se
// publican también como `ficha-vinos.php?id_vino=N` (fuera, duplicadas).
import { grado, tipoPorUvaPrincipal } from "./comun.ts";
import type { AdaptadorSitio } from "./tipos.ts";

export function adaptadorLuisCanas(dominio: string, minimoVinos: number): AdaptadorSitio {
  return {
    dominios: [dominio],
    version: 1,
    modo: "completa",
    notas: "Ola D, 2026-11-12. El genérico leía el menú de vinos en vez de la ficha: 0 vinos.",
    rutas: { listados: ["/vinos.php?sec=2"], patronFicha: /\/vino\/[a-z0-9-]+$/, excluir: /ficha-vinos\.php/ },
    selectores: { contenido: "#contenido .large-9", nombre: "#contenido h1, h1" },
    evidenciasMin: 2,
    extraerVino: (f) => ({
      grado: f.vino.grado ?? grado(f.texto),
      tipo: f.vino.tipo ?? tipoPorUvaPrincipal(f.vino.variedades),
    }),
    minimoVinos,
  };
}
