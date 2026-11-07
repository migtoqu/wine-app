// Limitador por dominio: una sola petición a la vez por host y una pausa
// aleatoria (jitter) entre el final de una y el inicio de la siguiente.

export interface OpcionesLimitador {
  minMs: number;
  maxMs: number;
  ahora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  aleatorio?: () => number;
}

export const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class LimitadorPorHost {
  private colas = new Map<string, Promise<unknown>>();
  private ultimaPeticion = new Map<string, number>();
  private opciones: Required<OpcionesLimitador>;

  constructor(opciones: OpcionesLimitador) {
    this.opciones = { ahora: Date.now, dormir, aleatorio: Math.random, ...opciones };
  }

  /** Pausa a aplicar entre dos peticiones al mismo host. */
  siguientePausa(): number {
    const { minMs, maxMs, aleatorio } = this.opciones;
    return Math.round(minMs + (maxMs - minMs) * aleatorio());
  }

  /** Ejecuta `tarea` cuando le toque en la cola del host. */
  ejecutar<T>(host: string, tarea: () => Promise<T>): Promise<T> {
    const previa = this.colas.get(host) ?? Promise.resolve();
    const turno = previa
      .catch(() => {})
      .then(async () => {
        const { ahora, dormir } = this.opciones;
        const ultima = this.ultimaPeticion.get(host);
        if (ultima !== undefined) {
          const espera = ultima + this.siguientePausa() - ahora();
          if (espera > 0) await dormir(espera);
        }
        try {
          return await tarea();
        } finally {
          this.ultimaPeticion.set(host, ahora());
        }
      });
    this.colas.set(host, turno);
    return turno;
  }
}
