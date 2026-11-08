// Emparejamiento de vinos dentro de su bodega (SCOPE §7.2): EAN y nombre
// normalizado. Un nombre muy parecido (mismo tipo y crianza) va a revisión en
// vez de crear un vino casi duplicado. Las supresiones del admin cuentan: un
// vino fusionado es alias del superviviente y uno borrado no se recrea.
import { claveTexto } from "../lib/texto.ts";
import { similitud } from "../lib/trigram.ts";

export const UMBRAL_VINO_PARECIDO = 0.8;

export interface VinoCatalogo {
  id: string;
  bodegaId: string;
  nombre: string;
  tipo: string | null;
  crianza: string | null;
}

export interface SupresionVino {
  supresionId: string;
  motivo: "fusion" | "borrado";
  destinoId: string | null;
  bodegaId: string | null;
  nombre: string;
  eans: string[];
}

export interface SenalesVinoBodega {
  bodegaId: string;
  nombre: string;
  tipo: string | null;
  crianza: string | null;
  ean: string | null;
}

export interface ResultadoVino {
  estado: "vinculado" | "suprimido" | "revision" | "nuevo";
  vinoId: string | null;
  supresionId: string | null;
  motivo: "ean" | "nombre" | "alias" | "parecido" | "ean_otra_bodega" | null;
  candidatos: { id: string; nombre: string; puntuacion: number }[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class EmparejadorVinos {
  private porBodega = new Map<string, VinoCatalogo[]>();
  private porEan = new Map<string, { vinoId: string; bodegaId: string }>();
  private supresiones: SupresionVino[];

  constructor(vinos: VinoCatalogo[], eans: { ean: string; vinoId: string }[] = [], supresiones: SupresionVino[] = []) {
    const bodegaDe = new Map<string, string>();
    for (const v of vinos) {
      this.porBodega.set(v.bodegaId, [...(this.porBodega.get(v.bodegaId) ?? []), v]);
      bodegaDe.set(v.id, v.bodegaId);
    }
    for (const e of eans) {
      const bodegaId = bodegaDe.get(e.vinoId);
      if (bodegaId) this.porEan.set(e.ean, { vinoId: e.vinoId, bodegaId });
    }
    this.supresiones = supresiones;
  }

  /** Recuerda un vino recién creado (para emparejar con él en la misma ejecución). */
  anadir(v: VinoCatalogo) {
    this.porBodega.set(v.bodegaId, [...(this.porBodega.get(v.bodegaId) ?? []), v]);
  }

  anadirEan(ean: string, vinoId: string, bodegaId: string) {
    this.porEan.set(ean, { vinoId, bodegaId });
  }

  emparejar(s: SenalesVinoBodega, opciones: { sinParecidos?: boolean } = {}): ResultadoVino {
    const vacio = { supresionId: null, candidatos: [] };
    if (s.ean) {
      const e = this.porEan.get(s.ean);
      if (e && e.bodegaId === s.bodegaId) return { ...vacio, estado: "vinculado", vinoId: e.vinoId, motivo: "ean" };
      if (e) return { ...vacio, estado: "revision", vinoId: null, motivo: "ean_otra_bodega", candidatos: [{ id: e.vinoId, nombre: "", puntuacion: 1 }] };
      const sup = this.supresiones.find((x) => x.eans.includes(s.ean!));
      if (sup) return this.resolverSupresion(sup);
    }

    const clave = claveTexto(s.nombre);
    const vinos = this.porBodega.get(s.bodegaId) ?? [];
    const exacto = vinos.find((v) => claveTexto(v.nombre) === clave);
    if (exacto) return { ...vacio, estado: "vinculado", vinoId: exacto.id, motivo: "nombre" };

    const sup = this.supresiones.find((x) => x.bodegaId === s.bodegaId && claveTexto(x.nombre) === clave);
    if (sup) return this.resolverSupresion(sup);

    if (!opciones.sinParecidos) {
      const parecidos = vinos
        .map((v) => ({ id: v.id, nombre: v.nombre, puntuacion: r3(similitud(clave, claveTexto(v.nombre))), v }))
        .filter((c) => c.puntuacion >= UMBRAL_VINO_PARECIDO && c.v.tipo === s.tipo && c.v.crianza === s.crianza)
        .sort((a, b) => b.puntuacion - a.puntuacion)
        .slice(0, 3)
        .map(({ id, nombre, puntuacion }) => ({ id, nombre, puntuacion }));
      if (parecidos.length > 0) {
        return { estado: "revision", vinoId: null, supresionId: null, motivo: "parecido", candidatos: parecidos };
      }
    }
    return { ...vacio, estado: "nuevo", vinoId: null, motivo: null };
  }

  private resolverSupresion(sup: SupresionVino): ResultadoVino {
    if (sup.motivo === "fusion" && sup.destinoId) {
      return { estado: "vinculado", vinoId: sup.destinoId, supresionId: null, motivo: "alias", candidatos: [] };
    }
    return { estado: "suprimido", vinoId: null, supresionId: sup.supresionId, motivo: null, candidatos: [] };
  }
}
