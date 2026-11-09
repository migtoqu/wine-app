import type { Database, Enums } from "@/lib/supabase/database.types";

// Tipos del catálogo para la interfaz. Las funciones RPC de
// supabase/migrations/20261108090000_catalogo_lectura.sql se tipan aquí hasta
// que se regenere database.types.ts (npm run db:types); después la
// intersección de CatalogDatabase sigue siendo válida y puede simplificarse.

export type TipoVino = Enums<"tipo_vino">;
export type CrianzaVino = Enums<"crianza_vino">;
export type TipoDenominacion = Enums<"tipo_denominacion">;
export type ColorUva = Enums<"color_uva">;

export type ListarVinosArgs = {
  q?: string;
  tipos?: TipoVino[];
  crianzas?: CrianzaVino[];
  denominaciones?: string[];
  variedades?: string[];
  anio?: number;
  sin_anada?: boolean;
  bodega?: string;
  orden?: string;
  limite?: number;
  desplazamiento?: number;
  // Precio «desde» (75 cl) en euros.
  precio_min?: number;
  precio_max?: number;
};

export type VinoListItem = {
  id: string;
  slug: string;
  nombre: string;
  tipo: TipoVino;
  crianza: CrianzaVino | null;
  bodega_slug: string;
  bodega_nombre: string;
  denominacion_slug: string | null;
  denominacion_nombre: string | null;
  // Años de las añadas, de más reciente a más antigua; null = sin añada.
  anios: Array<number | null> | null;
  imagen_url: string | null;
  imagen_alt: string | null;
  relevancia: number | null;
  total: number;
  // Oferta visible y disponible más barata en 75 cl (null = sin ofertas).
  precio_desde: number | null;
};

export type ListarBodegasArgs = {
  q?: string;
  denominacion?: string;
  limite?: number;
  desplazamiento?: number;
};

export type BodegaListItem = {
  id: string;
  slug: string;
  nombre: string;
  municipio: string | null;
  provincia: string | null;
  denominacion_nombre: string | null;
  num_vinos: number;
  imagen_url: string | null;
  imagen_alt: string | null;
  relevancia: number | null;
  total: number;
};

export type SearchSuggestion = {
  entidad: "vino" | "bodega";
  id: string;
  slug: string;
  nombre: string;
  subtitulo: string | null;
  tipo_vino: TipoVino | null;
  relevancia: number;
};

export type FilterOption = {
  grupo: "denominacion" | "variedad" | "anio" | "bodega";
  valor: string;
  etiqueta: string;
  num: number;
};

type CatalogFunctions = {
  buscar_catalogo: {
    Args: { q: string; limite?: number };
    Returns: SearchSuggestion[];
  };
  listar_vinos: { Args: ListarVinosArgs; Returns: VinoListItem[] };
  listar_bodegas: { Args: ListarBodegasArgs; Returns: BodegaListItem[] };
  opciones_filtro_vinos: { Args: never; Returns: FilterOption[] };
};

type PublicSchema = Database["public"];

export type CatalogDatabase = Omit<Database, "public"> & {
  public: Omit<PublicSchema, "Functions"> & {
    Functions: PublicSchema["Functions"] & CatalogFunctions;
  };
};

// --- Fichas ---------------------------------------------------------------

export type CatalogImage = {
  url: string;
  alt: string | null;
  atribucion: string | null;
};

export type Fuente = { nombre: string; url_base: string } | null;

export type OrigenDato = Enums<"origen_dato">;

// De dónde sale el valor vigente de un campo (procedencia_campos), para la
// atribución por bloque en las fichas.
export type ProcedenciaCampo = {
  origen: OrigenDato;
  fuente: Fuente;
  url: string | null;
  observado_en: string;
};
export type Procedencias = Record<string, ProcedenciaCampo>;

// Resúmenes propios generados a partir de hechos (es/en), con sus fuentes.
export type Resumen = { campo: string; idioma: "es" | "en"; texto: string; fuentes: NonNullable<Fuente>[] };

export type ServicioBodega = {
  id: string;
  tipo: Enums<"tipo_servicio">;
  titulo: string;
  descripcion: string | null;
  precio_desde: number | null;
  duracion_minutos: number | null;
  idiomas: string[];
  horario: string | null;
  url_reserva: string | null;
};

export type DenominacionRef = { slug: string; nombre: string; tipo: TipoDenominacion };

export type AnadaVariedad = {
  slug: string;
  nombre: string;
  color: ColorUva | null;
  porcentaje: number | null;
};

export type Anada = {
  id: string;
  anio: number | null;
  grado: number | null;
  meses_crianza: number | null;
  notas_cata: string | null;
  maridaje: string | null;
  temp_servicio_min: number | null;
  temp_servicio_max: number | null;
  produccion_botellas: number | null;
  elaboracion: string | null;
  cata_vista: string | null;
  cata_nariz: string | null;
  cata_boca: string | null;
  updated_at: string;
  variedades: AnadaVariedad[];
  imagenes: CatalogImage[];
  procedencia: Procedencias;
  resumenes: Resumen[];
};

export type VinoFicha = {
  id: string;
  slug: string;
  nombre: string;
  tipo: TipoVino;
  crianza: CrianzaVino | null;
  descripcion: string | null;
  elaboracion: string | null;
  updated_at: string;
  procedencia: Procedencias;
  bodega: { slug: string; nombre: string; municipio: string | null; provincia: string | null };
  denominacion: DenominacionRef | null;
  fuente: Fuente;
  imagenes: CatalogImage[];
  // Ordenadas de más reciente a más antigua; "sin añada" al final.
  anadas: Anada[];
};

export type BodegaFicha = {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  municipio: string | null;
  provincia: string | null;
  comunidad: string | null;
  web: string | null;
  telefono: string | null;
  email: string | null;
  redes: unknown;
  anio_fundacion: number | null;
  hectareas: number | null;
  estado: Enums<"estado_bodega">;
  historia: string | null;
  enoturismo_web: string | null;
  enoturismo_email: string | null;
  enoturismo_telefono: string | null;
  servicios: ServicioBodega[];
  procedencia: Procedencias;
  resumenes: Resumen[];
  updated_at: string;
  fuente: Fuente;
  // La principal primero.
  denominaciones: DenominacionRef[];
  imagenes: CatalogImage[];
  vinos: VinoListItem[];
};
