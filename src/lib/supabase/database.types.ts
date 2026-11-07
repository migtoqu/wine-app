export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      anada_variedades: {
        Row: {
          anada_id: string
          created_at: string
          porcentaje: number | null
          variedad_id: string
        }
        Insert: {
          anada_id: string
          created_at?: string
          porcentaje?: number | null
          variedad_id: string
        }
        Update: {
          anada_id?: string
          created_at?: string
          porcentaje?: number | null
          variedad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anada_variedades_anada_id_fkey"
            columns: ["anada_id"]
            isOneToOne: false
            referencedRelation: "anadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anada_variedades_variedad_id_fkey"
            columns: ["variedad_id"]
            isOneToOne: false
            referencedRelation: "variedades_uva"
            referencedColumns: ["id"]
          },
        ]
      }
      anadas: {
        Row: {
          anio: number | null
          created_at: string
          grado: number | null
          id: string
          maridaje: string | null
          meses_crianza: number | null
          notas_cata: string | null
          produccion_botellas: number | null
          temp_servicio_max: number | null
          temp_servicio_min: number | null
          updated_at: string
          vino_id: string
        }
        Insert: {
          anio?: number | null
          created_at?: string
          grado?: number | null
          id?: string
          maridaje?: string | null
          meses_crianza?: number | null
          notas_cata?: string | null
          produccion_botellas?: number | null
          temp_servicio_max?: number | null
          temp_servicio_min?: number | null
          updated_at?: string
          vino_id: string
        }
        Update: {
          anio?: number | null
          created_at?: string
          grado?: number | null
          id?: string
          maridaje?: string | null
          meses_crianza?: number | null
          notas_cata?: string | null
          produccion_botellas?: number | null
          temp_servicio_max?: number | null
          temp_servicio_min?: number | null
          updated_at?: string
          vino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anadas_vino_id_fkey"
            columns: ["vino_id"]
            isOneToOne: false
            referencedRelation: "vinos"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_denominaciones: {
        Row: {
          bodega_id: string
          created_at: string
          denominacion_id: string
          principal: boolean
        }
        Insert: {
          bodega_id: string
          created_at?: string
          denominacion_id: string
          principal?: boolean
        }
        Update: {
          bodega_id?: string
          created_at?: string
          denominacion_id?: string
          principal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bodega_denominaciones_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "bodegas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_denominaciones_denominacion_id_fkey"
            columns: ["denominacion_id"]
            isOneToOne: false
            referencedRelation: "denominaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      bodegas: {
        Row: {
          anio_fundacion: number | null
          codigo_postal: string | null
          comunidad: string | null
          created_at: string
          descripcion: string | null
          direccion: string | null
          email: string | null
          estado: Database["public"]["Enums"]["estado_bodega"]
          fuente_id: string | null
          hectareas: number | null
          id: string
          municipio: string | null
          nombre: string
          provincia: string | null
          redes: Json
          slug: string
          telefono: string | null
          ubicacion: unknown
          updated_at: string
          web: string | null
        }
        Insert: {
          anio_fundacion?: number | null
          codigo_postal?: string | null
          comunidad?: string | null
          created_at?: string
          descripcion?: string | null
          direccion?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["estado_bodega"]
          fuente_id?: string | null
          hectareas?: number | null
          id?: string
          municipio?: string | null
          nombre: string
          provincia?: string | null
          redes?: Json
          slug: string
          telefono?: string | null
          ubicacion?: unknown
          updated_at?: string
          web?: string | null
        }
        Update: {
          anio_fundacion?: number | null
          codigo_postal?: string | null
          comunidad?: string | null
          created_at?: string
          descripcion?: string | null
          direccion?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["estado_bodega"]
          fuente_id?: string | null
          hectareas?: number | null
          id?: string
          municipio?: string | null
          nombre?: string
          provincia?: string | null
          redes?: Json
          slug?: string
          telefono?: string | null
          ubicacion?: unknown
          updated_at?: string
          web?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodegas_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobaciones_enlace: {
        Row: {
          created_at: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fallos_consecutivos: number
          id: string
          oculto: boolean
          ultima_comprobacion: string | null
          ultimo_error: string | null
          ultimo_estado_http: number | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fallos_consecutivos?: number
          id?: string
          oculto?: boolean
          ultima_comprobacion?: string | null
          ultimo_error?: string | null
          ultimo_estado_http?: number | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          entidad_id?: string
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"]
          fallos_consecutivos?: number
          id?: string
          oculto?: boolean
          ultima_comprobacion?: string | null
          ultimo_error?: string | null
          ultimo_estado_http?: number | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      denominaciones: {
        Row: {
          comunidad: string | null
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          slug: string
          tipo: Database["public"]["Enums"]["tipo_denominacion"]
          updated_at: string
          web: string | null
        }
        Insert: {
          comunidad?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          slug: string
          tipo: Database["public"]["Enums"]["tipo_denominacion"]
          updated_at?: string
          web?: string | null
        }
        Update: {
          comunidad?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          slug?: string
          tipo?: Database["public"]["Enums"]["tipo_denominacion"]
          updated_at?: string
          web?: string | null
        }
        Relationships: []
      }
      ejecuciones_scraper: {
        Row: {
          actualizados: number
          errores: number
          estado: Database["public"]["Enums"]["estado_ejecucion"]
          fin: string | null
          fuente_id: string
          id: string
          inicio: string
          log: string | null
          nuevos: number
          run_url: string | null
        }
        Insert: {
          actualizados?: number
          errores?: number
          estado?: Database["public"]["Enums"]["estado_ejecucion"]
          fin?: string | null
          fuente_id: string
          id?: string
          inicio?: string
          log?: string | null
          nuevos?: number
          run_url?: string | null
        }
        Update: {
          actualizados?: number
          errores?: number
          estado?: Database["public"]["Enums"]["estado_ejecucion"]
          fin?: string | null
          fuente_id?: string
          id?: string
          inicio?: string
          log?: string | null
          nuevos?: number
          run_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ejecuciones_scraper_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
      fuentes: {
        Row: {
          activa: boolean
          created_at: string
          frecuencia: string
          id: string
          nombre: string
          notas_robots: string | null
          slug: string
          tipo: Database["public"]["Enums"]["tipo_fuente"]
          updated_at: string
          url_base: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          frecuencia?: string
          id?: string
          nombre: string
          notas_robots?: string | null
          slug: string
          tipo: Database["public"]["Enums"]["tipo_fuente"]
          updated_at?: string
          url_base: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          frecuencia?: string
          id?: string
          nombre?: string
          notas_robots?: string | null
          slug?: string
          tipo?: Database["public"]["Enums"]["tipo_fuente"]
          updated_at?: string
          url_base?: string
        }
        Relationships: []
      }
      imagenes: {
        Row: {
          alt: string | null
          anada_id: string | null
          atribucion: string | null
          bodega_id: string | null
          created_at: string
          estado_enlace: Database["public"]["Enums"]["estado_enlace"]
          fuente_id: string | null
          id: string
          orden: number
          principal: boolean
          servicio_id: string | null
          tipo: Database["public"]["Enums"]["tipo_imagen"]
          updated_at: string
          url: string
          vino_id: string | null
        }
        Insert: {
          alt?: string | null
          anada_id?: string | null
          atribucion?: string | null
          bodega_id?: string | null
          created_at?: string
          estado_enlace?: Database["public"]["Enums"]["estado_enlace"]
          fuente_id?: string | null
          id?: string
          orden?: number
          principal?: boolean
          servicio_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_imagen"]
          updated_at?: string
          url: string
          vino_id?: string | null
        }
        Update: {
          alt?: string | null
          anada_id?: string | null
          atribucion?: string | null
          bodega_id?: string | null
          created_at?: string
          estado_enlace?: Database["public"]["Enums"]["estado_enlace"]
          fuente_id?: string | null
          id?: string
          orden?: number
          principal?: boolean
          servicio_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_imagen"]
          updated_at?: string
          url?: string
          vino_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imagenes_anada_id_fkey"
            columns: ["anada_id"]
            isOneToOne: false
            referencedRelation: "anadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imagenes_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "bodegas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imagenes_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imagenes_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_bodega"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imagenes_vino_id_fkey"
            columns: ["vino_id"]
            isOneToOne: false
            referencedRelation: "vinos"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          created_at: string
          id: string
          idioma: Database["public"]["Enums"]["idioma"]
          mayor_de_edad_confirmado: boolean
          nombre: string | null
          prefs_email: Json
          rol: Database["public"]["Enums"]["rol_usuario"]
          tema: Database["public"]["Enums"]["tema"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          idioma?: Database["public"]["Enums"]["idioma"]
          mayor_de_edad_confirmado?: boolean
          nombre?: string | null
          prefs_email?: Json
          rol?: Database["public"]["Enums"]["rol_usuario"]
          tema?: Database["public"]["Enums"]["tema"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          idioma?: Database["public"]["Enums"]["idioma"]
          mayor_de_edad_confirmado?: boolean
          nombre?: string | null
          prefs_email?: Json
          rol?: Database["public"]["Enums"]["rol_usuario"]
          tema?: Database["public"]["Enums"]["tema"]
          updated_at?: string
        }
        Relationships: []
      }
      registros_fuente: {
        Row: {
          confianza_emparejamiento: number | null
          created_at: string
          datos: Json
          entidad_id: string | null
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"] | null
          estado_emparejamiento: Database["public"]["Enums"]["estado_emparejamiento"]
          fuente_id: string
          id: string
          id_externo: string
          updated_at: string
          url: string | null
          visto_por_ultima_vez: string
        }
        Insert: {
          confianza_emparejamiento?: number | null
          created_at?: string
          datos: Json
          entidad_id?: string | null
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"] | null
          estado_emparejamiento?: Database["public"]["Enums"]["estado_emparejamiento"]
          fuente_id: string
          id?: string
          id_externo: string
          updated_at?: string
          url?: string | null
          visto_por_ultima_vez?: string
        }
        Update: {
          confianza_emparejamiento?: number | null
          created_at?: string
          datos?: Json
          entidad_id?: string | null
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"] | null
          estado_emparejamiento?: Database["public"]["Enums"]["estado_emparejamiento"]
          fuente_id?: string
          id?: string
          id_externo?: string
          updated_at?: string
          url?: string | null
          visto_por_ultima_vez?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_fuente_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios_bodega: {
        Row: {
          activo: boolean
          bodega_id: string
          created_at: string
          descripcion: string | null
          duracion_minutos: number | null
          horario: string | null
          id: string
          idiomas: string[]
          precio_desde: number | null
          tipo: Database["public"]["Enums"]["tipo_servicio"]
          titulo: string
          updated_at: string
          url_reserva: string | null
        }
        Insert: {
          activo?: boolean
          bodega_id: string
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number | null
          horario?: string | null
          id?: string
          idiomas?: string[]
          precio_desde?: number | null
          tipo: Database["public"]["Enums"]["tipo_servicio"]
          titulo: string
          updated_at?: string
          url_reserva?: string | null
        }
        Update: {
          activo?: boolean
          bodega_id?: string
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number | null
          horario?: string | null
          id?: string
          idiomas?: string[]
          precio_desde?: number | null
          tipo?: Database["public"]["Enums"]["tipo_servicio"]
          titulo?: string
          updated_at?: string
          url_reserva?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicios_bodega_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "bodegas"
            referencedColumns: ["id"]
          },
        ]
      }
      variedades_uva: {
        Row: {
          color: Database["public"]["Enums"]["color_uva"] | null
          created_at: string
          id: string
          nombre: string
          sinonimos: string[]
          slug: string
          updated_at: string
        }
        Insert: {
          color?: Database["public"]["Enums"]["color_uva"] | null
          created_at?: string
          id?: string
          nombre: string
          sinonimos?: string[]
          slug: string
          updated_at?: string
        }
        Update: {
          color?: Database["public"]["Enums"]["color_uva"] | null
          created_at?: string
          id?: string
          nombre?: string
          sinonimos?: string[]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      vinos: {
        Row: {
          bodega_id: string
          created_at: string
          crianza: Database["public"]["Enums"]["crianza_vino"] | null
          denominacion_id: string | null
          descripcion: string | null
          fuente_id: string | null
          id: string
          nombre: string
          slug: string
          tipo: Database["public"]["Enums"]["tipo_vino"]
          updated_at: string
        }
        Insert: {
          bodega_id: string
          created_at?: string
          crianza?: Database["public"]["Enums"]["crianza_vino"] | null
          denominacion_id?: string | null
          descripcion?: string | null
          fuente_id?: string | null
          id?: string
          nombre: string
          slug: string
          tipo: Database["public"]["Enums"]["tipo_vino"]
          updated_at?: string
        }
        Update: {
          bodega_id?: string
          created_at?: string
          crianza?: Database["public"]["Enums"]["crianza_vino"] | null
          denominacion_id?: string | null
          descripcion?: string | null
          fuente_id?: string | null
          id?: string
          nombre?: string
          slug?: string
          tipo?: Database["public"]["Enums"]["tipo_vino"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinos_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "bodegas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinos_denominacion_id_fkey"
            columns: ["denominacion_id"]
            isOneToOne: false
            referencedRelation: "denominaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinos_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      f_unaccent: { Args: { "": string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      color_uva: "tinta" | "blanca" | "rosada"
      crianza_vino:
        | "joven"
        | "roble"
        | "crianza"
        | "reserva"
        | "gran_reserva"
        | "otra"
      entidad_catalogo:
        | "denominacion"
        | "variedad_uva"
        | "bodega"
        | "servicio_bodega"
        | "vino"
        | "anada"
        | "imagen"
      estado_bodega: "activa" | "cerrada"
      estado_ejecucion: "en_curso" | "ok" | "parcial" | "error"
      estado_emparejamiento:
        | "pendiente"
        | "emparejado"
        | "revision"
        | "descartado"
      estado_enlace: "sin_comprobar" | "ok" | "fallando" | "oculto"
      idioma: "es" | "en"
      rol_usuario: "user" | "admin"
      tema: "claro" | "oscuro" | "sistema"
      tipo_denominacion: "doca" | "do" | "do_pago" | "vc" | "igp"
      tipo_fuente: "tienda" | "bodega" | "consejo_regulador" | "guia" | "otra"
      tipo_imagen: "botella" | "etiqueta" | "bodega" | "vinedo" | "otra"
      tipo_servicio:
        | "cata"
        | "visita"
        | "restaurante"
        | "alojamiento"
        | "evento"
        | "tienda"
        | "otra"
      tipo_vino:
        | "tinto"
        | "blanco"
        | "rosado"
        | "espumoso"
        | "generoso"
        | "dulce"
        | "naranja"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      color_uva: ["tinta", "blanca", "rosada"],
      crianza_vino: [
        "joven",
        "roble",
        "crianza",
        "reserva",
        "gran_reserva",
        "otra",
      ],
      entidad_catalogo: [
        "denominacion",
        "variedad_uva",
        "bodega",
        "servicio_bodega",
        "vino",
        "anada",
        "imagen",
      ],
      estado_bodega: ["activa", "cerrada"],
      estado_ejecucion: ["en_curso", "ok", "parcial", "error"],
      estado_emparejamiento: [
        "pendiente",
        "emparejado",
        "revision",
        "descartado",
      ],
      estado_enlace: ["sin_comprobar", "ok", "fallando", "oculto"],
      idioma: ["es", "en"],
      rol_usuario: ["user", "admin"],
      tema: ["claro", "oscuro", "sistema"],
      tipo_denominacion: ["doca", "do", "do_pago", "vc", "igp"],
      tipo_fuente: ["tienda", "bodega", "consejo_regulador", "guia", "otra"],
      tipo_imagen: ["botella", "etiqueta", "bodega", "vinedo", "otra"],
      tipo_servicio: [
        "cata",
        "visita",
        "restaurante",
        "alojamiento",
        "evento",
        "tienda",
        "otra",
      ],
      tipo_vino: [
        "tinto",
        "blanco",
        "rosado",
        "espumoso",
        "generoso",
        "dulce",
        "naranja",
      ],
    },
  },
} as const
