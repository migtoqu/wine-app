// Caché en disco de las respuestas de Nominatim (la política de uso pide no repetir consultas).
// En Actions se conserva entre ejecuciones con actions/cache. Entradas de más de `ttlDias` se ignoran.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface Entrada {
  texto: string;
  /** ISO. */
  fecha: string;
}

export class CacheRespuestas {
  private ruta: string | null;
  private ttlMs: number;
  private entradas = new Map<string, Entrada>();
  aciertos = 0;
  private cambios = false;

  constructor(ruta: string | null, ttlDias = 120) {
    this.ruta = ruta;
    this.ttlMs = ttlDias * 86_400_000;
  }

  async cargar(): Promise<void> {
    if (!this.ruta) return;
    try {
      const j = JSON.parse(await readFile(this.ruta, "utf8")) as Record<string, Entrada>;
      const limite = Date.now() - this.ttlMs;
      for (const [k, v] of Object.entries(j)) if (Date.parse(v.fecha) >= limite) this.entradas.set(k, v);
    } catch {
      // Sin caché previa (primera ejecución o fichero ilegible): se empieza de cero.
    }
  }

  get(clave: string): string | null {
    const e = this.entradas.get(clave);
    if (e) this.aciertos++;
    return e?.texto ?? null;
  }

  set(clave: string, texto: string): void {
    this.entradas.set(clave, { texto, fecha: new Date().toISOString() });
    this.cambios = true;
  }

  get tamano(): number {
    return this.entradas.size;
  }

  async guardar(): Promise<void> {
    if (!this.ruta || !this.cambios) return;
    await mkdir(dirname(this.ruta), { recursive: true });
    await writeFile(this.ruta, JSON.stringify(Object.fromEntries(this.entradas)) + "\n");
  }
}
