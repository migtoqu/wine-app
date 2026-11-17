// Geocodificación de una bodega con Nominatim: municipio (cacheado por municipio) y, si la
// dirección es una calle, la calle. Nunca devuelve un centroide de municipio sin marcarlo como
// precisión 'municipio'. `pedir` hace la petición (con caché y ritmo) y devuelve el JSON en texto.
import {
  consultaCalle, consultaCodigoPostal, consultaMunicipio, limpiarCalle, primerResultado,
  validarCalle, validarCodigoPostal, validarMunicipio, type Geocodificacion,
} from "./nominatim.ts";

export interface BodegaGeo {
  direccion: string | null;
  codigoPostal: string | null;
  municipio: string | null;
  provincia: string | null;
}

export type Pedir = (url: string) => Promise<string>;

export interface ResultadoGeo {
  /** El mejor punto encontrado (calle/portal si lo hay; si no, municipio). */
  mejor: Geocodificacion | null;
  municipio: Geocodificacion | null;
  calle: Geocodificacion | null;
  /** Consultas hechas para esta bodega (para auditoría en datos). */
  consultas: string[];
}

export class Geocodificador {
  private pedir: Pedir;
  private municipios = new Map<string, Promise<Geocodificacion | null>>();

  constructor(pedir: Pedir) {
    this.pedir = pedir;
  }

  private async uno<T>(url: string, consultas: string[], validar: (texto: string) => T): Promise<T> {
    consultas.push(url);
    return validar(await this.pedir(url));
  }

  /** Centro del municipio (una consulta por municipio y provincia en toda la ejecución). */
  private centro(b: BodegaGeo, consultas: string[]): Promise<Geocodificacion | null> {
    if (b.municipio) {
      const clave = `${b.municipio}|${b.provincia ?? ""}`.toLowerCase();
      let p = this.municipios.get(clave);
      if (!p) {
        const url = consultaMunicipio(b.municipio, b.provincia);
        p = this.uno(url, consultas, (t) => validarMunicipio(primerResultado(t), b.municipio!, b.provincia, url));
        this.municipios.set(clave, p);
      } else {
        consultas.push(consultaMunicipio(b.municipio, b.provincia));
      }
      return p;
    }
    if (b.codigoPostal) {
      const url = consultaCodigoPostal(b.codigoPostal);
      return this.uno(url, consultas, (t) => validarCodigoPostal(primerResultado(t), b.codigoPostal!, url));
    }
    return Promise.resolve(null);
  }

  async geocodificar(b: BodegaGeo): Promise<ResultadoGeo> {
    const consultas: string[] = [];
    let municipio = await this.centro(b, consultas);
    // Municipio que Nominatim no reconoce: el CP, si lo hay, da al menos la zona.
    if (!municipio && b.municipio && b.codigoPostal) {
      const url = consultaCodigoPostal(b.codigoPostal);
      municipio = await this.uno(url, consultas, (t) => validarCodigoPostal(primerResultado(t), b.codigoPostal!, url));
    }
    let calle: Geocodificacion | null = null;
    const via = b.municipio ? limpiarCalle(b.direccion, b) : null;
    if (via && b.municipio) {
      const url = consultaCalle(via, b.municipio);
      calle = await this.uno(url, consultas, (t) => validarCalle(primerResultado(t), b.municipio!, municipio?.punto ?? null, url));
    }
    return { mejor: calle ?? municipio, municipio, calle, consultas: consultas.map((c) => c.replace(/^https:\/\/[^/]+/, "")) };
  }
}
