// Logs a stdout/stderr y copia en memoria para guardarla en ejecuciones_scraper.log.

export type NivelLog = "debug" | "info" | "warn" | "error";

// Tamaño máximo del log que se guarda en la BD (se conserva el final).
const MAX_LOG_GUARDADO = 50_000;

export class Log {
  private lineas: string[] = [];
  private verbose: boolean;

  constructor(opciones: { verbose?: boolean } = {}) {
    this.verbose = opciones.verbose ?? false;
  }

  private escribir(nivel: NivelLog, mensaje: string) {
    const linea = `${new Date().toISOString()} ${nivel.toUpperCase().padEnd(5)} ${mensaje}`;
    if (nivel !== "debug") this.lineas.push(linea);
    if (nivel === "debug" && !this.verbose) return;
    if (nivel === "warn" || nivel === "error") console.error(linea);
    else console.log(linea);
  }

  debug(m: string) {
    this.escribir("debug", m);
  }
  info(m: string) {
    this.escribir("info", m);
  }
  warn(m: string) {
    this.escribir("warn", m);
  }
  error(m: string) {
    this.escribir("error", m);
  }

  /** Texto para la BD: las últimas líneas que quepan en el límite. */
  texto(): string {
    const completo = this.lineas.join("\n");
    if (completo.length <= MAX_LOG_GUARDADO) return completo;
    return "…(recortado)\n" + completo.slice(-MAX_LOG_GUARDADO);
  }
}
