export type Role = 'INSPECTOR' | 'SUPERVISOR'

type TableRecord<Row, Insert = Row, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: never[]
}

type RevisionRow = {
  id: string
  created_at: string
  inspector_rut: string
  inspector_nombre: string
  terminal_detectado: string
  terminal_reportado: string
  bus_ppu: string
  bus_interno: string
  estado_bus: 'OPERATIVO' | 'EN_PANNE'
  lat: number
  lon: number
  observaciones: string | null
  semana_iso: string
  operativo: boolean
}

type TagRow = {
  id: string
  revision_id: string
  tiene: boolean
  serie: string | null
  observacion: string | null
  created_at: string
  bus_ppu: string
  terminal: string
}

type CamarasRow = {
  id: string
  revision_id: string
  monitor_estado: 'FUNCIONA' | 'APAGADO' | 'CON_DAÑO' | 'SIN_SENAL'
  detalle: Record<string, unknown> | null
  observacion: string | null
  created_at: string
  bus_ppu: string
  terminal: string
}

type ExtintoresRow = {
  id: string
  revision_id: string
  tiene: boolean
  vencimiento_mes: number | null
  vencimiento_anio: number | null
  certificacion: 'VIGENTE' | 'VENCIDA' | null
  sonda: 'OK' | 'SIN_LECTURA' | 'FUERA_DE_RANGO' | null
  manometro: 'OK' | 'SIN_LECTURA' | 'FUERA_DE_RANGO' | null
  presion: 'SOBRECARGA' | 'OPTIMO' | 'BAJA_CARGA' | null
  cilindro: 'OK' | 'ABOLLADO' | 'OXIDADO' | null
  porta: 'TIENE' | 'NO_TIENE' | 'DANADO' | null
  observacion: string | null
  created_at: string
  bus_ppu: string
  terminal: string
}

type MobileyeRow = {
  id: string
  revision_id: string
  bus_marca: string
  alerta_izq: boolean | null
  alerta_der: boolean | null
  consola: boolean | null
  sensor_frontal: boolean | null
  sensor_izq: boolean | null
  sensor_der: boolean | null
  observacion: string | null
  created_at: string
  bus_ppu: string
  terminal: string
}

type OdometroRow = {
  id: string
  revision_id: string
  lectura: number
  estado: 'OK' | 'INCONSISTENTE' | 'NO_FUNCIONA'
  observacion: string | null
  created_at: string
  bus_ppu: string
  terminal: string
}

type PublicidadRow = {
  id: string
  revision_id: string
  tiene: boolean
  danio: boolean | null
  residuos: boolean | null
  detalle_lados: {
    izquierda: {
      tiene: boolean
      danio: boolean | null
      residuos: boolean | null
    }
    derecha: {
      tiene: boolean
      danio: boolean | null
      residuos: boolean | null
    }
    luneta: {
      tiene: boolean
      danio: boolean | null
      residuos: boolean | null
    }
  } | null
  nombre_publicidad: string | null
  observacion: string | null
  created_at: string
  bus_ppu: string
  terminal: string
}

type TicketRow = {
  id: string
  modulo: string
  revision_id: string
  estado: 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTO'
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA'
  descripcion: string
  terminal: string
  created_at: string
  actualizado_en: string
}

type PersonalRow = {
  id: string
  nombre: string
  cargo: string
  terminal: string
  telefono: string | null
  correo: string | null
  estado: 'DISPONIBLE' | 'LICENCIA' | 'TURNO'
  created_at: string
}

type FlotaRow = {
  id: string
  ppu: string
  numero_interno: string
  marca: string
  modelo: string
  anio: number
  terminal: string
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      usuarios: TableRecord<{
        rut: string
        nombre: string
        cargo: Role
        terminal: string
        password: string
        foto_url: string | null
        created_at: string
      }>
      revisiones: TableRecord<RevisionRow, Omit<RevisionRow, 'id' | 'created_at'>>
      tags: TableRecord<TagRow, Omit<TagRow, 'id' | 'created_at'>>
      camaras: TableRecord<CamarasRow, Omit<CamarasRow, 'id' | 'created_at'>>
      extintores: TableRecord<ExtintoresRow, Omit<ExtintoresRow, 'id' | 'created_at'>>
      mobileye: TableRecord<MobileyeRow, Omit<MobileyeRow, 'id' | 'created_at'>>
      odometro: TableRecord<OdometroRow, Omit<OdometroRow, 'id' | 'created_at'>>
      publicidad: TableRecord<PublicidadRow, Omit<PublicidadRow, 'id' | 'created_at'>>
      tickets: TableRecord<TicketRow, Omit<TicketRow, 'id' | 'created_at' | 'actualizado_en'>>
      personal: TableRecord<PersonalRow, Omit<PersonalRow, 'id' | 'created_at'>>
      flota: TableRecord<FlotaRow, Omit<FlotaRow, 'id' | 'created_at'>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
