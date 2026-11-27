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
          cata_boca: string | null
          cata_nariz: string | null
          cata_vista: string | null
          created_at: string
          elaboracion: string | null
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
          enlaces_ocultos: string[] | null
        }
        Insert: {
          anio?: number | null
          cata_boca?: string | null
          cata_nariz?: string | null
          cata_vista?: string | null
          created_at?: string
          elaboracion?: string | null
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
          cata_boca?: string | null
          cata_nariz?: string | null
          cata_vista?: string | null
          created_at?: string
          elaboracion?: string | null
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
          dominio: string | null
          email: string | null
          enoturismo_email: string | null
          enoturismo_telefono: string | null
          enoturismo_web: string | null
          estado: Database["public"]["Enums"]["estado_bodega"]
          fuente_id: string | null
          hectareas: number | null
          historia: string | null
          id: string
          municipio: string | null
          nif: string | null
          nombre: string
          provincia: string | null
          redes: Json
          registro_embotellador: string | null
          slug: string
          telefono: string | null
          ubicacion: unknown
          updated_at: string
          web: string | null
          enlaces_ocultos: string[] | null
        }
        Insert: {
          anio_fundacion?: number | null
          codigo_postal?: string | null
          comunidad?: string | null
          created_at?: string
          descripcion?: string | null
          direccion?: string | null
          dominio?: string | null
          email?: string | null
          enoturismo_email?: string | null
          enoturismo_telefono?: string | null
          enoturismo_web?: string | null
          estado?: Database["public"]["Enums"]["estado_bodega"]
          fuente_id?: string | null
          hectareas?: number | null
          historia?: string | null
          id?: string
          municipio?: string | null
          nif?: string | null
          nombre: string
          provincia?: string | null
          redes?: Json
          registro_embotellador?: string | null
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
          dominio?: string | null
          email?: string | null
          enoturismo_email?: string | null
          enoturismo_telefono?: string | null
          enoturismo_web?: string | null
          estado?: Database["public"]["Enums"]["estado_bodega"]
          fuente_id?: string | null
          hectareas?: number | null
          historia?: string | null
          id?: string
          municipio?: string | null
          nif?: string | null
          nombre?: string
          provincia?: string | null
          redes?: Json
          registro_embotellador?: string | null
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
      cava: {
        Row: {
          anada_id: string | null
          anio: number | null
          beber_desde: number | null
          beber_hasta: number | null
          bodega_id: string | null
          bodega_nombre: string | null
          cantidad: number
          created_at: string
          fecha_compra: string | null
          foto_path: string | null
          formato_ml: number
          id: string
          nombre: string
          notas: string | null
          precio_compra: number | null
          tienda: string | null
          ubicacion: string | null
          updated_at: string
          usuario_id: string
          vino_id: string | null
        }
        Insert: {
          anada_id?: string | null
          anio?: number | null
          beber_desde?: number | null
          beber_hasta?: number | null
          bodega_id?: string | null
          bodega_nombre?: string | null
          cantidad?: number
          created_at?: string
          fecha_compra?: string | null
          foto_path?: string | null
          formato_ml?: number
          id?: string
          nombre: string
          notas?: string | null
          precio_compra?: number | null
          tienda?: string | null
          ubicacion?: string | null
          updated_at?: string
          usuario_id?: string
          vino_id?: string | null
        }
        Update: {
          anada_id?: string | null
          anio?: number | null
          beber_desde?: number | null
          beber_hasta?: number | null
          bodega_id?: string | null
          bodega_nombre?: string | null
          cantidad?: number
          created_at?: string
          fecha_compra?: string | null
          foto_path?: string | null
          formato_ml?: number
          id?: string
          nombre?: string
          notas?: string | null
          precio_compra?: number | null
          tienda?: string | null
          ubicacion?: string | null
          updated_at?: string
          usuario_id?: string
          vino_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cava_anada_id_fkey"
            columns: ["anada_id"]
            isOneToOne: false
            referencedRelation: "anadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cava_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "bodegas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cava_vino_id_fkey"
            columns: ["vino_id"]
            isOneToOne: false
            referencedRelation: "vinos"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_ean: {
        Row: {
          anada_id: string | null
          created_at: string
          ean: string
          formato_ml: number | null
          fuente_id: string | null
          vino_id: string
        }
        Insert: {
          anada_id?: string | null
          created_at?: string
          ean: string
          formato_ml?: number | null
          fuente_id?: string | null
          vino_id: string
        }
        Update: {
          anada_id?: string | null
          created_at?: string
          ean?: string
          formato_ml?: number | null
          fuente_id?: string | null
          vino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "codigos_ean_anada_id_fkey"
            columns: ["anada_id"]
            isOneToOne: false
            referencedRelation: "anadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codigos_ean_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codigos_ean_vino_id_fkey"
            columns: ["vino_id"]
            isOneToOne: false
            referencedRelation: "vinos"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobaciones_enlace: {
        Row: {
          campos: string[]
          created_at: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fallos_consecutivos: number
          id: string
          metodo: string | null
          modo: string
          oculto: boolean
          ultima_comprobacion: string | null
          ultimo_error: string | null
          ultimo_estado_http: number | null
          ultimo_ok: string | null
          ultimo_resultado: string | null
          updated_at: string
          url: string
          url_final: string | null
        }
        Insert: {
          campos?: string[]
          created_at?: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fallos_consecutivos?: number
          id?: string
          metodo?: string | null
          modo?: string
          oculto?: boolean
          ultima_comprobacion?: string | null
          ultimo_error?: string | null
          ultimo_estado_http?: number | null
          ultimo_ok?: string | null
          ultimo_resultado?: string | null
          updated_at?: string
          url: string
          url_final?: string | null
        }
        Update: {
          campos?: string[]
          created_at?: string
          entidad_id?: string
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"]
          fallos_consecutivos?: number
          id?: string
          metodo?: string | null
          modo?: string
          oculto?: boolean
          ultima_comprobacion?: string | null
          ultimo_error?: string | null
          ultimo_estado_http?: number | null
          ultimo_ok?: string | null
          ultimo_resultado?: string | null
          updated_at?: string
          url?: string
          url_final?: string | null
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
      favoritos: {
        Row: {
          bodega_id: string | null
          created_at: string
          id: string
          usuario_id: string
          vino_id: string | null
        }
        Insert: {
          bodega_id?: string | null
          created_at?: string
          id?: string
          usuario_id: string
          vino_id?: string | null
        }
        Update: {
          bodega_id?: string | null
          created_at?: string
          id?: string
          usuario_id?: string
          vino_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favoritos_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "bodegas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favoritos_vino_id_fkey"
            columns: ["vino_id"]
            isOneToOne: false
            referencedRelation: "vinos"
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
      historial_precios: {
        Row: {
          desde: string
          hasta: string | null
          id: string
          oferta_id: string
          precio: number
        }
        Insert: {
          desde?: string
          hasta?: string | null
          id?: string
          oferta_id: string
          precio: number
        }
        Update: {
          desde?: string
          hasta?: string | null
          id?: string
          oferta_id?: string
          precio?: number
        }
        Relationships: [
          {
            foreignKeyName: "historial_precios_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "ofertas"
            referencedColumns: ["id"]
          },
        ]
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
      invitaciones: {
        Row: {
          caduca: string | null
          creada_por: string | null
          created_at: string
          email: string
          id: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          updated_at: string
          usada_en: string | null
          usada_por: string | null
        }
        Insert: {
          caduca?: string | null
          creada_por?: string | null
          created_at?: string
          email: string
          id?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string
          usada_en?: string | null
          usada_por?: string | null
        }
        Update: {
          caduca?: string | null
          creada_por?: string | null
          created_at?: string
          email?: string
          id?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string
          usada_en?: string | null
          usada_por?: string | null
        }
        Relationships: []
      }
      notas: {
        Row: {
          anada_id: string | null
          bodega_id: string | null
          created_at: string
          fusionada: boolean
          id: string
          texto: string
          updated_at: string
          usuario_id: string
          vino_id: string | null
        }
        Insert: {
          anada_id?: string | null
          bodega_id?: string | null
          created_at?: string
          fusionada?: boolean
          id?: string
          texto: string
          updated_at?: string
          usuario_id: string
          vino_id?: string | null
        }
        Update: {
          anada_id?: string | null
          bodega_id?: string | null
          created_at?: string
          fusionada?: boolean
          id?: string
          texto?: string
          updated_at?: string
          usuario_id?: string
          vino_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_anada_id_fkey"
            columns: ["anada_id"]
            isOneToOne: false
            referencedRelation: "anadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "bodegas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_vino_id_fkey"
            columns: ["vino_id"]
            isOneToOne: false
            referencedRelation: "vinos"
            referencedColumns: ["id"]
          },
        ]
      }
      ofertas: {
        Row: {
          anada_id: string | null
          created_at: string
          disponible: boolean
          ean: string | null
          ejecuciones_sin_ver: number
          estado_enlace: Database["public"]["Enums"]["estado_enlace"]
          formato_ml: number
          id: string
          id_externo: string
          moneda: string
          oculta_admin: boolean
          precio: number
          registro_id: string | null
          tienda_id: string
          updated_at: string
          url: string
          vino_id: string
          visto_por_ultima_vez: string
        }
        Insert: {
          anada_id?: string | null
          created_at?: string
          disponible?: boolean
          ean?: string | null
          ejecuciones_sin_ver?: number
          estado_enlace?: Database["public"]["Enums"]["estado_enlace"]
          formato_ml?: number
          id?: string
          id_externo: string
          moneda?: string
          oculta_admin?: boolean
          precio: number
          registro_id?: string | null
          tienda_id: string
          updated_at?: string
          url: string
          vino_id: string
          visto_por_ultima_vez?: string
        }
        Update: {
          anada_id?: string | null
          created_at?: string
          disponible?: boolean
          ean?: string | null
          ejecuciones_sin_ver?: number
          estado_enlace?: Database["public"]["Enums"]["estado_enlace"]
          formato_ml?: number
          id?: string
          id_externo?: string
          moneda?: string
          oculta_admin?: boolean
          precio?: number
          registro_id?: string | null
          tienda_id?: string
          updated_at?: string
          url?: string
          vino_id?: string
          visto_por_ultima_vez?: string
        }
        Relationships: [
          {
            foreignKeyName: "ofertas_anada_id_fkey"
            columns: ["anada_id"]
            isOneToOne: false
            referencedRelation: "anadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_registro_id_fkey"
            columns: ["registro_id"]
            isOneToOne: false
            referencedRelation: "registros_fuente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_vino_id_fkey"
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
      preferencias_vino: {
        Row: {
          created_at: string
          crianzas: Database["public"]["Enums"]["crianza_vino"][]
          denominacion_ids: string[]
          precio_max: number | null
          precio_min: number | null
          tipos: Database["public"]["Enums"]["tipo_vino"][]
          updated_at: string
          usuario_id: string
          variedad_uva_ids: string[]
        }
        Insert: {
          created_at?: string
          crianzas?: Database["public"]["Enums"]["crianza_vino"][]
          denominacion_ids?: string[]
          precio_max?: number | null
          precio_min?: number | null
          tipos?: Database["public"]["Enums"]["tipo_vino"][]
          updated_at?: string
          usuario_id: string
          variedad_uva_ids?: string[]
        }
        Update: {
          created_at?: string
          crianzas?: Database["public"]["Enums"]["crianza_vino"][]
          denominacion_ids?: string[]
          precio_max?: number | null
          precio_min?: number | null
          tipos?: Database["public"]["Enums"]["tipo_vino"][]
          updated_at?: string
          usuario_id?: string
          variedad_uva_ids?: string[]
        }
        Relationships: []
      }
      procedencia_campos: {
        Row: {
          campo: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fuente_id: string | null
          observado_en: string
          origen: Database["public"]["Enums"]["origen_dato"]
          registro_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          campo: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fuente_id?: string | null
          observado_en?: string
          origen: Database["public"]["Enums"]["origen_dato"]
          registro_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          campo?: string
          entidad_id?: string
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"]
          fuente_id?: string | null
          observado_en?: string
          origen?: Database["public"]["Enums"]["origen_dato"]
          registro_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedencia_campos_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedencia_campos_registro_id_fkey"
            columns: ["registro_id"]
            isOneToOne: false
            referencedRelation: "registros_fuente"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_fuente: {
        Row: {
          confianza_emparejamiento: number | null
          created_at: string
          datos: Json
          decidido_en: string | null
          decidido_por: string | null
          decision: string | null
          decision_id: string | null
          decision_tipo: Database["public"]["Enums"]["entidad_catalogo"] | null
          entidad_id: string | null
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"] | null
          estado_emparejamiento: Database["public"]["Enums"]["estado_emparejamiento"]
          fuente_id: string
          hechos: Json
          id: string
          id_externo: string
          supresion_id: string | null
          updated_at: string
          url: string | null
          visto_por_ultima_vez: string
        }
        Insert: {
          confianza_emparejamiento?: number | null
          created_at?: string
          datos: Json
          decidido_en?: string | null
          decidido_por?: string | null
          decision?: string | null
          decision_id?: string | null
          decision_tipo?: Database["public"]["Enums"]["entidad_catalogo"] | null
          entidad_id?: string | null
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"] | null
          estado_emparejamiento?: Database["public"]["Enums"]["estado_emparejamiento"]
          fuente_id: string
          hechos?: Json
          id?: string
          id_externo: string
          supresion_id?: string | null
          updated_at?: string
          url?: string | null
          visto_por_ultima_vez?: string
        }
        Update: {
          confianza_emparejamiento?: number | null
          created_at?: string
          datos?: Json
          decidido_en?: string | null
          decidido_por?: string | null
          decision?: string | null
          decision_id?: string | null
          decision_tipo?: Database["public"]["Enums"]["entidad_catalogo"] | null
          entidad_id?: string | null
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"] | null
          estado_emparejamiento?: Database["public"]["Enums"]["estado_emparejamiento"]
          fuente_id?: string
          hechos?: Json
          id?: string
          id_externo?: string
          supresion_id?: string | null
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
          {
            foreignKeyName: "registros_fuente_supresion_id_fkey"
            columns: ["supresion_id"]
            isOneToOne: false
            referencedRelation: "supresiones"
            referencedColumns: ["id"]
          },
        ]
      }
      resumenes: {
        Row: {
          campo: string
          created_at: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fuentes: string[]
          generador: string
          hash_hechos: string
          idioma: Database["public"]["Enums"]["idioma"]
          texto: string
          updated_at: string
        }
        Insert: {
          campo: string
          created_at?: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fuentes?: string[]
          generador: string
          hash_hechos: string
          idioma: Database["public"]["Enums"]["idioma"]
          texto: string
          updated_at?: string
        }
        Update: {
          campo?: string
          created_at?: string
          entidad_id?: string
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"]
          fuentes?: string[]
          generador?: string
          hash_hechos?: string
          idioma?: Database["public"]["Enums"]["idioma"]
          texto?: string
          updated_at?: string
        }
        Relationships: []
      }
      servicios_bodega: {
        Row: {
          activo: boolean
          bodega_id: string
          clave: string | null
          created_at: string
          descripcion: string | null
          duracion_minutos: number | null
          fuente_id: string | null
          horario: string | null
          id: string
          idiomas: string[]
          precio_desde: number | null
          tipo: Database["public"]["Enums"]["tipo_servicio"]
          titulo: string
          updated_at: string
          url_reserva: string | null
          enlaces_ocultos: string[] | null
        }
        Insert: {
          activo?: boolean
          bodega_id: string
          clave?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number | null
          fuente_id?: string | null
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
          clave?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_minutos?: number | null
          fuente_id?: string | null
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
          {
            foreignKeyName: "servicios_bodega_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
      supresiones: {
        Row: {
          claves: Json
          creada_por: string | null
          created_at: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fusionada_en: string | null
          id: string
          motivo: string
        }
        Insert: {
          claves?: Json
          creada_por?: string | null
          created_at?: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fusionada_en?: string | null
          id?: string
          motivo: string
        }
        Update: {
          claves?: Json
          creada_por?: string | null
          created_at?: string
          entidad_id?: string
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"]
          fusionada_en?: string | null
          id?: string
          motivo?: string
        }
        Relationships: []
      }
      tiendas: {
        Row: {
          activa: boolean
          afiliacion_plantilla: string | null
          afiliacion_programa: string | null
          bodega_id: string | null
          created_at: string
          dominio: string | null
          envio_gratis_desde: number | null
          fuente_id: string | null
          id: string
          info_envio: string | null
          logo_url: string | null
          nombre: string
          slug: string
          tipo: Database["public"]["Enums"]["tipo_tienda"]
          updated_at: string
          web: string
        }
        Insert: {
          activa?: boolean
          afiliacion_plantilla?: string | null
          afiliacion_programa?: string | null
          bodega_id?: string | null
          created_at?: string
          dominio?: string | null
          envio_gratis_desde?: number | null
          fuente_id?: string | null
          id?: string
          info_envio?: string | null
          logo_url?: string | null
          nombre: string
          slug: string
          tipo?: Database["public"]["Enums"]["tipo_tienda"]
          updated_at?: string
          web: string
        }
        Update: {
          activa?: boolean
          afiliacion_plantilla?: string | null
          afiliacion_programa?: string | null
          bodega_id?: string | null
          created_at?: string
          dominio?: string | null
          envio_gratis_desde?: number | null
          fuente_id?: string | null
          id?: string
          info_envio?: string | null
          logo_url?: string | null
          nombre?: string
          slug?: string
          tipo?: Database["public"]["Enums"]["tipo_tienda"]
          updated_at?: string
          web?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiendas_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "bodegas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiendas_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
      valores_fuente: {
        Row: {
          campo: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fuente_id: string
          observado_en: string
          origen: Database["public"]["Enums"]["origen_dato"]
          registro_id: string
          url: string | null
          valor: Json
          valor_desde: string
        }
        Insert: {
          campo: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fuente_id: string
          observado_en?: string
          origen: Database["public"]["Enums"]["origen_dato"]
          registro_id: string
          url?: string | null
          valor: Json
          valor_desde?: string
        }
        Update: {
          campo?: string
          entidad_id?: string
          entidad_tipo?: Database["public"]["Enums"]["entidad_catalogo"]
          fuente_id?: string
          observado_en?: string
          origen?: Database["public"]["Enums"]["origen_dato"]
          registro_id?: string
          url?: string | null
          valor?: Json
          valor_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "valores_fuente_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valores_fuente_registro_id_fkey"
            columns: ["registro_id"]
            isOneToOne: false
            referencedRelation: "registros_fuente"
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
          elaboracion: string | null
          fuente_id: string | null
          id: string
          nombre: string
          slug: string
          tipo: Database["public"]["Enums"]["tipo_vino"]
          updated_at: string
          enlaces_ocultos: string[] | null
        }
        Insert: {
          bodega_id: string
          created_at?: string
          crianza?: Database["public"]["Enums"]["crianza_vino"] | null
          denominacion_id?: string | null
          descripcion?: string | null
          elaboracion?: string | null
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
          elaboracion?: string | null
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
      _fusion_comun: {
        Args: {
          p_columnas: string[]
          p_destino: string
          p_origen: string
          p_tabla: string
          p_tipo: Database["public"]["Enums"]["entidad_catalogo"]
        }
        Returns: undefined
      }
      _fusion_mover_ofertas: {
        Args: { p_destino: string; p_nivel: string; p_origen: string }
        Returns: undefined
      }
      _fusion_mover_personales: {
        Args: { p_destino: string; p_origen: string; p_tipo: string }
        Returns: undefined
      }
      _registrar_supresion: {
        Args: {
          p_claves: Json
          p_id: string
          p_tipo: Database["public"]["Enums"]["entidad_catalogo"]
        }
        Returns: undefined
      }
      admin_editar_url_enlace: {
        Args: { p_id: string; p_url: string }
        Returns: string
      }
      admin_fuentes_con_ejecuciones: {
        Args: never
        Returns: {
          nombre: string
          slug: string
        }[]
      }
      admin_fusionar: {
        Args: { p_destino: string; p_origen: string; p_tipo: string }
        Returns: undefined
      }
      admin_guardar_denominaciones_bodega: {
        Args: {
          p_bodega_id: string
          p_denominacion_ids: string[]
          p_principal?: string
        }
        Returns: undefined
      }
      admin_guardar_variedades_anada: {
        Args: { p_anada_id: string; p_variedades: Json }
        Returns: undefined
      }
      admin_listar_usuarios: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          last_sign_in_at: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }[]
      }
      bodegas_cerca: {
        Args: {
          p_lat: number
          p_limite?: number
          p_lng: number
          p_radio_km?: number
        }
        Returns: {
          distancia_km: number
          id: string
          lat: number
          lng: number
          municipio: string
          nombre: string
          origen: string
          precision: string
          provincia: string
          slug: string
        }[]
      }
      buscar_catalogo: {
        Args: { limite?: number; q: string }
        Returns: {
          entidad: string
          id: string
          nombre: string
          relevancia: number
          slug: string
          subtitulo: string
          tipo_vino: Database["public"]["Enums"]["tipo_vino"]
        }[]
      }
      dominio_web: { Args: { url: string }; Returns: string }
      enlaces_ocultos:
        | {
            Args: { "": Database["public"]["Tables"]["anadas"]["Row"] }
            Returns: {
              error: true
            } & "the function public.enlaces_ocultos with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
        | {
            Args: { "": Database["public"]["Tables"]["bodegas"]["Row"] }
            Returns: {
              error: true
            } & "the function public.enlaces_ocultos with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
        | {
            Args: {
              "": Database["public"]["Tables"]["servicios_bodega"]["Row"]
            }
            Returns: {
              error: true
            } & "the function public.enlaces_ocultos with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
        | {
            Args: { "": Database["public"]["Tables"]["vinos"]["Row"] }
            Returns: {
              error: true
            } & "the function public.enlaces_ocultos with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
          }
      f_unaccent: { Args: { "": string }; Returns: string }
      hook_antes_de_crear_usuario: { Args: { event: Json }; Returns: Json }
      invitacion_valida: {
        Args: { p_email: string }
        Returns: {
          caduca: string | null
          creada_por: string | null
          created_at: string
          email: string
          id: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          updated_at: string
          usada_en: string | null
          usada_por: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invitaciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      listar_bodegas: {
        Args: {
          denominacion?: string
          desplazamiento?: number
          limite?: number
          q?: string
        }
        Returns: {
          denominacion_nombre: string
          id: string
          imagen_alt: string
          imagen_tipo: string
          imagen_url: string
          municipio: string
          nombre: string
          num_vinos: number
          provincia: string
          relevancia: number
          slug: string
          total: number
        }[]
      }
      listar_vinos: {
        Args: {
          anio?: number
          bodega?: string
          crianzas?: Database["public"]["Enums"]["crianza_vino"][]
          denominaciones?: string[]
          desplazamiento?: number
          limite?: number
          orden?: string
          precio_max?: number
          precio_min?: number
          q?: string
          sin_anada?: boolean
          tipos?: Database["public"]["Enums"]["tipo_vino"][]
          variedades?: string[]
        }
        Returns: {
          anios: number[]
          bodega_nombre: string
          bodega_slug: string
          crianza: Database["public"]["Enums"]["crianza_vino"]
          denominacion_nombre: string
          denominacion_slug: string
          id: string
          imagen_alt: string
          imagen_url: string
          nombre: string
          precio_desde: number
          relevancia: number
          slug: string
          tipo: Database["public"]["Enums"]["tipo_vino"]
          total: number
        }[]
      }
      mapa_bodegas: {
        Args: never
        Returns: {
          id: string
          lat: number
          lng: number
          municipio: string
          nombre: string
          origen: string
          precision: string
          provincia: string
          slug: string
        }[]
      }
      marcar_ofertas_no_vistas: {
        Args: { p_inicio: string; p_tienda: string; p_umbral?: number }
        Returns: number
      }
      normalizar_busqueda: { Args: { q: string }; Returns: string }
      opciones_filtro_vinos: {
        Args: never
        Returns: {
          etiqueta: string
          grupo: string
          num: number
          valor: string
        }[]
      }
      patron_contiene: { Args: { q: string }; Returns: string }
      precio_desde_vino: {
        Args: { p_formato_ml?: number; p_vino: string }
        Returns: number
      }
      registrar_comprobacion_enlace: {
        Args: {
          p_error?: string
          p_http?: number
          p_id: string
          p_metodo?: string
          p_resultado: string
          p_url_final?: string
        }
        Returns: {
          campos: string[]
          created_at: string
          entidad_id: string
          entidad_tipo: Database["public"]["Enums"]["entidad_catalogo"]
          fallos_consecutivos: number
          id: string
          metodo: string | null
          modo: string
          oculto: boolean
          ultima_comprobacion: string | null
          ultimo_error: string | null
          ultimo_estado_http: number | null
          ultimo_ok: string | null
          ultimo_resultado: string | null
          updated_at: string
          url: string
          url_final: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "comprobaciones_enlace"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      relevancia_nombre: {
        Args: { nombre: string; qn: string }
        Returns: number
      }
      sincronizar_comprobaciones_enlace: {
        Args: never
        Returns: {
          borrados: number
          nuevos: number
          total: number
        }[]
      }
      ubicacion_bodega_detalle: {
        Args: { p_bodega: string }
        Returns: {
          origen: string
          precision: string
        }[]
      }
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
      origen_dato:
        | "admin"
        | "bodega"
        | "consejo_regulador"
        | "guia"
        | "tienda"
        | "otra"
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
        | "actividad"
      tipo_tienda: "online" | "supermercado" | "especializada" | "bodega"
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
      origen_dato: [
        "admin",
        "bodega",
        "consejo_regulador",
        "guia",
        "tienda",
        "otra",
      ],
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
        "actividad",
      ],
      tipo_tienda: ["online", "supermercado", "especializada", "bodega"],
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
