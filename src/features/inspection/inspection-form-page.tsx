import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BatteryCharging,
  Bus,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Flag,
  Flame,
  Gauge,
  HardDrive,
  Hash,
  KeyRound,
  Loader2,
  MapPin,
  Megaphone,
  Radar,
  Search,
  Tag,
  Wifi,
  X,
  XCircle,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import dayjs, { getIsoWeekYear } from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { detectTerminal } from '@/lib/geofence'
import { getUserIP, getIPGeoLocation } from '@/lib/ip-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth-store'
import { useAnunciarInspeccion } from '@/hooks/use-inspeccion-presence'
import type { Tables, Database } from '@/types/database'
import { useNotificationStore } from '@/store/notification-store'
import { useTracking } from '@/hooks/use-tracking'
import { MODULOS, moduloAplicaAlBus, type ModuloClave } from '@/constants/modulos'
import { BORRADOR_INSPECCION_KEY, marcarInspeccionEnCurso } from '@/lib/sesion'
import { useModulosVigentes } from '@/hooks/use-modulos-config'
import {
  BusRevisadoDialog,
  type RevisionPrevia,
} from '@/features/inspection/bus-revisado-dialog'

const publicidadAreaSchema = z
  .object({
    tiene: z.boolean(),
    danio: z.boolean().nullable(),
    residuos: z.boolean().nullable(),
    observacion: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Si TIENE publicidad: OBLIGATORIO nombre de campaña en observaciones
    if (data.tiene === true) {
      if (!data.observacion || data.observacion.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debes especificar el nombre de la campaña publicitaria',
          path: ['observacion'],
        })
      }
    }

    // Si NO TIENE publicidad: OBLIGATORIO daño O residuos + observaciones
    if (data.tiene === false) {
      const tieneDanio = data.danio === true
      const tieneResiduos = data.residuos === true

      if (!tieneDanio && !tieneResiduos) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debes marcar "Con daño" o "Con residuos"',
          path: ['danio'],
        })
      }

      if (!data.observacion || data.observacion.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debes especificar el motivo',
          path: ['observacion'],
        })
      }
    }
  })

const estadoNormaSchema = z.enum(['OK', 'DETERIORADO', 'FALTA']).nullable()

/**
 * Elementos de la norma gráfica, en el orden del levantamiento en terreno.
 *
 * `campo` es el nombre en el formulario y `columna` el de la tabla: se declaran
 * juntos para que el insert, la validación y la UI recorran una sola lista y no
 * puedan desalinearse.
 */
const ELEMENTOS_NORMA = [
  {
    campo: 'internoDelantero',
    columna: 'interno_delantero',
    label: 'N° interno delantero',
    ayuda: 'Numeración pintada en el frontal',
  },
  {
    campo: 'internoTrasero',
    columna: 'interno_trasero',
    label: 'N° interno trasero',
    ayuda: 'Numeración pintada en la trasera',
  },
  {
    campo: 'ppuLateralDerecho',
    columna: 'ppu_lateral_derecho',
    label: 'Norma PPU lateral derecho',
    ayuda: 'PPU gráfica en el costado derecho',
  },
  {
    campo: 'ppuTrasera',
    columna: 'ppu_trasera',
    label: 'Norma PPU trasera',
    ayuda: 'PPU gráfica en la trasera',
  },
  {
    campo: 'patenteDelantera',
    columna: 'patente_delantera',
    label: 'Patente delantera',
    ayuda: 'Placa patente física del frontal',
  },
  {
    campo: 'patenteTrasera',
    columna: 'patente_trasera',
    label: 'Patente trasera',
    ayuda: 'Placa patente física de la trasera',
  },
] as const

type EstadoNormaValor = 'OK' | 'DETERIORADO' | 'FALTA' | null

// El flujo usa validación contextual por paso; el esquema mantiene el contrato tipado completo.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const inspectionSchema = z
  .object({
    estadoBus: z.enum(['OPERATIVO', 'EN_PANNE']),
    observacionGeneral: z
      .string()
      .max(600, 'Máximo 600 caracteres')
      .optional(),
    terminalReportado: z.string().min(2, 'Selecciona el terminal'),
    tag: z.object({
      tiene: z.boolean(),
      serie: z.string().optional(),
      observacion: z.string().optional(),
    }),
    camaras: z.object({
      monitorEstado: z.enum(['FUNCIONA', 'APAGADO', 'CON_DAÑO', 'SIN_SENAL']),
      monitorDetalle: z.string().optional(),
      camDelantera: z.boolean().nullable(),
      camCabina: z.boolean().nullable(),
      camInteriores: z.boolean().nullable(),
      camTrasera: z.boolean().nullable(),
      visiblesMonitor: z.boolean().nullable(),
      activaReversa: z.boolean().nullable(),
      activaPuertas: z.boolean().nullable(),
      visiblesPuertasCerradas: z.boolean().nullable(),
      observacion: z.string().optional(),
    }),
    extintores: z.object({
      tiene: z.boolean(),
      vencimientoMes: z.coerce.number().min(1).max(12).optional(),
      vencimientoAnio: z.coerce.number().min(2023).max(2035).optional(),
      certificacion: z.enum(['VIGENTE', 'VENCIDA']).nullable(),
      sonda: z.enum(['OK', 'SIN_LECTURA', 'FUERA_DE_RANGO']).nullable(),
      manometro: z.enum(['OK', 'SIN_LECTURA', 'FUERA_DE_RANGO']).nullable(),
      presion: z.enum(['SOBRECARGA', 'OPTIMO', 'BAJA_CARGA']).nullable(),
      cilindro: z.enum(['OK', 'ABOLLADO', 'OXIDADO']).nullable(),
      porta: z.enum(['TIENE', 'NO_TIENE', 'DANADO']).nullable(),
      observacion: z.string().optional(),
    }),
    mobileye: z.object({
      aplica: z.boolean(),
      alertaIzq: z.boolean().nullable(),
      alertaDer: z.boolean().nullable(),
      consola: z.boolean().nullable(),
      sensorFrontal: z.boolean().nullable(),
      sensorIzq: z.boolean().nullable(),
      sensorDer: z.boolean().nullable(),
      observacion: z.string().optional(),
    }),
    odometro: z.object({
      lectura: z.preprocess(
        (value) => (value === '' || value === null ? undefined : Number(value)),
        z.number().min(0, 'Debe ser positivo')
      ),
      estado: z.enum(['OK', 'INCONSISTENTE', 'NO_FUNCIONA']),
      observacion: z.string().optional(),
    }),
    rack: z.object({
      // Sin llave física no se puede abrir el rack: se omite la revisión
      // y se conserva el último registro real del bus
      sinLlave: z.boolean(),
      tieneDiscoDuro: z.boolean().nullable(),
      tieneSeguridadExtra: z.boolean().nullable(),
      tieneCandado: z.boolean().nullable(),
      cerradurasBuenEstado: z.boolean().nullable(),
      cantidadCerradurasEsperada: z.coerce.number().min(2).max(4),
      observacion: z.string().optional(),
    }),
    publicidad: z.object({
      izquierda: publicidadAreaSchema,
      derecha: publicidadAreaSchema,
      luneta: publicidadAreaSchema,
    }),
    wifi: z.object({
      ppuVisible: z.boolean().nullable(),
      busEncendido: z.boolean().nullable(),
      tieneInternet: z.boolean().nullable(),
      observacion: z.string().optional(),
    }),
    normaGrafica: z.object({
      internoDelantero: estadoNormaSchema,
      internoTrasero: estadoNormaSchema,
      ppuLateralDerecho: estadoNormaSchema,
      ppuTrasera: estadoNormaSchema,
      patenteDelantera: estadoNormaSchema,
      patenteTrasera: estadoNormaSchema,
      observacion: z.string().optional(),
    }),
    mas15: z.object({
      // El bus arrancó y consola + validador llegaron a encenderse. Sin este
      // paso previo no hay nada que comprobar: el resultado quedaría inválido.
      arranqueOk: z.boolean().nullable(),
      // Estado de cada equipo DESPUÉS de retirar el corta corriente
      consolaEncendida: z.boolean().nullable(),
      validadorEncendido: z.boolean().nullable(),
      observacion: z.string().optional(),
    }),
  })

/**
 * Los pasos salen del catálogo central de módulos, no de una lista propia.
 * Antes el formulario, Configuración y el dashboard mantenían cada uno su
 * copia, y añadir un módulo obligaba a tocar los tres para que coincidieran.
 */
const steps = MODULOS.map((modulo) => ({
  key: modulo.clave,
  label: modulo.nombre,
  icon: modulo.icono,
  accent: modulo.acento,
}))

type StepKey = ModuloClave

/**
 * Bus EN PANNE: se revisan obligatoriamente los módulos que no necesitan el
 * bus encendido. Cámaras, Odómetro, WiFi y +15 se omiten porque todos exigen
 * arrancar el motor.
 */
const PANNE_REQUIRED_STEPS: readonly StepKey[] = MODULOS.filter(
  (modulo) => modulo.obligatorioEnPanne
).map((modulo) => modulo.clave)

const PANNE_SKIPPED_STEPS: readonly StepKey[] = MODULOS.filter(
  (modulo) => modulo.requiereBusOperativo
).map((modulo) => modulo.clave)

// Marcadores de registros que NO representan una revisión real del rack
const OBS_PANNE = 'Bus en panne - no revisado'
const OBS_SIN_LLAVE = 'Sin llave'

/**
 * Último registro de rack que sí fue una revisión real del bus:
 * descarta los guardados como "bus en panne" y los heredados por "sin llave",
 * para no arrastrar una copia de una copia.
 */
const fetchUltimoRackReal = async (ppu: string): Promise<Tables<'rack'> | null> => {
  const { data, error } = await supabase
    .from('rack')
    .select('*')
    .eq('bus_ppu', ppu)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error || !data) return null

  const esRevisionReal = (row: Tables<'rack'>) => {
    const obs = (row.observacion ?? '').trim()
    if (obs === OBS_PANNE) return false
    if (obs.startsWith(OBS_SIN_LLAVE)) return false
    // Un registro sin ninguna respuesta tampoco aporta nada
    return (
      row.tiene_disco_duro !== null ||
      row.tiene_candado !== null ||
      row.cerraduras_buen_estado !== null
    )
  }

  return (data as Tables<'rack'>[]).find(esRevisionReal) ?? null
}

const publicityAreas = [
  { key: 'izquierda', label: 'Lateral Izquierdo' },
  { key: 'derecha', label: 'Lateral Derecho' },
  { key: 'luneta', label: 'Luneta' },
] as const

type PublicidadAreaKey = (typeof publicityAreas)[number]['key']

const cameraHardwareQuestions = [
  { field: 'camDelantera', label: 'Cámara delantera' },
  { field: 'camCabina', label: 'Cámara de cabina' },
  { field: 'camInteriores', label: 'Cámaras interiores' },
  { field: 'camTrasera', label: 'Cámara trasera' },
] as const

type CameraHardwareField = (typeof cameraHardwareQuestions)[number]['field']

const mobileyeQuestionList = [
  { field: 'alertaIzq', label: 'Alerta izquierda' },
  { field: 'alertaDer', label: 'Alerta derecha' },
  { field: 'consola', label: 'Consola' },
  { field: 'sensorFrontal', label: 'Sensor frontal' },
  { field: 'sensorIzq', label: 'Sensor izquierdo' },
  { field: 'sensorDer', label: 'Sensor derecho' },
] as const

type MobileyeField = (typeof mobileyeQuestionList)[number]['field']

type InspectionForm = z.infer<typeof inspectionSchema>

/*
 * Borrador persistente de la inspección en curso.
 *
 * En terreno la revisión se pierde por mil caminos que no dependen del
 * inspector: el navegador desaloja la pestaña al bloquear el teléfono, la
 * página se recarga, la app se cae o la sesión se cierra. Veinte campos
 * rellenados no pueden depender de que nada de eso ocurra: cada cambio se
 * guarda en localStorage y, al volver, la revisión continúa donde quedó.
 */
const BORRADOR_KEY = BORRADOR_INSPECCION_KEY
const BORRADOR_VERSION = 1
/** Un borrador más viejo que esto ya no describe el estado real del bus */
const BORRADOR_MAX_HORAS = 12

interface BorradorInspeccion {
  version: number
  rut: string
  guardadoEn: string
  paso: number
  bus: Tables<'flota'>
  valores: InspectionForm
}

const leerBorrador = (rut: string): BorradorInspeccion | null => {
  try {
    const crudo = window.localStorage.getItem(BORRADOR_KEY)
    if (!crudo) return null
    const borrador = JSON.parse(crudo) as BorradorInspeccion
    // Otro usuario, otra versión del esquema o demasiado viejo: se descarta
    if (borrador.version !== BORRADOR_VERSION || borrador.rut !== rut) return null
    if (dayjs().diff(dayjs(borrador.guardadoEn), 'hour') >= BORRADOR_MAX_HORAS) return null
    if (!borrador.bus?.ppu) return null
    return borrador
  } catch {
    return null
  }
}

const limpiarBorrador = () => {
  try {
    window.localStorage.removeItem(BORRADOR_KEY)
  } catch {
    // Sin almacenamiento no hay nada que limpiar
  }
}
type CameraPath = `camaras.${CameraHardwareField}`
type MobileyePath = `mobileye.${MobileyeField}`
type PublicidadPath = `publicidad.${PublicidadAreaKey}.${'tiene' | 'danio' | 'residuos'}`
type ExtintorFieldKey = 'certificacion' | 'sonda' | 'manometro' | 'presion' | 'cilindro' | 'porta'

const extinguisherFieldConfig = [
  {
    key: 'certificacion' as const,
    label: 'Certificación',
    placeholder: 'Selecciona estado',
    options: [
      { value: 'VIGENTE', label: 'Vigente' },
      { value: 'VENCIDA', label: 'Vencida' },
    ],
  },
  {
    key: 'sonda' as const,
    label: 'Sonda',
    placeholder: 'Estado de la sonda',
    options: [
      { value: 'OK', label: 'OK' },
      { value: 'SIN_LECTURA', label: 'Sin lectura' },
      { value: 'FUERA_DE_RANGO', label: 'Fuera de rango' },
    ],
  },
  {
    key: 'manometro' as const,
    label: 'Manómetro',
    placeholder: 'Estado del manómetro',
    options: [
      { value: 'OK', label: 'OK' },
      { value: 'SIN_LECTURA', label: 'Sin lectura' },
      { value: 'FUERA_DE_RANGO', label: 'Fuera de rango' },
    ],
  },
  {
    key: 'presion' as const,
    label: 'Estado de carga en manómetro',
    placeholder: 'Carga detectada',
    options: [
      { value: 'OPTIMO', label: 'Óptimo' },
      { value: 'BAJA_CARGA', label: 'Baja carga' },
      { value: 'SOBRECARGA', label: 'Sobrecarga' },
    ],
  },
  {
    key: 'cilindro' as const,
    label: 'Estado del cilindro',
    placeholder: 'Estado físico',
    options: [
      { value: 'OK', label: 'OK' },
      { value: 'ABOLLADO', label: 'Abollado' },
      { value: 'OXIDADO', label: 'Oxidado' },
    ],
  },
  {
    key: 'porta' as const,
    label: 'Porta extintor',
    placeholder: 'Condición del porta',
    options: [
      { value: 'TIENE', label: 'Instalado' },
      { value: 'NO_TIENE', label: 'No tiene' },
      { value: 'DANADO', label: 'Dañado' },
    ],
  },
] satisfies Array<{
  key: ExtintorFieldKey
  label: string
  placeholder: string
  options: { value: string; label: string }[]
}>

// ============================================================
// COMPONENTES DE UI REDISEÑADOS
// ============================================================

const AlertBanner = ({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'warning' | 'success' | 'info'
  title?: string
  children: ReactNode
}) => {
  const styles = {
    error:
      'border-red-200 bg-red-50/90 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
    warning:
      'border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
    success:
      'border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
    info: 'border-sky-200 bg-sky-50/90 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  }
  const icons = {
    error: XCircle,
    warning: AlertTriangle,
    success: CheckCircle2,
    info: MapPin,
  }
  const Icon = icons[tone]

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm ${styles[tone]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-bold">{title}</p>}
        {children}
      </div>
    </motion.div>
  )
}

interface BinaryQuestionProps {
  label: string
  value: boolean | null | undefined
  onChange: (value: boolean) => void
  positiveLabel?: string
  negativeLabel?: string
  description?: string
}

const BinaryQuestion = ({
  label,
  value,
  onChange,
  positiveLabel = 'Sí',
  negativeLabel = 'No',
  description,
}: BinaryQuestionProps) => (
  <div
    className={`space-y-3 rounded-2xl border p-3.5 transition sm:p-4 ${
      value === null || value === undefined
        ? 'border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-950/40'
        : value
          ? 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10'
          : 'border-red-200/80 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/10'
    }`}
  >
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {(value === null || value === undefined) && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          Pendiente
        </span>
      )}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(true)}
        className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
          value === true
            ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-emerald-950/30'
        }`}
      >
        <Check className="h-4 w-4" />
        {positiveLabel}
      </button>
      <button
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(false)}
        className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
          value === false
            ? 'border-red-600 bg-red-600 text-white shadow-md shadow-red-600/25'
            : 'border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-red-950/30'
        }`}
      >
        <X className="h-4 w-4" />
        {negativeLabel}
      </button>
    </div>
  </div>
)

/**
 * Selector de tres estados para la norma gráfica.
 *
 * Un sí/no no basta aquí: una PPU despintada y una PPU ausente se resuelven de
 * formas distintas (una se repinta, la otra se instala), y con dos opciones el
 * inspector se ve obligado a elegir la menos falsa.
 */
const ESTADOS_NORMA = [
  {
    valor: 'OK' as const,
    label: 'Conforme',
    activo: 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25',
    inactivo: 'hover:border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
  },
  {
    valor: 'DETERIORADO' as const,
    label: 'Deteriorado',
    activo: 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25',
    inactivo: 'hover:border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30',
  },
  {
    valor: 'FALTA' as const,
    label: 'Falta',
    activo: 'border-red-600 bg-red-600 text-white shadow-md shadow-red-600/25',
    inactivo: 'hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30',
  },
]

const EstadoNormaQuestion = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description?: string
  value: EstadoNormaValor
  onChange: (value: 'OK' | 'DETERIORADO' | 'FALTA') => void
}) => (
  <div
    className={`space-y-2.5 rounded-2xl border p-3.5 transition sm:p-4 ${
      value === null
        ? 'border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-950/40'
        : value === 'OK'
          ? 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10'
          : value === 'DETERIORADO'
            ? 'border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/10'
            : 'border-red-200/80 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/10'
    }`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {value === null && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          Pendiente
        </span>
      )}
    </div>
    <div className="grid grid-cols-3 gap-2">
      {ESTADOS_NORMA.map((estado) => (
        <button
          key={estado.valor}
          type="button"
          aria-pressed={value === estado.valor}
          onClick={() => onChange(estado.valor)}
          className={`flex min-h-[44px] items-center justify-center rounded-xl border px-2 py-2 text-[12.5px] font-semibold transition active:scale-[0.98] ${
            value === estado.valor
              ? estado.activo
              : `border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${estado.inactivo}`
          }`}
        >
          {estado.label}
        </button>
      ))}
    </div>
  </div>
)

const SectionCard = ({
  title,
  description,
  icon: Icon,
  accent,
  badge,
  children,
}: {
  title: string
  description?: string
  icon: ComponentType<{ className?: string }>
  accent: string
  badge?: ReactNode
  children: ReactNode
}) => (
  <Card className="space-y-4 overflow-hidden border border-slate-200/70 bg-white/80 p-0 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 sm:space-y-6">
    <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/30 sm:gap-3 sm:px-6 sm:py-4">
      <div className={`rounded-xl bg-gradient-to-br ${accent} p-2 text-white shadow-lg sm:p-2.5`}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">{title}</p>
        {description && <p className="hidden text-xs text-slate-500 sm:block">{description}</p>}
      </div>
      {badge}
    </div>
    <div className="space-y-5 px-4 pb-5 sm:space-y-6 sm:px-6 sm:pb-6">{children}</div>
  </Card>
)

// ============================================================
// PÁGINA DEL FORMULARIO
// ============================================================

export const InspectionFormPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { push } = useNotificationStore()
  const methods = useForm<InspectionForm>({
    mode: 'onChange',
    defaultValues: {
      estadoBus: 'OPERATIVO',
      observacionGeneral: '',
      terminalReportado: user?.terminal ?? '',
      tag: { tiene: true, serie: '', observacion: '' },
      camaras: {
        monitorEstado: 'FUNCIONA',
        monitorDetalle: '',
        camDelantera: null,
        camCabina: null,
        camInteriores: null,
        camTrasera: null,
        visiblesMonitor: null,
        activaReversa: null,
        activaPuertas: null,
        visiblesPuertasCerradas: null,
        observacion: '',
      },
      extintores: {
        tiene: true,
        vencimientoMes: undefined,
        vencimientoAnio: undefined,
        certificacion: null,
        sonda: null,
        manometro: null,
        presion: null,
        cilindro: null,
        porta: null,
        observacion: '',
      },
      mobileye: {
        aplica: false,
        alertaIzq: null,
        alertaDer: null,
        consola: null,
        sensorFrontal: null,
        sensorIzq: null,
        sensorDer: null,
        observacion: '',
      },
      odometro: { estado: 'OK', lectura: undefined, observacion: '' },
      rack: {
        sinLlave: false,
        tieneDiscoDuro: null,
        tieneSeguridadExtra: null,
        tieneCandado: null,
        cerradurasBuenEstado: null,
        cantidadCerradurasEsperada: 2,
        observacion: '',
      },
      publicidad: {
        izquierda: { tiene: false, danio: null, residuos: null, observacion: '' },
        derecha: { tiene: false, danio: null, residuos: null, observacion: '' },
        luneta: { tiene: false, danio: null, residuos: null, observacion: '' },
      },
      wifi: {
        ppuVisible: null,
        busEncendido: null,
        tieneInternet: null,
        observacion: '',
      },
      normaGrafica: {
        internoDelantero: null,
        internoTrasero: null,
        ppuLateralDerecho: null,
        ppuTrasera: null,
        patenteDelantera: null,
        patenteTrasera: null,
        observacion: '',
      },
      mas15: {
        arranqueOk: null,
        consolaEncendida: null,
        validadorEncendido: null,
        observacion: '',
      },
    },
  })
  const [step, setStep] = useState(0)
  const [busQuery, setBusQuery] = useState('')
  // El desplegable se calculaba sólo del texto escrito, así que al elegir un
  // bus el texto pasaba a ser su PPU, seguía coincidiendo y la lista no se
  // cerraba nunca: quedaba flotando encima de la ficha del bus.
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false)
  // Revisión previa de esta semana, si la hay: se avisa con un diálogo en vez
  // de una franja de texto que pasaba desapercibida
  const [revisionPrevia, setRevisionPrevia] = useState<RevisionPrevia | null>(null)
  const [bus, setBus] = useState<Tables<'flota'> | null>(null)
  const [busAlert, setBusAlert] = useState<string | null>(null)
  // Una búsqueda a la vez y sólo manda la última: dos búsquedas solapadas se
  // pisaban los estados (el error de una aparecía junto al bus de la otra)
  const busquedaRef = useRef(0)
  const [buscando, setBuscando] = useState(false)
  /**
   * La comprobación de "bus ya revisado" está en vuelo.
   *
   * En terreno esas consultas tardan segundos, y el inspector alcanzaba a
   * empezar la revisión ANTES de que llegara el aviso: le saltaba a mitad de
   * camino, o nunca. Mientras se verifica, el paso no avanza.
   */
  const [verificandoSemana, setVerificandoSemana] = useState(false)

  // Anunciar en tiempo real qué bus se está revisando (visible en el header
  // de supervisores hasta que se termina la revisión o se cierra el formulario)
  useAnunciarInspeccion(bus, user)
  const [saving, setSaving] = useState(false)
  const [terminalDetected, setTerminalDetected] = useState<{ name: string; distance: number } | null>(null)
  const [refreshingGPS, setRefreshingGPS] = useState(false)
  const { data: flotaCatalog } = useQuery({
    queryKey: ['flota-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flota')
        .select('*')
        .order('numero_interno', { ascending: true })
      if (error) throw error
      return (data ?? []) as Tables<'flota'>[]
    },
    staleTime: 60_000,
  })
  // Estructurado (no un string unido): unir y volver a partir por " · "
  // despedazaba los mensajes que contienen ese separador
  const [validationMessage, setValidationMessage] = useState<{
    title: string
    items: string[]
  } | null>(null)
  const [wifiWaitingTime, setWifiWaitingTime] = useState(0)
  const [isWifiWaiting, setIsWifiWaiting] = useState(false)
  // Último registro real del rack, para mostrarlo y conservarlo si no hay llave
  const [ultimoRack, setUltimoRack] = useState<Tables<'rack'> | null>(null)
  const [cargandoUltimoRack, setCargandoUltimoRack] = useState(false)
  const {
    location: trackingLocation,
    error: trackingError,
    refreshLocation,
    isTracking: gpsActive,
  } = useTracking()
  const estadoBus = methods.watch('estadoBus')
  const mobileyeAplica = methods.watch('mobileye.aplica')
  const mobileyeState = methods.watch('mobileye')
  const rackState = methods.watch('rack')
  const publicityState = methods.watch('publicidad')

  const isEnPanne = estadoBus === 'EN_PANNE'

  // Pasos activos según el estado del bus:
  // EN PANNE → TAG, Extintor, Mobileye, Rack y Publicidad son OBLIGATORIOS
  // Módulos vigentes hoy según lo configurado en Configuración: un módulo
  // apagado o fuera de su programación no aparece como paso ni se guarda.
  const { clavesActivas, cargando: cargandoModulos, fallo: falloModulos } = useModulosVigentes()

  const moduloVigente = useCallback(
    (clave: ModuloClave) => clavesActivas.has(clave),
    [clavesActivas]
  )

  const activeSteps = useMemo(() => {
    const base = isEnPanne
      ? steps.filter((item) => PANNE_REQUIRED_STEPS.includes(item.key))
      : [...steps]
    return base.filter((item) => clavesActivas.has(item.key))
  }, [isEnPanne, clavesActivas])
  /**
   * Qué se revisa y qué se omite con el bus en panne, según lo que esté
   * vigente HOY.
   *
   * Antes estos nombres estaban escritos a mano en el aviso ("TAG, Extintor,
   * Mobileye, Rack y Publicidad"). Con módulos configurables eso pasó a ser
   * mentira: el aviso seguía exigiendo módulos que el supervisor había
   * apagado y callaba los que sí había añadido, mientras los pasos reales del
   * formulario decían otra cosa.
   */
  const modulosPanne = useMemo(
    () =>
      MODULOS.filter(
        (modulo) =>
          !modulo.fijo && modulo.obligatorioEnPanne && clavesActivas.has(modulo.clave)
      ),
    [clavesActivas]
  )

  const modulosOmitidosPanne = useMemo(
    () =>
      MODULOS.filter(
        (modulo) =>
          !modulo.fijo && modulo.requiereBusOperativo && clavesActivas.has(modulo.clave)
      ),
    [clavesActivas]
  )

  /** Pasos que tendría el flujo con el bus operativo */
  const pasosOperativo = useMemo(
    () => steps.filter((item) => clavesActivas.has(item.key)).length,
    [clavesActivas]
  )

  const listar = (nombres: string[]) =>
    nombres.length <= 1
      ? nombres.join('')
      : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

  /**
   * Por qué no hay nada que revisar, cuando no lo hay.
   *
   * No es lo mismo "todos los módulos vigentes necesitan el bus encendido"
   * que "no hay ningún módulo activo": el primero es una consecuencia del
   * estado del bus y el segundo, de la configuración. Confundirlos manda al
   * supervisor a buscar el problema donde no está.
   */
  const motivoSinModulosEnPanne =
    modulosOmitidosPanne.length > 0
      ? 'Todos los módulos vigentes requieren el bus encendido, así que sólo se registrará el estado y el cierre.'
      : 'No hay módulos activos en Configuración: sólo se registrará el estado y el cierre.'

  const currentStep = Math.min(step, activeSteps.length - 1)
  const stepKey: StepKey = activeSteps[currentStep].key
  const progressPct = activeSteps.length > 1 ? (currentStep / (activeSteps.length - 1)) * 100 : 0

  // La restauración del borrador puede cambiar estadoBus; sin esta marca, el
  // efecto de abajo devolvería al paso 0 justo después de restaurar el paso
  const restaurandoRef = useRef(false)

  // Al cambiar el estado del bus cambia el flujo de pasos → volver al inicio
  useEffect(() => {
    if (restaurandoRef.current) {
      restaurandoRef.current = false
      return
    }
    setStep(0)
    setValidationMessage(null)
  }, [estadoBus])

  /*
   * Con un bus seleccionado, la sesión no caduca y todo cambio se guarda.
   *
   * La bandera de inspección en curso frena el cierre por inactividad: el
   * procedimiento de +15 deja el teléfono sin tocar más de diez minutos y el
   * cierre botaba la revisión a medias.
   */
  useEffect(() => {
    marcarInspeccionEnCurso(bus !== null)
    return () => marcarInspeccionEnCurso(false)
  }, [bus])

  // Restaurar el borrador al montar: si quedó una revisión a medias, se
  // retoma con su bus, sus respuestas y su paso exactos.
  useEffect(() => {
    if (!user) return
    const borrador = leerBorrador(user.rut)
    if (!borrador) return

    restaurandoRef.current = true
    setBus(borrador.bus)
    setBusQuery(borrador.bus.ppu)
    methods.reset(borrador.valores)
    setStep(borrador.paso)
    push({
      id: `borrador-${borrador.bus.ppu}-${borrador.guardadoEn}`,
      type: 'info',
      title: 'Revisión recuperada',
      body: `Continúa el bus ${borrador.bus.ppu} donde quedaste.`,
    })
    // Sólo al montar: restaurar de nuevo pisaría lo que se esté escribiendo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Guardar el borrador: al elegir bus, al cambiar de paso y en cada cambio
  // del formulario (con un pequeño freno para no escribir por cada tecla)
  useEffect(() => {
    if (!bus || !user) return

    let temporizador: number | undefined
    const guardar = () => {
      try {
        const borrador: BorradorInspeccion = {
          version: BORRADOR_VERSION,
          rut: user.rut,
          guardadoEn: new Date().toISOString(),
          paso: step,
          bus,
          valores: methods.getValues(),
        }
        window.localStorage.setItem(BORRADOR_KEY, JSON.stringify(borrador))
      } catch {
        // Almacenamiento lleno o bloqueado: la app sigue, sin borrador
      }
    }

    guardar()
    const subscripcion = methods.watch(() => {
      if (temporizador) window.clearTimeout(temporizador)
      temporizador = window.setTimeout(guardar, 700)
    })

    return () => {
      subscripcion.unsubscribe()
      if (temporizador) window.clearTimeout(temporizador)
    }
  }, [bus, user, step, methods])

  const expectedRackLocks = useMemo(() => {
    const marca = bus?.marca?.toLowerCase() ?? ''
    return marca.includes('volvo') ? 4 : 2
  }, [bus?.marca])
  const suggestions = useMemo(() => {
    const query = busQuery.trim().toUpperCase()
    if (!sugerenciasAbiertas || !query || !flotaCatalog) return []
    return flotaCatalog
      .filter(
        (record) =>
          record.ppu.toUpperCase().includes(query) ||
          record.numero_interno.toUpperCase().includes(query)
      )
      .slice(0, 5)
  }, [busQuery, flotaCatalog, sugerenciasAbiertas])

  // Auto-relleno de publicidad: SOLO cuando cambia el "tiene" de ese lateral.
  // Antes se recorrían los tres lados en cada ejecución y tocar un lateral
  // borraba los daños/residuos ya marcados en los otros dos.
  const prevPublicidadTiene = useRef<Record<PublicidadAreaKey, boolean | null>>({
    izquierda: null,
    derecha: null,
    luneta: null,
  })

  useEffect(() => {
    publicityAreas.forEach((area) => {
      const tiene = publicityState[area.key].tiene
      const previo = prevPublicidadTiene.current[area.key]
      if (previo === tiene) return
      prevPublicidadTiene.current[area.key] = tiene

      // Al marcar que TIENE publicidad → precargar Sin daño + Limpio (editable)
      if (tiene === true) {
        methods.setValue(`publicidad.${area.key}.danio`, false, { shouldDirty: true })
        methods.setValue(`publicidad.${area.key}.residuos`, false, { shouldDirty: true })
      }

      // Al marcar que NO tiene → limpiar para que el inspector responda
      if (tiene === false && previo === true) {
        methods.setValue(`publicidad.${area.key}.danio`, null, { shouldDirty: true })
        methods.setValue(`publicidad.${area.key}.residuos`, null, { shouldDirty: true })
      }
    })
  }, [
    publicityState.izquierda.tiene,
    publicityState.derecha.tiene,
    publicityState.luneta.tiene,
    methods,
  ])

  const searchBus = async (override?: string) => {
    const source = override ?? busQuery
    if (!source.trim()) return
    const query = source.trim().toUpperCase()

    // Sólo la búsqueda más reciente puede tocar el estado: sin esta guardia,
    // una búsqueda lenta que llegaba tarde pisaba a la que ya había resuelto
    const intento = ++busquedaRef.current
    const vigente = () => intento === busquedaRef.current

    setBuscando(true)
    try {
      // La flota se consulta con un reintento: en terreno la primera petición
      // se cae con frecuencia y el "no pudimos buscar la PPU" era casi
      // siempre un parpadeo de red, no un problema real
      let data: unknown = null
      let error: { message: string } | null = null
      for (let intentoRed = 0; intentoRed < 2; intentoRed += 1) {
        const respuesta = await supabase
          .from('flota')
          .select('*')
          .or(`ppu.eq.${query},numero_interno.eq.${query}`)
          .maybeSingle()
        data = respuesta.data
        error = respuesta.error
        if (!error) break
        await new Promise((listo) => setTimeout(listo, 600))
      }
      if (!vigente()) return

      if (error) {
        setBus(null)
        setBusAlert('No pudimos buscar la PPU, intenta nuevamente.')
        return
      }
      if (!data) {
        setBus(null)
        setBusAlert('PPU no registrada en la flota.')
        return
      }
      const busRecord = data as Tables<'flota'>
      setBus(busRecord)
      setBusAlert(null)
      setRevisionPrevia(null)
      setVerificandoSemana(true)

      methods.setValue(
        'mobileye.aplica',
        busRecord.marca?.toLowerCase().includes('volvo') ?? false,
        { shouldDirty: true }
      )
      methods.setValue(
        'rack.cantidadCerradurasEsperada',
        busRecord.marca?.toLowerCase().includes('volvo') ? 4 : 2,
        { shouldDirty: true }
      )

      /*
       * ¿Ya está cubierto ESTA semana según lo que se está revisando?
       *
       * Con módulos configurables, "ya fue revisado" no puede significar
       * "existe una revisión de esta semana": si sólo está activo +15, un bus
       * con la inspección completa del lunes pero SIN la prueba de +15 sigue
       * pendiente. Se usa la MISMA regla que la pantalla de Pendientes.
       *
       * TODO va en un único Promise.all: encadenar la revisión y después la
       * cobertura eran dos idas a la red, y en móvil esos segundos bastaban
       * para que el aviso llegara con la revisión ya empezada.
       */
      const inicioSemana = dayjs().isoWeekday(1).startOf('day').toISOString()
      const modulosMedibles = MODULOS.filter(
        (modulo) =>
          modulo.tabla !== null &&
          clavesActivas.has(modulo.clave) &&
          // Mobileye no existe en buses no-Volvo y el formulario nunca lo
          // inserta ahí: exigirlo silenciaba este aviso para cada Scania
          moduloAplicaAlBus(modulo.clave, busRecord)
      )

      const [respuestaRevisiones, respuestaTag, ...respuestasModulos] = await Promise.all([
        supabase
          .from('revisiones')
          .select(
            'id, created_at, inspector_nombre, terminal_reportado, terminal_detectado, estado_bus'
          )
          .eq('bus_ppu', busRecord.ppu)
          .gte('created_at', inicioSemana)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('tags')
          .select('tiene, serie')
          .eq('bus_ppu', busRecord.ppu)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        ...modulosMedibles.map((modulo) =>
          supabase
            .from(modulo.tabla as 'tags')
            .select('id')
            .eq('bus_ppu', busRecord.ppu)
            .gte('created_at', inicioSemana)
            .limit(1)
            .maybeSingle()
        ),
      ])
      if (!vigente()) return

      const revisionSemana = (respuestaRevisiones.data as
        | Array<{
            id: string
            created_at: string
            inspector_nombre: string | null
            terminal_reportado: string | null
            terminal_detectado: string | null
            estado_bus: string
          }>
        | null)?.[0]

      if (revisionSemana) {
        // Un bus en panne no puede pasar los módulos que exigen arrancarlo:
        // no se le exigen, igual que en Pendientes
        const enPanneSemana = revisionSemana.estado_bus === 'EN_PANNE'
        const cobertura = modulosMedibles.map((modulo, indice) => {
          if (enPanneSemana && modulo.requiereBusOperativo) {
            return { nombre: modulo.nombre, cubierto: true, medido: false }
          }
          const respuesta = respuestasModulos[indice]
          // Tabla aún sin crear: no se puede exigir lo que no se puede medir
          if (respuesta.error) return { nombre: modulo.nombre, cubierto: true, medido: false }
          return { nombre: modulo.nombre, cubierto: respuesta.data !== null, medido: true }
        })

        if (!cobertura.some((resultado) => !resultado.cubierto)) {
          setRevisionPrevia({
            ppu: busRecord.ppu,
            interno: busRecord.numero_interno,
            terminal:
              revisionSemana.terminal_reportado ||
              revisionSemana.terminal_detectado ||
              busRecord.terminal,
            fecha: revisionSemana.created_at,
            inspector: revisionSemana.inspector_nombre ?? 'otro inspector',
            modulosCubiertos: cobertura
              .filter((resultado) => resultado.medido)
              .map((resultado) => resultado.nombre),
          })
        }
      }

      // Auto-relleno del TAG con su último registro conocido
      const lastTag = respuestaTag.data
      if (!respuestaTag.error && lastTag) {
        if (lastTag.tiene === true && lastTag.serie) {
          methods.setValue('tag.tiene', true, { shouldDirty: true })
          methods.setValue('tag.serie', lastTag.serie, { shouldDirty: true })
          methods.setValue('tag.observacion', '', { shouldDirty: true })
        } else if (lastTag.tiene === false) {
          methods.setValue('tag.tiene', false, { shouldDirty: true })
          methods.setValue('tag.serie', '', { shouldDirty: true })
          methods.setValue('tag.observacion', '', { shouldDirty: true })
        }
        // Con TAG pero sin serie se conserva el valor por defecto (instalado)
      }
    } catch (err) {
      console.error('Error in searchBus:', err)
      if (!vigente()) return
      setBus(null)
      setBusAlert('Error al buscar el bus. Intenta nuevamente.')
    } finally {
      if (vigente()) {
        setBuscando(false)
        setVerificandoSemana(false)
      }
    }
  }

  useEffect(() => {
    let isMounted = true

    if (!trackingLocation) {
      if (isMounted) setTerminalDetected(null)
      return
    }

    const detected = detectTerminal(trackingLocation.lat, trackingLocation.lon)
    if (!detected) {
      if (isMounted) setTerminalDetected(null)
      return
    }

    if (isMounted) {
      setTerminalDetected({ name: detected.terminal, distance: detected.distance })
      const currentTerminal = methods.getValues('terminalReportado')
      if (!currentTerminal || currentTerminal === user?.terminal) {
        methods.setValue('terminalReportado', detected.terminal, { shouldDirty: true })
      }
    }

    return () => {
      isMounted = false
    }
  }, [trackingLocation, methods, user?.terminal])

  // Auto-rellenar TAG cuando se cambia al paso "tag" si hay un bus seleccionado
  useEffect(() => {
    const loadLastTag = async () => {
      if (stepKey === 'tag' && bus?.ppu) {
        const currentTagTiene = methods.getValues('tag.tiene')
        const currentTagSerie = methods.getValues('tag.serie')

        // Solo auto-rellenar si no hay valores ya establecidos (evitar sobrescribir)
        if (currentTagTiene === true && !currentTagSerie) {
          try {
            const { data: lastTag, error: tagError } = await supabase
              .from('tags')
              .select('tiene, serie')
              .eq('bus_ppu', bus.ppu)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (!tagError && lastTag) {
              // Si el último registro tiene TAG instalado y tiene serie, auto-rellenar
              if (lastTag.tiene === true && lastTag.serie) {
                methods.setValue('tag.serie', lastTag.serie, { shouldDirty: true })
              } else if (lastTag.tiene === false) {
                // Si el último registro dice que NO tiene TAG, cambiar a "No tiene"
                methods.setValue('tag.tiene', false, { shouldDirty: true })
                methods.setValue('tag.serie', '', { shouldDirty: true })
                methods.setValue('tag.observacion', '', { shouldDirty: true })
              }
            }
          } catch (err) {
            console.error('Error al cargar último TAG:', err)
          }
        }
      }
    }

    loadLastTag()
  }, [stepKey, bus?.ppu, methods])

  useEffect(() => {
    let isMounted = true
    const ppuParam = searchParams.get('ppu')

    if (ppuParam && isMounted) {
      const normalized = ppuParam.toUpperCase()
      setBusQuery(normalized)
      searchBus(normalized)
      const next = new URLSearchParams(searchParams.toString())
      next.delete('ppu')
      setSearchParams(next, { replace: true })
    }

    return () => {
      isMounted = false
    }
  }, [searchParams, setSearchParams])

  // Al marcar "sin llave" se busca el último registro real para mostrar
  // exactamente qué información se va a conservar
  useEffect(() => {
    let vigente = true
    if (!rackState.sinLlave || !bus?.ppu) {
      setUltimoRack(null)
      setCargandoUltimoRack(false)
      return
    }

    setCargandoUltimoRack(true)
    fetchUltimoRackReal(bus.ppu)
      .then((registro) => {
        if (vigente) setUltimoRack(registro)
      })
      .finally(() => {
        if (vigente) setCargandoUltimoRack(false)
      })

    return () => {
      vigente = false
    }
  }, [rackState.sinLlave, bus?.ppu])

  // Timer de espera WiFi de 3 minutos
  useEffect(() => {
    if (isWifiWaiting && wifiWaitingTime < 180) {
      const timer = setTimeout(() => {
        setWifiWaitingTime(wifiWaitingTime + 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (isWifiWaiting && wifiWaitingTime >= 180) {
      setIsWifiWaiting(false)
      setWifiWaitingTime(0)
    }
  }, [isWifiWaiting, wifiWaitingTime])

  const handleNext = () => {
    // La comprobación de "bus ya revisado" sigue en vuelo: avanzar ahora era
    // exactamente el hueco por el que el aviso llegaba a mitad de revisión
    if (verificandoSemana) {
      setValidationMessage({
        title: 'Un segundo',
        items: ['Estamos verificando si este bus ya fue revisado esta semana.'],
      })
      return
    }
    // VALIDACIÓN GPS: Bloquear navegación si no hay GPS (solo para buses OPERATIVOS)
    if (!isEnPanne && (!gpsActive || !trackingLocation)) {
      setValidationMessage({
        title: 'GPS requerido',
        items: ['Debes autorizar el GPS para continuar. Usa el botón "Activar GPS".'],
      })
      return
    }
    attemptNavigateToStep(Math.min(currentStep + 1, activeSteps.length - 1))
  }
  const handlePrev = () => {
    attemptNavigateToStep(Math.max(currentStep - 1, 0))
  }

  const getMissingForStep = (
    targetKey: StepKey,
    values?: InspectionForm,
    options?: { shallow?: boolean }
  ): string[] => {
    const snapshot = values ?? methods.getValues()
    const missing: string[] = []

    const requireBoolean = (value: boolean | null | undefined, label: string) => {
      if (value === null || value === undefined) {
        missing.push(label)
      }
    }

    switch (targetKey) {
      case 'estado':
        if (!snapshot.terminalReportado?.trim()) {
          missing.push('Selecciona el terminal detectado')
        }
        break
      case 'tag':
        if (typeof snapshot.tag.tiene !== 'boolean') {
          missing.push('Indica si el bus tiene TAG')
        } else if (snapshot.tag.tiene && !snapshot.tag.serie?.trim()) {
          missing.push('Ingresa la serie del TAG')
        } else if (!snapshot.tag.tiene && !snapshot.tag.observacion?.trim()) {
          missing.push('Describe por qué el bus no tiene TAG')
        }
        break
      case 'camaras': {
        if (snapshot.camaras.monitorEstado === 'FUNCIONA') {
          cameraHardwareQuestions.forEach((item) =>
            requireBoolean(snapshot.camaras[item.field], `Cámaras · ${item.label}`)
          )
          requireBoolean(snapshot.camaras.visiblesMonitor, 'Cámaras · Visibilidad total')
          requireBoolean(snapshot.camaras.activaReversa, 'Cámaras · Activación con reversa')
          requireBoolean(snapshot.camaras.activaPuertas, 'Cámaras · Activación de puertas')
          requireBoolean(
            snapshot.camaras.visiblesPuertasCerradas,
            'Cámaras · Visibles con puertas cerradas'
          )
        } else if (!snapshot.camaras.observacion?.trim()) {
          missing.push('Describe la falla del monitor para generar ticket')
        }
        break
      }
      case 'extintores': {
        const ext = snapshot.extintores
        if (typeof ext.tiene !== 'boolean') {
          missing.push('Indica si el bus tiene extintor')
          break
        }
        if (ext.tiene) {
          if (ext.vencimientoMes === undefined || Number.isNaN(ext.vencimientoMes)) {
            missing.push('Extintor · Mes de vencimiento')
          }
          if (ext.vencimientoAnio === undefined || Number.isNaN(ext.vencimientoAnio)) {
            missing.push('Extintor · Año de vencimiento')
          }
          if (!ext.certificacion) missing.push('Extintor · Certificación')
          if (!ext.sonda) missing.push('Extintor · Estado de sonda')
          if (!ext.manometro) missing.push('Extintor · Manómetro')
          if (!ext.presion) missing.push('Extintor · Presión')
          if (!ext.cilindro) missing.push('Extintor · Cilindro')
          if (!ext.porta) missing.push('Extintor · Porta')
        } else if (!ext.observacion?.trim()) {
          missing.push('Extintor · Describe por qué no tiene extintor')
        }
        break
      }
      case 'mobileye': {
        if (snapshot.mobileye.aplica) {
          mobileyeQuestionList.forEach((item) =>
            requireBoolean(snapshot.mobileye[item.field], `Mobileye · ${item.label}`)
          )
        }
        break
      }
      case 'rack': {
        const rack = snapshot.rack
        // Sin llave física no se puede abrir el rack: nada es obligatorio
        if (rack.sinLlave) break
        requireBoolean(rack.cerradurasBuenEstado, 'Rack · Estado de cerraduras')
        requireBoolean(rack.tieneCandado, 'Rack · Candado instalado')
        requireBoolean(rack.tieneDiscoDuro, 'Rack · Presencia de disco duro')
        if (rack.tieneDiscoDuro === true) {
          requireBoolean(rack.tieneSeguridadExtra, 'Rack · Seguridad extra del disco')
        }
        if (
          (rack.tieneDiscoDuro === false || rack.cerradurasBuenEstado === false) &&
          !rack.observacion?.trim()
        ) {
          missing.push('Rack · Agrega observación del hallazgo')
        }
        break
      }
      case 'odometro':
        if (
          snapshot.odometro.lectura === undefined ||
          snapshot.odometro.lectura === null ||
          Number.isNaN(snapshot.odometro.lectura)
        ) {
          missing.push('Ingresa la lectura del odómetro')
        }
        break
      case 'wifi': {
        const wifi = snapshot.wifi
        if (wifi.ppuVisible === null || wifi.ppuVisible === undefined) {
          missing.push('Indica si aparece la PPU en la señal buscada')
        } else if (wifi.ppuVisible === false) {
          if (wifi.busEncendido === null || wifi.busEncendido === undefined) {
            missing.push('Indica si el bus está encendido')
          }
        } else if (wifi.ppuVisible === true) {
          if (wifi.tieneInternet === null || wifi.tieneInternet === undefined) {
            missing.push('Indica si tiene conexión a internet')
          } else if (wifi.tieneInternet === false && !wifi.observacion?.trim()) {
            missing.push('Agrega una observación sobre el problema de conexión')
          }
        }
        break
      }
      case 'normaGrafica': {
        const norma = snapshot.normaGrafica
        const conHallazgo: string[] = []
        ELEMENTOS_NORMA.forEach((elemento) => {
          const estado = norma[elemento.campo]
          if (estado === null || estado === undefined) {
            missing.push(`Norma gráfica · Evalúa ${elemento.label}`)
            return
          }
          if (estado !== 'OK') conHallazgo.push(elemento.label)
        })
        // Un elemento deteriorado o ausente termina en ticket: sin describir el
        // hallazgo, quien lo repara no sabe qué buscar
        if (conHallazgo.length > 0 && !norma.observacion?.trim()) {
          missing.push('Norma gráfica · Describe el hallazgo en la observación')
        }
        break
      }
      case 'mas15': {
        const mas15 = snapshot.mas15
        if (mas15.arranqueOk === null || mas15.arranqueOk === undefined) {
          missing.push('Indica si el bus arrancó y se encendieron consola y validador')
        } else if (mas15.arranqueOk === false) {
          if (!mas15.observacion?.trim()) {
            missing.push('Explica por qué no se pudo completar el encendido')
          }
        } else {
          if (mas15.consolaEncendida === null || mas15.consolaEncendida === undefined) {
            missing.push('Indica si la consola sigue encendida sin corta corriente')
          }
          if (mas15.validadorEncendido === null || mas15.validadorEncendido === undefined) {
            missing.push('Indica si el validador sigue encendido sin corta corriente')
          }
        }
        break
      }
      case 'publicidad':
        publicityAreas.forEach((area) => {
          const lateral = snapshot.publicidad[area.key]
          if (lateral.tiene === null || lateral.tiene === undefined) {
            missing.push(`${area.label}: indica si tiene campaña`)
            return
          }
          requireBoolean(lateral.danio, `${area.label}: define si hay daño`)
          requireBoolean(lateral.residuos, `${area.label}: define si hay residuos`)

          if (lateral.tiene) {
            if (!lateral.observacion?.trim()) {
              missing.push(`${area.label}: nombre de la campaña`)
            }
          } else if (lateral.danio === true || lateral.residuos === true) {
            // Un lateral sin publicidad y sin hallazgos es válido:
            // la observación solo se exige si hay daño o residuos
            if (!lateral.observacion?.trim()) {
              missing.push(`${area.label}: describe el daño o los residuos`)
            }
          }
        })
        break
      case 'cierre':
        if (!options?.shallow) {
          // Validar todos los pasos del flujo activo (en panne incluye
          // obligatoriamente TAG, Extintor, Mobileye, Rack y Publicidad)
          const relevantes = (
            snapshot.estadoBus === 'EN_PANNE'
              ? steps.filter((item) => PANNE_REQUIRED_STEPS.includes(item.key))
              : steps
          ).filter((item) => clavesActivas.has(item.key))
          for (const stepConfig of relevantes) {
            if (stepConfig.key === 'cierre') continue
            const childMissing = getMissingForStep(stepConfig.key, snapshot, { shallow: true })
            if (childMissing.length) {
              missing.push(`${stepConfig.label}: ${childMissing[0]}`)
            }
          }
        }
        break
    }

    return missing
  }

  const attemptNavigateToStep = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= activeSteps.length) return false
    if (targetIndex > currentStep) {
      const snapshot = methods.getValues()
      // Validar TODOS los pasos intermedios del flujo activo
      // (en panne los 5 módulos obligatorios también se validan)
      for (let current = currentStep; current < targetIndex; current++) {
        const issues = getMissingForStep(activeSteps[current].key, snapshot)
        if (issues.length) {
          setValidationMessage({ title: activeSteps[current].label, items: issues })
          setStep(current)
          return false
        }
      }
    }
    setValidationMessage(null)
    setStep(targetIndex)
    return true
  }

  const submitInspection = async (values: InspectionForm) => {
    const enPanne = values.estadoBus === 'EN_PANNE'

    // VALIDACIÓN GPS: Permitir envío sin GPS solo para buses EN_PANNE
    if (!gpsActive || !trackingLocation) {
      if (!enPanne) {
        setValidationMessage({
          title: 'No puedes enviar sin GPS activo',
          items: ['Autoriza el permiso de ubicación para continuar.'],
        })
        return
      }
      // Para buses EN_PANNE, continuar con coordenadas por defecto
      console.warn('Bus EN_PANNE enviado sin GPS - usando coordenadas por defecto')
    }

    if (currentStep !== activeSteps.length - 1) {
      attemptNavigateToStep(activeSteps.length - 1)
      return
    }

    const snapshot = methods.getValues()

    // Validar todos los pasos del flujo activo (operativo o panne)
    for (let i = 0; i < activeSteps.length; i++) {
      const issues = getMissingForStep(activeSteps[i].key, snapshot)
      if (issues.length) {
        setValidationMessage({ title: activeSteps[i].label, items: issues })
        setStep(i)
        return
      }
    }

    setValidationMessage(null)

    if (!user || !bus) {
      setBusAlert('Debes seleccionar un bus válido antes de enviar.')
      return
    }

    setSaving(true)
    try {
      // Capturar IP del usuario
      const userIP = await getUserIP()
      const ipInfo = userIP ? await getIPGeoLocation(userIP) : null

      const revisionInsert = {
        inspector_rut: user.rut,
        inspector_nombre: user.nombre,
        terminal_detectado: terminalDetected?.name ?? 'SIN_TERMINAL',
        terminal_reportado: values.terminalReportado,
        bus_ppu: bus.ppu,
        bus_interno: bus.numero_interno,
        estado_bus: values.estadoBus,
        lat: trackingLocation?.lat ?? -33.45,
        lon: trackingLocation?.lon ?? -70.66,
        observaciones: values.observacionGeneral ?? null,
        semana_iso: `${getIsoWeekYear()}-W${String(dayjs().isoWeek()).padStart(2, '0')}`,
        operativo: values.estadoBus === 'OPERATIVO',
        ip_address: userIP,
        ip_info: ipInfo ? {
          city: ipInfo.city,
          region: ipInfo.region,
          country: ipInfo.country,
          isp: ipInfo.isp,
        } : null,
      }
      const { data: revisionData, error } = await supabase
        .from('revisiones')
        .insert(revisionInsert)
        .select('id')
        .single()
      if (error) throw error

      // EN PANNE: TAG, Extintor, Mobileye, Rack y Publicidad se revisan
      // OBLIGATORIAMENTE, por lo que siempre se guardan los valores reales.
      // Solo Cámaras, Odómetro y WiFi quedan como "no revisado".

      if (moduloVigente('tag')) {
        await supabase.from('tags').insert({
          revision_id: revisionData.id,
          tiene: values.tag.tiene,
          serie: values.tag.serie || null,
          observacion: values.tag.observacion || null,
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      if (moduloVigente('camaras')) {
        await supabase.from('camaras').insert({
          revision_id: revisionData.id,
          monitor_estado: enPanne ? 'SIN_SENAL' : values.camaras.monitorEstado,
          detalle: enPanne ? {} : {
            monitorDetalle: values.camaras.monitorDetalle,
            camDelantera: values.camaras.camDelantera,
            camCabina: values.camaras.camCabina,
            camInteriores: values.camaras.camInteriores,
            camTrasera: values.camaras.camTrasera,
            visiblesMonitor: values.camaras.visiblesMonitor,
            activaReversa: values.camaras.activaReversa,
            activaPuertas: values.camaras.activaPuertas,
            visiblesPuertasCerradas: values.camaras.visiblesPuertasCerradas,
          },
          observacion: enPanne ? 'Bus en panne - no revisado' : (values.camaras.observacion || null),
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      if (moduloVigente('extintores')) {
        await supabase.from('extintores').insert({
          revision_id: revisionData.id,
          tiene: values.extintores.tiene,
          vencimiento_mes: values.extintores.vencimientoMes ?? null,
          vencimiento_anio: values.extintores.vencimientoAnio ?? null,
          certificacion: values.extintores.certificacion ?? null,
          sonda: values.extintores.sonda ?? null,
          manometro: values.extintores.manometro ?? null,
          presion: values.extintores.presion ?? null,
          cilindro: values.extintores.cilindro ?? null,
          porta: values.extintores.porta ?? null,
          observacion: values.extintores.observacion ?? null,
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      // Mobileye aplica solo a buses Volvo (operativos o en panne)
      if (moduloVigente('mobileye') && values.mobileye.aplica) {
        await supabase.from('mobileye').insert({
          revision_id: revisionData.id,
          bus_marca: bus.marca,
          alerta_izq: values.mobileye.alertaIzq ?? null,
          alerta_der: values.mobileye.alertaDer ?? null,
          consola: values.mobileye.consola ?? null,
          sensor_frontal: values.mobileye.sensorFrontal ?? null,
          sensor_izq: values.mobileye.sensorIzq ?? null,
          sensor_der: values.mobileye.sensorDer ?? null,
          observacion: values.mobileye.observacion ?? null,
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      if (moduloVigente('odometro')) {
        await supabase.from('odometro').insert({
          revision_id: revisionData.id,
          lectura: enPanne ? 0 : values.odometro.lectura,
          estado: enPanne ? 'NO_FUNCIONA' : values.odometro.estado,
          observacion: enPanne ? 'Bus en panne - no revisado' : (values.odometro.observacion ?? null),
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      // RACK · sin llave física: no se revisó, se conserva el último
      // registro real del bus (se vuelve a consultar aquí para no depender
      // de lo que se cargó en pantalla).
      const rackSinLlave = values.rack.sinLlave === true
      const rackHeredado = rackSinLlave ? await fetchUltimoRackReal(bus.ppu) : null

      const rackInsert = rackSinLlave
        ? rackHeredado
          ? {
              tiene_disco_duro: rackHeredado.tiene_disco_duro,
              tiene_seguridad_extra: rackHeredado.tiene_seguridad_extra,
              tiene_candado: rackHeredado.tiene_candado,
              cerraduras_buen_estado: rackHeredado.cerraduras_buen_estado,
              cantidad_cerraduras_esperada: rackHeredado.cantidad_cerraduras_esperada,
              observacion: `${OBS_SIN_LLAVE} · se conserva la revisión del ${dayjs(
                rackHeredado.created_at
              ).format('DD/MM/YYYY')}${
                rackHeredado.observacion ? ` · ${rackHeredado.observacion}` : ''
              }`,
            }
          : {
              tiene_disco_duro: null,
              tiene_seguridad_extra: null,
              tiene_candado: null,
              cerraduras_buen_estado: null,
              cantidad_cerraduras_esperada: values.rack.cantidadCerradurasEsperada,
              observacion: `${OBS_SIN_LLAVE} · sin registro previo para conservar`,
            }
        : {
            tiene_disco_duro: values.rack.tieneDiscoDuro,
            tiene_seguridad_extra:
              values.rack.tieneDiscoDuro !== true ? null : values.rack.tieneSeguridadExtra,
            tiene_candado: values.rack.tieneCandado,
            cerraduras_buen_estado: values.rack.cerradurasBuenEstado,
            cantidad_cerraduras_esperada: values.rack.cantidadCerradurasEsperada,
            observacion: values.rack.observacion || null,
          }

      if (moduloVigente('rack')) {
        await supabase.from('rack').insert({
          revision_id: revisionData.id,
          ...rackInsert,
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      if (moduloVigente('wifi')) {
        await supabase.from('wifi').insert({
          revision_id: revisionData.id,
          ppu_visible: enPanne ? null : (values.wifi.ppuVisible ?? null),
          bus_encendido: enPanne ? null : (values.wifi.busEncendido ?? null),
          tiene_internet: enPanne ? null : (values.wifi.tieneInternet ?? null),
          observacion: enPanne ? 'Bus en panne - no revisado' : (values.wifi.observacion || null),
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      // Norma gráfica: elementos que no quedaron conformes. Se calcula fuera
      // del insert porque también decide el ticket automático.
      const normaHallazgos = ELEMENTOS_NORMA.filter(
        (elemento) => values.normaGrafica[elemento.campo] !== 'OK'
      )

      if (moduloVigente('normaGrafica')) {
        await supabase.from('norma_grafica').insert({
          revision_id: revisionData.id,
          interno_delantero: values.normaGrafica.internoDelantero ?? 'FALTA',
          interno_trasero: values.normaGrafica.internoTrasero ?? 'FALTA',
          ppu_lateral_derecho: values.normaGrafica.ppuLateralDerecho ?? 'FALTA',
          ppu_trasera: values.normaGrafica.ppuTrasera ?? 'FALTA',
          patente_delantera: values.normaGrafica.patenteDelantera ?? 'FALTA',
          patente_trasera: values.normaGrafica.patenteTrasera ?? 'FALTA',
          // El cumplimiento se deduce, no se pregunta: los seis conformes
          cumple: normaHallazgos.length === 0,
          observacion: values.normaGrafica.observacion || null,
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      if (moduloVigente('mas15')) {
        const arranqueOk = values.mas15.arranqueOk === true
        // El resultado se deduce, no se pregunta: sólo hay +15 si AMBOS
        // equipos siguen encendidos tras retirar el corta corriente.
        const tieneMas15 = arranqueOk
          ? values.mas15.consolaEncendida === true &&
            values.mas15.validadorEncendido === true
          : null

        await supabase.from('mas15').insert({
          revision_id: revisionData.id,
          arranque_ok: arranqueOk,
          consola_encendida: arranqueOk ? values.mas15.consolaEncendida ?? null : null,
          validador_encendido: arranqueOk
            ? values.mas15.validadorEncendido ?? null
            : null,
          tiene_mas15: tieneMas15,
          observacion: values.mas15.observacion || null,
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      const publicidadTiene = publicityAreas.some((area) => values.publicidad[area.key].tiene)
      const publicidadDanio = publicityAreas.some((area) => values.publicidad[area.key].danio)
      const publicidadResiduos = publicityAreas.some((area) => values.publicidad[area.key].residuos)

      const publicidadPayload: Database['public']['Tables']['publicidad']['Insert'] = {
        revision_id: revisionData.id,
        tiene: publicidadTiene,
        danio: publicidadDanio,
        residuos: publicidadResiduos,
        detalle_lados: {
          izquierda: values.publicidad.izquierda,
          derecha: values.publicidad.derecha,
          luneta: values.publicidad.luneta,
        },
        // El nombre de la campaña se captura en la observación de cada lado con publicidad
        nombre_publicidad: (() => {
          const nombres = publicityAreas
            .map((area) => values.publicidad[area.key])
            .filter((lado) => lado.tiene && lado.observacion?.trim())
            .map((lado) => (lado.observacion as string).trim())
          return nombres.length > 0 ? [...new Set(nombres)].join(' · ') : null
        })(),
        observacion: null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      }

      if (moduloVigente('publicidad')) {
        await supabase.from('publicidad').insert(publicidadPayload)
      }

      // Tickets automáticos: los módulos obligatorios generan tickets
      // también para buses en panne (la revisión ahora es real)
      const extintorCritico =
        !values.extintores.tiene ||
        values.extintores.certificacion === 'VENCIDA' ||
        (values.extintores.presion && values.extintores.presion !== 'OPTIMO') ||
        (values.extintores.cilindro && values.extintores.cilindro !== 'OK') ||
        (values.extintores.sonda && values.extintores.sonda !== 'OK') ||
        (values.extintores.manometro && values.extintores.manometro !== 'OK') ||
        (values.extintores.porta && values.extintores.porta !== 'TIENE')

      const tickets: Array<{ modulo: string; descripcion: string }> = []
      if (extintorCritico) {
        tickets.push({ modulo: 'Extintores', descripcion: 'Hallazgos críticos en extintores' })
      }
      // Sin llave no hubo revisión real del rack: los datos son heredados,
      // así que no se generan tickets nuevos (ya existen los de su origen)
      if (!rackSinLlave) {
        if (values.rack.tieneDiscoDuro === false) {
          tickets.push({ modulo: 'Rack', descripcion: 'Rack sin disco duro detectado' })
        } else if (
          values.rack.cerradurasBuenEstado === false ||
          values.rack.tieneCandado === false ||
          values.rack.tieneSeguridadExtra === false
        ) {
          tickets.push({ modulo: 'Rack', descripcion: 'Rack con seguridad comprometida' })
        }
      }
      if (publicidadDanio || publicidadResiduos) {
        tickets.push({ modulo: 'Publicidad', descripcion: 'Publicidad con daño o residuos' })
      }
      if (
        values.mobileye.aplica &&
        [
          values.mobileye.alertaDer,
          values.mobileye.alertaIzq,
          values.mobileye.consola,
          values.mobileye.sensorDer,
          values.mobileye.sensorIzq,
          values.mobileye.sensorFrontal,
        ].some((value) => value === false)
      ) {
        tickets.push({ modulo: 'Mobileye', descripcion: 'Sensor Mobileye reportó falla' })
      }
      if (!values.tag.tiene) {
        tickets.push({ modulo: 'TAG', descripcion: 'Bus sin TAG instalado' })
      }
      if (moduloVigente('normaGrafica') && normaHallazgos.length > 0) {
        // Un solo ticket con el detalle: seis tickets por bus enterrarían la
        // bandeja y todos se resuelven en la misma visita al taller
        const detalle = normaHallazgos
          .map(
            (elemento) =>
              `${elemento.label} (${
                values.normaGrafica[elemento.campo] === 'FALTA' ? 'falta' : 'deteriorado'
              })`
          )
          .join(', ')
        tickets.push({
          modulo: 'Norma gráfica',
          descripcion: `Norma gráfica no conforme: ${detalle}`,
        })
      }

      if (tickets.length) {
        await supabase.from('tickets').insert(
          tickets.map((ticket) => ({
            revision_id: revisionData.id,
            descripcion: enPanne ? `${ticket.descripcion} (bus en panne)` : ticket.descripcion,
            modulo: ticket.modulo,
            estado: 'PENDIENTE' as const,
            prioridad: 'ALTA' as const,
            terminal: values.terminalReportado,
          }))
        )
      }

      push({
        id: revisionData.id,
        title: 'Revisión enviada',
        body: `Bus ${bus.ppu} · ${values.terminalReportado}`,
      })

      // Si no hay llaves disponibles suele ser así todo el turno: se conserva
      // la elección para no re-marcarla en cada bus
      const conservarSinLlave = values.rack.sinLlave
      // La revisión ya está en la base de datos: el borrador cumplió
      limpiarBorrador()
      methods.reset()
      if (conservarSinLlave) {
        methods.setValue('rack.sinLlave', true)
      }
      setBus(null)
      setBusQuery('')
      setStep(0)
    } catch (error) {
      console.error(error)
      setBusAlert('No pudimos guardar la revisión. Intenta nuevamente.')
    } finally {
      setSaving(false)
    }
  }

  const handleRefreshGps = async () => {
    setRefreshingGPS(true)
    try {
      await refreshLocation()
    } finally {
      setRefreshingGPS(false)
    }
  }

  // ============================================================
  // RENDERIZADO DE PASOS
  // ============================================================

  const renderEstado = () => (
    <SectionCard
      title="Estado del bus"
      description="Valida condiciones generales antes de continuar"
      icon={ClipboardCheck}
      accent="from-brand-500 to-indigo-500"
    >
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <div>
          <Label>Estado operativo</Label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => methods.setValue('estadoBus', 'OPERATIVO')}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-4 transition active:scale-[0.98] sm:gap-2 sm:px-4 sm:py-5 ${
                estadoBus === 'OPERATIVO'
                  ? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/10 dark:bg-emerald-950/30'
                  : 'border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <CheckCircle2
                className={`h-7 w-7 ${estadoBus === 'OPERATIVO' ? 'text-emerald-600' : 'text-slate-300'}`}
              />
              <span
                className={`text-sm font-bold ${
                  estadoBus === 'OPERATIVO'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-500'
                }`}
              >
                Operativo
              </span>
              <span className="text-[10px] text-slate-400">
                Revisión completa · {pasosOperativo} pasos
              </span>
            </button>
            <button
              type="button"
              onClick={() => methods.setValue('estadoBus', 'EN_PANNE')}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-4 transition active:scale-[0.98] sm:gap-2 sm:px-4 sm:py-5 ${
                estadoBus === 'EN_PANNE'
                  ? 'border-red-500 bg-red-50 shadow-lg shadow-red-500/10 dark:bg-red-950/30'
                  : 'border-slate-200 bg-white hover:border-red-300 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <AlertTriangle
                className={`h-7 w-7 ${estadoBus === 'EN_PANNE' ? 'text-red-600' : 'text-slate-300'}`}
              />
              <span
                className={`text-sm font-bold ${
                  estadoBus === 'EN_PANNE' ? 'text-red-700 dark:text-red-300' : 'text-slate-500'
                }`}
              >
                En panne
              </span>
              <span className="text-[10px] text-slate-400">
                {modulosPanne.length}{' '}
                {modulosPanne.length === 1 ? 'módulo obligatorio' : 'módulos obligatorios'}
              </span>
            </button>
          </div>

          {isEnPanne && (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 dark:border-red-900/50 dark:bg-red-950/30">
              <p className="text-sm font-bold text-red-800 dark:text-red-200">
                Bus en panne · revisión obligatoria de:
              </p>
              {modulosPanne.length === 0 ? (
                <p className="mt-2 text-xs text-red-700/80 dark:text-red-300/80">
                  {motivoSinModulosEnPanne}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {modulosPanne.map((modulo) => (
                    <span
                      key={modulo.clave}
                      className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700 dark:bg-red-900/50 dark:text-red-200"
                    >
                      {modulo.nombre}
                    </span>
                  ))}
                </div>
              )}
              {modulosOmitidosPanne.length > 0 && (
                <p className="mt-2 text-xs text-red-700/80 dark:text-red-300/80">
                  {listar(modulosOmitidosPanne.map((modulo) => modulo.nombre))} se{' '}
                  {modulosOmitidosPanne.length === 1 ? 'omite' : 'omiten'} porque{' '}
                  {modulosOmitidosPanne.length === 1 ? 'requiere' : 'requieren'} el bus
                  operativo.
                </p>
              )}
            </div>
          )}
        </div>
        <div>
          <Label>Terminal</Label>
          <Input
            value={methods.watch('terminalReportado')}
            onChange={(event) => methods.setValue('terminalReportado', event.target.value)}
          />
          {/* Sólo el terminal, no la telemetría. Las coordenadas, la precisión
              y el botón de refrescar no le dicen nada a quien está de pie
              junto a un bus: lo único que necesita confirmar es que la app
              reconoció el terminal correcto. Si el GPS falla, el aviso rojo
              del encabezado ya lo explica y ofrece reintentar. */}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs">
            <MapPin
              className={`h-3.5 w-3.5 shrink-0 ${
                terminalDetected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
              }`}
            />
            <span className="text-slate-500 dark:text-slate-400">Terminal detectado:</span>
            <span
              className={`font-semibold ${
                terminalDetected
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {terminalDetected ? terminalDetected.name : 'sin detectar'}
            </span>
          </p>
        </div>
      </div>
      <div>
        <Label>Observación general (opcional)</Label>
        <Textarea
          placeholder="Detalles adicionales sobre el estado del bus"
          value={methods.watch('observacionGeneral')}
          onChange={(event) => methods.setValue('observacionGeneral', event.target.value)}
        />
      </div>
    </SectionCard>
  )

  const renderTag = () => (
    <SectionCard
      title="TAG"
      description="Valida instalación y serie"
      icon={Tag}
      accent="from-amber-500 to-yellow-500"
      badge={isEnPanne ? <ObligatorioBadge /> : undefined}
    >
      <BinaryQuestion
        label="¿El bus tiene TAG?"
        value={methods.watch('tag.tiene')}
        positiveLabel="Instalado"
        negativeLabel="No tiene"
        onChange={(value) => methods.setValue('tag.tiene', value)}
      />
      {methods.watch('tag.tiene') ? (
        <div>
          <Label>Serie</Label>
          <Input
            className="mt-2"
            placeholder="Ingresa la serie"
            value={methods.watch('tag.serie') ?? ''}
            onChange={(event) => methods.setValue('tag.serie', event.target.value)}
          />
        </div>
      ) : (
        <div>
          <Label>Observación</Label>
          <Textarea
            className="mt-2"
            placeholder="Describe por qué no tiene TAG"
            value={methods.watch('tag.observacion') ?? ''}
            onChange={(event) => methods.setValue('tag.observacion', event.target.value)}
          />
        </div>
      )}
    </SectionCard>
  )

  const renderCamaras = () => {
    const camaras = methods.watch('camaras')
    const monitorEstado = camaras.monitorEstado
    const monitorActivo = monitorEstado === 'FUNCIONA'
    return (
      <SectionCard
        title="Cámaras"
        description="Preguntas específicas por componente"
        icon={Camera}
        accent="from-blue-500 to-sky-500"
      >
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          <div>
            <Label>Estado del Monitor</Label>
            <select
              value={camaras.monitorEstado}
              onChange={(e) => methods.setValue('camaras.monitorEstado', e.target.value as InspectionForm['camaras']['monitorEstado'])}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="FUNCIONA">Funciona Correctamente</option>
              <option value="APAGADO">Apagado / Sin Energía</option>
              <option value="CON_DAÑO">Con Daño Físico</option>
              <option value="SIN_SENAL">Sin Señal de Cámaras</option>
            </select>
          </div>
          <div>
            <Label>Detalle del Monitor</Label>
            <Textarea
              className="mt-2"
              placeholder="Ej: Cámara 2 sin señal, monitor con golpe"
              value={camaras.monitorDetalle ?? ''}
              onChange={(event) => methods.setValue('camaras.monitorDetalle', event.target.value)}
            />
          </div>
        </div>
        {monitorActivo ? (
          <>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {cameraHardwareQuestions.map((item) => (
                <BinaryQuestion
                  key={item.field}
                  label={`${item.label} (estado físico)`}
                  positiveLabel="Operativa"
                  negativeLabel="Con daño"
                  value={camaras[item.field]}
                  onChange={(value) =>
                    methods.setValue(`camaras.${item.field}` as CameraPath, value, {
                      shouldDirty: true,
                    })
                  }
                />
              ))}
            </div>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <BinaryQuestion
                label="¿Todas las cámaras son visibles?"
                value={camaras.visiblesMonitor}
                onChange={(value) => methods.setValue('camaras.visiblesMonitor', value)}
              />
              <BinaryQuestion
                label="¿La cámara trasera se activa con reversa?"
                value={camaras.activaReversa}
                onChange={(value) => methods.setValue('camaras.activaReversa', value)}
              />
              <BinaryQuestion
                label="¿Las cámaras de puertas se activan al abrirse?"
                value={camaras.activaPuertas}
                onChange={(value) => methods.setValue('camaras.activaPuertas', value)}
              />
              <BinaryQuestion
                label="¿Se muestran con puertas cerradas?"
                value={camaras.visiblesPuertasCerradas}
                onChange={(value) => methods.setValue('camaras.visiblesPuertasCerradas', value)}
              />
            </div>
          </>
        ) : (
          <AlertBanner tone="warning">
            El monitor no está operativo, por lo que no se continuó con la revisión de cámaras.
            Describe la falla para generar el ticket correspondiente.
          </AlertBanner>
        )}
        <div>
          <Label>Observaciones {monitorActivo ? '' : '(obligatorio)'}</Label>
          <Textarea
            className="mt-2"
            value={camaras.observacion ?? ''}
            onChange={(event) => methods.setValue('camaras.observacion', event.target.value)}
          />
        </div>
      </SectionCard>
    )
  }

  const renderExtintores = () => {
    const tieneExtintor = methods.watch('extintores.tiene')
    return (
      <SectionCard
        title="Extintores"
        description="Completa vencimientos y estado físico"
        icon={Flame}
        accent="from-red-500 to-orange-500"
        badge={isEnPanne ? <ObligatorioBadge /> : undefined}
      >
        <BinaryQuestion
          label="¿Tiene extintor instalado?"
          value={tieneExtintor}
          onChange={(value) => methods.setValue('extintores.tiene', value, { shouldDirty: true })}
        />
        {tieneExtintor ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <div>
                <Label>Mes de vencimiento</Label>
                <Input
                  type="number"
                  placeholder="Ej: 05"
                  className="mt-2"
                  value={methods.watch('extintores.vencimientoMes') ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    methods.setValue('extintores.vencimientoMes', value === '' ? undefined : Number(value), {
                      shouldDirty: true,
                    })
                  }}
                />
              </div>
              <div>
                <Label>Año de vencimiento</Label>
                <Input
                  type="number"
                  placeholder="Ej: 2025"
                  className="mt-2"
                  value={methods.watch('extintores.vencimientoAnio') ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    methods.setValue('extintores.vencimientoAnio', value === '' ? undefined : Number(value), {
                      shouldDirty: true,
                    })
                  }}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              {extinguisherFieldConfig.map((field) => (
                <div key={field.key}>
                  <Label>{field.label}</Label>
                  <Select
                    value={methods.watch(`extintores.${field.key}` as `extintores.${ExtintorFieldKey}`) ?? undefined}
                    onValueChange={(value) =>
                      methods.setValue(
                        `extintores.${field.key}` as `extintores.${ExtintorFieldKey}`,
                        value as InspectionForm['extintores'][typeof field.key],
                        { shouldDirty: true }
                      )
                    }
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder={field.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea
                className="mt-2"
                rows={3}
                placeholder="Detalle certificación, sonda, cilindro o daños visibles"
                value={methods.watch('extintores.observacion') ?? ''}
                onChange={(event) =>
                  methods.setValue('extintores.observacion', event.target.value, { shouldDirty: true })
                }
              />
            </div>
          </div>
        ) : (
          <div>
            <Label>Observación (obligatorio)</Label>
            <Textarea
              className="mt-2"
              placeholder="Describe por qué el bus no tiene extintor"
              value={methods.watch('extintores.observacion') ?? ''}
              onChange={(event) =>
                methods.setValue('extintores.observacion', event.target.value, { shouldDirty: true })
              }
            />
          </div>
        )}
      </SectionCard>
    )
  }

  const renderMobileye = () => (
    <SectionCard
      title="Mobileye"
      description="Aplica solo a buses Volvo"
      icon={Radar}
      accent="from-purple-500 to-violet-500"
      badge={isEnPanne ? <ObligatorioBadge /> : undefined}
    >
      <BinaryQuestion
        label="¿Este bus cuenta con Mobileye?"
        value={mobileyeAplica}
        positiveLabel="Sí, aplica"
        negativeLabel="No aplica"
        onChange={(value) => methods.setValue('mobileye.aplica', value)}
      />
      {mobileyeAplica && (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mobileyeQuestionList.map((item) => (
            <BinaryQuestion
              key={item.field}
              label={item.label}
              value={mobileyeState?.[item.field] ?? null}
              positiveLabel="OK"
              negativeLabel="Falla"
              onChange={(value) =>
                methods.setValue(`mobileye.${item.field}` as MobileyePath, value, { shouldDirty: true })
              }
            />
          ))}
        </div>
      )}
    </SectionCard>
  )

  const renderRack = () => (
    <SectionCard
      title="Rack"
      description="Control de cerraduras y seguridad del disco duro"
      icon={HardDrive}
      accent="from-slate-500 to-slate-600"
      badge={
        rackState.sinLlave ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            Sin llave · omitido
          </span>
        ) : isEnPanne ? (
          <ObligatorioBadge />
        ) : undefined
      }
    >
      {/* Disponibilidad de llave física */}
      <div>
        <Label>¿Tienes la llave del rack?</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => methods.setValue('rack.sinLlave', false, { shouldDirty: true })}
            className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              !rackState.sinLlave
                ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <KeyRound className="h-4 w-4" />
            Con llave
          </button>
          <button
            type="button"
            onClick={() => methods.setValue('rack.sinLlave', true, { shouldDirty: true })}
            className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              rackState.sinLlave
                ? 'border-amber-600 bg-amber-600 text-white shadow-md shadow-amber-600/25'
                : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <KeyRound className="h-4 w-4" />
            Sin llave
          </button>
        </div>
      </div>

      {rackState.sinLlave ? (
        /* SIN LLAVE: se omite la revisión y se conserva el último registro real */
        <div className="space-y-3">
          <AlertBanner tone="warning" title="Rack omitido · sin llave física">
            No es obligatorio responder este módulo. Se guardará la última revisión real de este
            bus, sin generar tickets nuevos.
          </AlertBanner>

          {!bus ? (
            <p className="text-xs text-slate-500">Selecciona un bus para ver qué se conservará.</p>
          ) : cargandoUltimoRack ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/70 p-4 text-sm text-slate-500 dark:border-slate-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando la última revisión del rack…
            </div>
          ) : ultimoRack ? (
            <div className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Se conservará esta revisión
                </p>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {dayjs(ultimoRack.created_at).format('DD/MM/YYYY')}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  ['Disco duro', ultimoRack.tiene_disco_duro],
                  ['Seguridad extra', ultimoRack.tiene_seguridad_extra],
                  ['Candado', ultimoRack.tiene_candado],
                  ['Cerraduras en buen estado', ultimoRack.cerraduras_buen_estado],
                ].map(([label, valor]) => (
                  <div
                    key={label as string}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-xs dark:border-slate-800/70"
                  >
                    <span className="text-slate-500">{label as string}</span>
                    <span
                      className={`font-bold ${
                        valor === true
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : valor === false
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {valor === true ? 'Sí' : valor === false ? 'No' : 'Sin dato'}
                    </span>
                  </div>
                ))}
              </div>
              {ultimoRack.observacion && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Observación original: “{ultimoRack.observacion}”
                </p>
              )}
            </div>
          ) : (
            <AlertBanner tone="info">
              Este bus no tiene una revisión previa del rack para conservar. Se registrará como
              “sin llave · sin registro previo”.
            </AlertBanner>
          )}
        </div>
      ) : (
        <>
      <div className="rounded-2xl border border-blue-200/70 bg-blue-50/60 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
        <p className="font-semibold">
          {bus?.marca?.toLowerCase().includes('volvo') ? 'Volvo' : 'Scania/Otros'}: se esperan{' '}
          {expectedRackLocks} cerraduras en el rack.
        </p>
        <p className="mt-1 text-xs text-blue-800/80 dark:text-blue-200/80">
          Este valor se registra automáticamente según la marca del bus.
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <BinaryQuestion
          label="¿Las cerraduras están en buen estado?"
          value={rackState.cerradurasBuenEstado}
          positiveLabel="Buen estado"
          negativeLabel="Con falla"
          onChange={(value) => methods.setValue('rack.cerradurasBuenEstado', value, { shouldDirty: true })}
        />
        <BinaryQuestion
          label="¿Tiene candado instalado?"
          value={rackState.tieneCandado}
          positiveLabel="Con candado"
          negativeLabel="Sin candado"
          onChange={(value) => methods.setValue('rack.tieneCandado', value, { shouldDirty: true })}
        />
        <BinaryQuestion
          label="¿Tiene disco duro principal?"
          value={rackState.tieneDiscoDuro}
          positiveLabel="Sí tiene disco"
          negativeLabel="No tiene disco"
          onChange={(value) => {
            methods.setValue('rack.tieneDiscoDuro', value, { shouldDirty: true })
            if (value === false) {
              methods.setValue('rack.tieneSeguridadExtra', null, { shouldDirty: true })
            }
          }}
        />
        {rackState.tieneDiscoDuro === true ? (
          <BinaryQuestion
            label="¿El disco tiene seguridad extra?"
            value={rackState.tieneSeguridadExtra}
            positiveLabel="Con seguridad extra"
            negativeLabel="Sin seguridad extra"
            onChange={(value) => methods.setValue('rack.tieneSeguridadExtra', value, { shouldDirty: true })}
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Disco duro no encontrado. Registra observaciones para seguimiento semanal.
          </div>
        )}
      </div>

      <div>
        <Label>Observación de rack</Label>
        <Textarea
          className="mt-2"
          placeholder="Ej: Disco ausente, cerradura forzada, sin candado, etc."
          value={rackState.observacion ?? ''}
          onChange={(event) => methods.setValue('rack.observacion', event.target.value, { shouldDirty: true })}
        />
      </div>
        </>
      )}
    </SectionCard>
  )

  const renderOdometro = () => (
    <SectionCard
      title="Odómetro"
      description="Captura lectura real"
      icon={Gauge}
      accent="from-teal-500 to-emerald-500"
    >
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <div>
          <Label>Lectura</Label>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Ej: 145200"
            value={(() => {
              const lectura = methods.watch('odometro.lectura')
              if (lectura === undefined || Number.isNaN(lectura)) return ''
              return lectura.toString()
            })()}
            onChange={(event) => {
              const raw = event.target.value
              methods.setValue(
                'odometro.lectura',
                raw === '' ? (undefined as unknown as number) : Number(raw),
                { shouldDirty: true }
              )
            }}
          />
        </div>
        <div>
          <Label>Estado</Label>
          <div className="mt-2 flex flex-wrap gap-3">
            {['OK', 'INCONSISTENTE', 'NO_FUNCIONA'].map((estado) => (
              <Button
                key={estado}
                type="button"
                variant={methods.watch('odometro.estado') === estado ? 'success' : 'outline'}
                onClick={() =>
                  methods.setValue('odometro.estado', estado as InspectionForm['odometro']['estado'])
                }
              >
                {estado.replace(/_/g, ' ')}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <Label>Observación</Label>
        <Textarea
          className="mt-2"
          value={methods.watch('odometro.observacion') ?? ''}
          onChange={(event) => methods.setValue('odometro.observacion', event.target.value)}
        />
      </div>
    </SectionCard>
  )

  const renderWifi = () => {
    const wifiState = methods.watch('wifi')
    const ppuVisible = wifiState.ppuVisible
    const busEncendido = wifiState.busEncendido
    const tieneInternet = wifiState.tieneInternet

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    return (
      <SectionCard
        title="WiFi"
        description="Revisión de conexión WiFi del bus"
        icon={Wifi}
        accent="from-sky-500 to-cyan-500"
      >
        <BinaryQuestion
          label="¿Aparece la PPU del bus en la señal buscada?"
          value={ppuVisible}
          positiveLabel="Sí, aparece"
          negativeLabel="No aparece"
          onChange={(value) => {
            methods.setValue('wifi.ppuVisible', value, { shouldDirty: true })
            if (value === false) {
              // Resetear valores siguientes si no aparece PPU
              methods.setValue('wifi.tieneInternet', null, { shouldDirty: true })
            }
          }}
        />

        {ppuVisible === false && (
          <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              La PPU no aparece en la señal buscada
            </p>
            <BinaryQuestion
              label="¿El bus está encendido?"
              value={busEncendido}
              positiveLabel="Sí, está encendido"
              negativeLabel="No, está apagado"
              onChange={(value) => {
                methods.setValue('wifi.busEncendido', value, { shouldDirty: true })
                if (value === false) {
                  setIsWifiWaiting(false)
                  setWifiWaitingTime(0)
                }
              }}
            />

            {busEncendido === true && (
              <div className="space-y-3">
                {!isWifiWaiting ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setIsWifiWaiting(true)
                      setWifiWaitingTime(0)
                    }}
                  >
                    Esperar 3 minutos y revisar nuevamente
                  </Button>
                ) : (
                  <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                    <p className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
                      Esperando... {formatTime(180 - wifiWaitingTime)}
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      Por favor espera al menos 3 minutos antes de revisar nuevamente.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setIsWifiWaiting(false)
                        setWifiWaitingTime(0)
                        // Permitir revisar nuevamente
                        methods.setValue('wifi.ppuVisible', null, { shouldDirty: true })
                      }}
                    >
                      Revisar nuevamente
                    </Button>
                  </div>
                )}
                <div>
                  <Label>Observación</Label>
                  <Textarea
                    className="mt-2"
                    placeholder="Describe el motivo por el cual no aparece la PPU"
                    value={wifiState.observacion ?? ''}
                    onChange={(event) =>
                      methods.setValue('wifi.observacion', event.target.value, { shouldDirty: true })
                    }
                  />
                </div>
              </div>
            )}

            {busEncendido === false && (
              <div className="space-y-3 rounded-lg border border-orange-300 bg-orange-50 p-4 dark:border-orange-900/50 dark:bg-orange-950/30">
                <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                  El bus debe estar encendido para revisar la conexión WiFi
                </p>
                <p className="text-xs text-orange-800 dark:text-orange-200">
                  Por favor enciende el bus y vuelve a revisar si aparece la PPU en la señal buscada.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // Resetear para volver a revisar
                    methods.setValue('wifi.ppuVisible', null, { shouldDirty: true })
                    methods.setValue('wifi.busEncendido', null, { shouldDirty: true })
                  }}
                >
                  Volver a revisar
                </Button>
              </div>
            )}
          </div>
        )}

        {ppuVisible === true && (
          <div className="space-y-4">
            <AlertBanner tone="success">✓ La PPU aparece en la señal buscada</AlertBanner>
            <BinaryQuestion
              label="¿Tiene conexión a internet?"
              value={tieneInternet}
              positiveLabel="Sí, tiene internet"
              negativeLabel="No tiene internet"
              onChange={(value) => {
                methods.setValue('wifi.tieneInternet', value, { shouldDirty: true })
                if (value === true) {
                  // Si tiene internet, la revisión está OK
                  methods.setValue('wifi.observacion', '', { shouldDirty: true })
                }
              }}
            />

            {tieneInternet === false && (
              <div>
                <Label>Observación (obligatorio)</Label>
                <Textarea
                  className="mt-2"
                  placeholder="Describe qué problema tiene la conexión a internet"
                  value={wifiState.observacion ?? ''}
                  onChange={(event) =>
                    methods.setValue('wifi.observacion', event.target.value, { shouldDirty: true })
                  }
                />
                <p className="mt-1 text-xs text-slate-500">
                  Es obligatorio agregar una observación cuando no hay conexión a internet
                </p>
              </div>
            )}

            {tieneInternet === true && (
              <AlertBanner tone="success">✓ Revisión WiFi completada correctamente</AlertBanner>
            )}
          </div>
        )}
      </SectionCard>
    )
  }

  const renderPublicidad = () => (
    <SectionCard
      title="Publicidad"
      description="Evalúa cada cara del bus"
      icon={Megaphone}
      accent="from-pink-500 to-rose-500"
      badge={isEnPanne ? <ObligatorioBadge /> : undefined}
    >
      <div className="grid gap-6">
        {publicityAreas.map((area) => {
          const lateral = publicityState?.[area.key]
          return (
            <div
              key={area.key}
              className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800"
            >
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <span className="rounded-lg bg-pink-100 px-2 py-0.5 text-[10px] font-black uppercase text-pink-700 dark:bg-pink-950/50 dark:text-pink-300">
                  {area.label}
                </span>
              </p>
              <div className="mt-3 space-y-3">
                <BinaryQuestion
                  label="¿Tiene publicidad instalada?"
                  value={lateral?.tiene ?? false}
                  onChange={(value) =>
                    methods.setValue(`publicidad.${area.key}.tiene` as PublicidadPath, value, {
                      shouldDirty: true,
                    })
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <BinaryQuestion
                    label="¿Daño en pintura?"
                    value={
                      lateral?.danio == null ? null : lateral?.danio === false ? true : false
                    }
                    positiveLabel="Sin daño"
                    negativeLabel="Con daño"
                    onChange={(value) =>
                      methods.setValue(`publicidad.${area.key}.danio` as PublicidadPath, value ? false : true, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <BinaryQuestion
                    label="¿Residuos?"
                    value={
                      lateral?.residuos == null
                        ? null
                        : lateral?.residuos === false
                          ? true
                          : false
                    }
                    positiveLabel="Limpio"
                    negativeLabel="Con residuos"
                    onChange={(value) =>
                      methods.setValue(`publicidad.${area.key}.residuos` as PublicidadPath, value ? false : true, {
                        shouldDirty: true,
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {lateral?.tiene
                      ? 'Nombre de la campaña (obligatorio)'
                      : 'Motivo / observación (obligatorio)'}
                  </Label>
                  <Textarea
                    className="mt-2"
                    rows={2}
                    placeholder={
                      lateral?.tiene
                        ? 'Ej: Coca-Cola, Entel, Falabella…'
                        : 'Describe el daño o los residuos encontrados'
                    }
                    value={lateral?.observacion ?? ''}
                    onChange={(event) =>
                      methods.setValue(
                        `publicidad.${area.key}.observacion` as `publicidad.${PublicidadAreaKey}.observacion`,
                        event.target.value,
                        { shouldDirty: true }
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )

  const renderCierre = () => {
    const snapshot = methods.getValues()
    const modulos = activeSteps.filter(
      (item) => item.key !== 'estado' && item.key !== 'cierre'
    )
    const omitidos = isEnPanne ? steps.filter((item) => PANNE_SKIPPED_STEPS.includes(item.key)) : []

    return (
      <SectionCard
        title="Resumen y envío"
        description="Confirma antes de enviar"
        icon={Flag}
        accent="from-emerald-500 to-green-500"
      >
        {/* Identidad de la revisión */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Bus</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">
              {bus?.ppu ?? '—'}
            </p>
            <p className="text-xs text-slate-500">
              {bus ? `N° ${bus.numero_interno} · ${bus.marca} ${bus.modelo}` : 'Selecciona una PPU'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Terminal</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">
              {methods.watch('terminalReportado') || '—'}
            </p>
            <p className="text-xs text-slate-500">
              {terminalDetected
                ? `GPS: ${terminalDetected.name} (${terminalDetected.distance} m)`
                : 'Sin detección GPS'}
            </p>
          </div>
          <div
            className={`rounded-2xl border p-4 ${
              isEnPanne
                ? 'border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20'
                : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Estado</p>
            <p
              className={`mt-1 text-lg font-black ${
                isEnPanne
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {isEnPanne ? 'EN PANNE' : 'OPERATIVO'}
            </p>
            <p className="text-xs text-slate-500">
              {isEnPanne
                ? `${modulosPanne.length} ${
                    modulosPanne.length === 1 ? 'módulo obligatorio' : 'módulos obligatorios'
                  } revisados`
                : 'Revisión completa'}
            </p>
          </div>
        </div>

        {/* Estado de cada módulo */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Módulos revisados
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {modulos.map((item) => {
              const faltantes = getMissingForStep(item.key, snapshot, { shallow: true })
              const completo = faltantes.length === 0
              const Icon = item.icon
              return (
                <div
                  key={item.key}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                    completo
                      ? 'border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                      : 'border-amber-200/80 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${completo ? 'text-emerald-600' : 'text-amber-600'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {item.label}
                    </p>
                    <p
                      className={`truncate text-[10px] ${
                        completo ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {completo ? 'Completo' : faltantes[0]}
                    </p>
                  </div>
                  {completo ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  )}
                </div>
              )
            })}
            {omitidos.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2.5 opacity-70 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-500">{item.label}</p>
                    <p className="text-[10px] text-slate-400">Omitido · bus en panne</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Al enviar se notificará a los supervisores y se crearán tickets automáticos según los
          hallazgos detectados{isEnPanne ? ' (incluidos los módulos obligatorios en panne)' : ''}.
        </p>
      </SectionCard>
    )
  }

  /**
   * Norma gráfica · rotulación obligatoria del bus.
   *
   * Seis elementos con el mismo tratamiento: números internos, PPU normada y
   * placas patentes. El cumplimiento no se pregunta, se deduce de los seis.
   */
  const renderNormaGrafica = () => {
    const normaState = methods.watch('normaGrafica')
    const evaluados = ELEMENTOS_NORMA.filter(
      (elemento) => normaState[elemento.campo] !== null && normaState[elemento.campo] !== undefined
    )
    const hallazgos = evaluados.filter((elemento) => normaState[elemento.campo] !== 'OK')
    const completo = evaluados.length === ELEMENTOS_NORMA.length
    const cumple = completo && hallazgos.length === 0

    return (
      <SectionCard
        title="Norma gráfica"
        description="Números internos, PPU normada y placas patentes"
        icon={Hash}
        accent="from-cyan-500 to-teal-500"
        badge={
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {evaluados.length}/{ELEMENTOS_NORMA.length}
          </span>
        }
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Cómo marcar cada elemento
          </p>
          <ul className="space-y-1.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
            <li>
              <strong className="text-emerald-700 dark:text-emerald-400">Conforme</strong> ·
              completo, legible y bien adherido.
            </li>
            <li>
              <strong className="text-amber-700 dark:text-amber-400">Deteriorado</strong> ·
              existe pero está despintado, rayado, despegado o ilegible.
            </li>
            <li>
              <strong className="text-red-700 dark:text-red-400">Falta</strong> · no está
              instalado en el bus.
            </li>
          </ul>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {ELEMENTOS_NORMA.map((elemento) => (
            <EstadoNormaQuestion
              key={elemento.campo}
              label={elemento.label}
              description={elemento.ayuda}
              value={normaState[elemento.campo] ?? null}
              onChange={(value) =>
                methods.setValue(`normaGrafica.${elemento.campo}`, value, {
                  shouldDirty: true,
                })
              }
            />
          ))}
        </div>

        {completo && (
          <div
            className={`flex items-center gap-3 rounded-xl border p-3 ${
              cumple
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${
                cumple ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            >
              {cumple ? (
                <Check className="h-5 w-5" strokeWidth={3} />
              ) : (
                <X className="h-5 w-5" strokeWidth={3} />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={`text-sm font-black ${
                  cumple
                    ? 'text-emerald-800 dark:text-emerald-200'
                    : 'text-red-800 dark:text-red-200'
                }`}
              >
                {cumple
                  ? 'El bus CUMPLE la norma gráfica'
                  : `${hallazgos.length} elemento${hallazgos.length !== 1 ? 's' : ''} no conforme${
                      hallazgos.length !== 1 ? 's' : ''
                    }`}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {cumple
                  ? 'Los seis elementos están completos y legibles.'
                  : hallazgos.map((elemento) => elemento.label).join(' · ')}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="norma-obs">
            Observación {hallazgos.length > 0 ? '(obligatoria)' : '(opcional)'}
          </Label>
          <Textarea
            id="norma-obs"
            rows={hallazgos.length > 0 ? 3 : 2}
            placeholder={
              hallazgos.length > 0
                ? 'Describe qué está deteriorado o falta: ubicación, estado y si es legible...'
                : 'Detalles adicionales de la rotulación...'
            }
            value={normaState.observacion ?? ''}
            onChange={(event) =>
              methods.setValue('normaGrafica.observacion', event.target.value, {
                shouldDirty: true,
              })
            }
          />
        </div>
      </SectionCard>
    )
  }

  /**
   * +15 · alimentación permanente del equipo embarcado.
   *
   * El resultado no se pregunta, se deduce: si tras retirar el corta corriente
   * la consola Y el validador siguen encendidos, el bus tiene +15. Dejarlo a
   * criterio del inspector abriría la puerta a que cada uno lo interprete
   * distinto.
   */
  const renderMas15 = () => {
    const mas15State = methods.watch('mas15')
    const arranqueOk = mas15State.arranqueOk
    const consola = mas15State.consolaEncendida
    const validador = mas15State.validadorEncendido

    const evaluado = consola !== null && consola !== undefined && validador !== null && validador !== undefined
    const tieneMas15 = evaluado ? consola === true && validador === true : null

    return (
      <SectionCard
        title="+15"
        description="Alimentación del equipo embarcado sin corta corriente"
        icon={BatteryCharging}
        accent="from-lime-500 to-emerald-500"
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Procedimiento
          </p>
          <ol className="space-y-1.5 text-sm leading-snug text-slate-600 dark:text-slate-300">
            <li>1. Encender el bus y esperar a que la consola y el validador se enciendan.</li>
            <li>2. Con ambos encendidos, apagar el bus.</li>
            <li>3. Retirar el corta corriente.</li>
            <li>
              4. Si la consola y el validador <strong>siguen encendidos</strong>, el bus
              cuenta con +15. Si ambos se apagan, no cuenta con +15.
            </li>
          </ol>
        </div>

        <BinaryQuestion
          label="¿El bus arrancó y se encendieron consola y validador?"
          value={arranqueOk}
          positiveLabel="Sí, ambos encendieron"
          negativeLabel="No pude completarlo"
          onChange={(value) => {
            methods.setValue('mas15.arranqueOk', value, { shouldDirty: true })
            if (value === false) {
              // Sin encendido previo no hay nada que medir
              methods.setValue('mas15.consolaEncendida', null, { shouldDirty: true })
              methods.setValue('mas15.validadorEncendido', null, { shouldDirty: true })
            }
          }}
        />

        {arranqueOk === false && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              No se puede evaluar el +15 sin el encendido previo
            </p>
            <div className="space-y-2">
              <Label htmlFor="mas15-obs">¿Qué ocurrió? (obligatorio)</Label>
              <Textarea
                id="mas15-obs"
                rows={3}
                placeholder="Ej: la consola no encendió, el bus no arranca, no había corta corriente accesible..."
                value={mas15State.observacion ?? ''}
                onChange={(event) =>
                  methods.setValue('mas15.observacion', event.target.value, {
                    shouldDirty: true,
                  })
                }
              />
            </div>
          </div>
        )}

        {arranqueOk === true && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-900/30">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Bus apagado y corta corriente retirado
            </p>

            <BinaryQuestion
              label="¿La consola sigue encendida?"
              value={consola}
              positiveLabel="Sigue encendida"
              negativeLabel="Se apagó"
              onChange={(value) =>
                methods.setValue('mas15.consolaEncendida', value, { shouldDirty: true })
              }
            />

            <BinaryQuestion
              label="¿El validador sigue encendido?"
              value={validador}
              positiveLabel="Sigue encendido"
              negativeLabel="Se apagó"
              onChange={(value) =>
                methods.setValue('mas15.validadorEncendido', value, { shouldDirty: true })
              }
            />

            {evaluado && (
              <div
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  tieneMas15
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                    : 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${
                    tieneMas15 ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                >
                  {tieneMas15 ? (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  ) : (
                    <X className="h-5 w-5" strokeWidth={3} />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-black ${
                      tieneMas15
                        ? 'text-emerald-800 dark:text-emerald-200'
                        : 'text-red-800 dark:text-red-200'
                    }`}
                  >
                    {tieneMas15 ? 'El bus CUENTA con +15' : 'El bus NO cuenta con +15'}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {tieneMas15
                      ? 'Ambos equipos mantienen alimentación sin corta corriente.'
                      : consola !== validador
                        ? 'Sólo uno de los dos equipos quedó encendido: se registra como sin +15.'
                        : 'Ambos equipos se apagaron al retirar el corta corriente.'}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mas15-obs-ok">Observación (opcional)</Label>
              <Textarea
                id="mas15-obs-ok"
                rows={2}
                placeholder="Detalles del equipo, número de serie, anomalías..."
                value={mas15State.observacion ?? ''}
                onChange={(event) =>
                  methods.setValue('mas15.observacion', event.target.value, {
                    shouldDirty: true,
                  })
                }
              />
            </div>
          </div>
        )}
      </SectionCard>
    )
  }

  const renderStep = () => {
    switch (stepKey) {
      case 'estado':
        return renderEstado()
      case 'tag':
        return renderTag()
      case 'camaras':
        return renderCamaras()
      case 'extintores':
        return renderExtintores()
      case 'mobileye':
        return renderMobileye()
      case 'rack':
        return renderRack()
      case 'odometro':
        return renderOdometro()
      case 'wifi':
        return renderWifi()
      case 'normaGrafica':
        return renderNormaGrafica()
      case 'mas15':
        return renderMas15()
      case 'publicidad':
        return renderPublicidad()
      case 'cierre':
        return renderCierre()
      default:
        return null
    }
  }

  // ============================================================
  // LAYOUT PRINCIPAL
  // ============================================================

  /*
   * Sin la configuración cargada NO se arma el formulario.
   *
   * Mientras la consulta estaba en vuelo, el catálogo entraba con su valor
   * por defecto —todos los módulos activos— y el formulario alcanzaba a
   * pedir pasos desactivados (+15, Norma gráfica). Quien entraba rápido los
   * respondía sin que correspondiera. Un instante de espera honesto evita
   * revisar de más; sólo aplica a la primera carga, los refrescos usan caché.
   */
  if (cargandoModulos) {
    return (
      <Card className="flex min-h-[45dvh] flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        <div>
          <p className="text-[14px] font-extrabold text-slate-900 dark:text-white">
            Preparando la revisión
          </p>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            Cargando qué módulos corresponde revisar hoy...
          </p>
        </div>
      </Card>
    )
  }

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(submitInspection)}
        onKeyDown={(e) => {
          // Prevenir envío con Enter si no estamos en el paso final
          if (e.key === 'Enter' && currentStep !== activeSteps.length - 1) {
            e.preventDefault()
          }
        }}
        className="space-y-3 sm:space-y-5"
        aria-label="Formulario principal New Mini-Check"
      >
        {/* ===== HERO: BÚSQUEDA Y BUS SELECCIONADO =====
            Sin overflow-hidden: recortaba el dropdown de sugerencias de PPU */}
        <Card className="border border-slate-200/70 p-0 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2.5 rounded-t-2xl bg-gradient-to-r from-slate-900 via-brand-800 to-brand-600 px-4 py-3 text-white sm:gap-3 sm:px-6 sm:py-4">
            <div className="rounded-xl bg-white/15 p-2">
              <Bus className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-black sm:text-lg">Nueva Inspección</h1>
              <p className="text-xs text-white/70">
                Semana {dayjs().isoWeek()} · {dayjs().format('dddd D MMMM')}
              </p>
            </div>
            {bus && (
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${
                  isEnPanne ? 'bg-red-500/90' : 'bg-emerald-500/90'
                }`}
              >
                {isEnPanne ? 'En panne' : 'Operativo'}
              </span>
            )}
          </div>

          <div className="space-y-3 p-4 sm:space-y-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="relative flex-1">
                <Label htmlFor="busSearch">PPU o N° interno</Label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="busSearch"
                    placeholder="Ej: SHRS75 o 1694"
                    className="pl-9"
                    value={busQuery}
                    autoComplete="off"
                    onChange={(event) => {
                      setBusQuery(event.target.value.toUpperCase())
                      setSugerenciasAbiertas(true)
                    }}
                    onFocus={() => setSugerenciasAbiertas(true)}
                  />
                </div>
                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                    {suggestions.map((record) => (
                      <button
                        key={record.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-slate-600 transition hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-brand-950/30"
                        onClick={() => {
                          const value = record.ppu.toUpperCase()
                          setBusQuery(value)
                          setSugerenciasAbiertas(false)
                          searchBus(value)
                        }}
                      >
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {record.ppu}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">
                            #{record.numero_interno} · {record.terminal}
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                type="button"
                className="w-full gap-2 rounded-2xl sm:w-auto"
                disabled={buscando}
                onClick={() => {
                  setSugerenciasAbiertas(false)
                  void searchBus()
                }}
              >
                {buscando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {buscando ? 'Buscando...' : 'Buscar bus'}
              </Button>
            </div>

            {bus && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200/60 bg-gradient-to-r from-brand-50/80 to-white p-4 dark:border-brand-900/40 dark:from-brand-950/30 dark:to-slate-950">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-xl shadow-lg shadow-brand-500/25">
                  🚌
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-black text-slate-900 dark:text-white">
                    {bus.ppu}
                    <span className="ml-2 text-sm font-semibold text-slate-400">
                      #{bus.numero_interno}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {bus.marca} {bus.modelo} {bus.anio} · Terminal {bus.terminal}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-slate-400 hover:text-red-500"
                  onClick={() => {
                    // Invalida cualquier búsqueda en vuelo: su resultado ya no
                    // debe tocar el estado del formulario
                    busquedaRef.current += 1
                    setBuscando(false)
                    setVerificandoSemana(false)
                    limpiarBorrador()
                    setBus(null)
                    setBusQuery('')
                    setBusAlert(null)
                    setRevisionPrevia(null)
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Cambiar
                </Button>
              </div>
            )}

            {/* La verificación se anuncia: sin esto parecía que la app dudaba
                sin motivo cuando el botón Continuar no respondía */}
            {bus && verificandoSemana && (
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
                Verificando si este bus ya fue revisado esta semana...
              </p>
            )}

            <AnimatePresence>
              {busAlert && <AlertBanner tone="warning">{busAlert}</AlertBanner>}
            </AnimatePresence>
          </div>
        </Card>

        {/* Si la configuración no se pudo leer y no hay caché, se muestran
            todos los módulos; eso NUNCA debe pasar en silencio */}
        {falloModulos && (
          <AlertBanner tone="warning" title="Configuración no disponible">
            No pudimos cargar qué módulos están activos, así que se muestran todos
            los pasos. Verifica tu conexión: lo desactivado en Configuración no
            debería revisarse.
          </AlertBanner>
        )}

        {/* ===== BANNER GPS NO AUTORIZADO ===== */}
        {(!gpsActive || !trackingLocation) && (
          <Card className="border-2 border-red-500 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950/50">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 rounded-full bg-red-500 p-2 text-white">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-red-900 dark:text-red-100">
                  GPS Requerido
                </h3>
              </div>

              <p className="text-sm text-red-800 dark:text-red-200">
                No puedes hacer inspecciones sin GPS. Los registros quedan sin terminal.
              </p>

              {trackingError && trackingError.includes('BLOQUEADO') ? (
                <div className="rounded-lg border border-orange-400 bg-orange-50 p-3 dark:border-orange-700 dark:bg-orange-950/40">
                  <p className="mb-2 text-sm font-bold text-orange-900 dark:text-orange-100">
                    🔒 GPS Bloqueado
                  </p>
                  <p className="mb-3 text-xs text-orange-800 dark:text-orange-200">
                    Debes habilitarlo manualmente en tu navegador:
                  </p>
                  <div className="space-y-2 text-xs text-orange-900 dark:text-orange-100">
                    <div className="rounded bg-orange-100 p-2 dark:bg-orange-900/30">
                      <strong>📱 En móvil:</strong> Configuración → Sitios web → Ubicación → Permitir
                    </div>
                    <div className="rounded bg-orange-100 p-2 dark:bg-orange-900/30">
                      <strong>💻 En PC:</strong> Clic en candado 🔒 → Ubicación → Permitir → Recargar (F5)
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/40">
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    👇 Haz clic abajo y acepta el permiso de ubicación en el popup del navegador
                  </p>
                </div>
              )}

              <Button
                type="button"
                size="lg"
                className="w-full gap-2 rounded-xl bg-red-600 text-white hover:bg-red-700"
                onClick={handleRefreshGps}
                disabled={refreshingGPS}
              >
                {refreshingGPS ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pidiendo permiso...
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4" />
                    Activar GPS
                  </>
                )}
              </Button>

              {trackingError && (
                <div className="rounded-lg bg-red-100 p-2 text-xs font-semibold text-red-900 dark:bg-red-900/30 dark:text-red-100">
                  {trackingError}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ===== BANNER MODO PANNE ===== */}
        {isEnPanne && (
          <AlertBanner tone="error" title="Modo EN PANNE activo">
            {modulosPanne.length > 0
              ? `Debes revisar obligatoriamente: ${listar(
                  modulosPanne.map((modulo) => modulo.nombre)
                )}.`
              : motivoSinModulosEnPanne}
            {modulosOmitidosPanne.length > 0 &&
              ` ${listar(modulosOmitidosPanne.map((modulo) => modulo.nombre))} se ${
                modulosOmitidosPanne.length === 1 ? 'omite' : 'omiten'
              } automáticamente.`}
          </AlertBanner>
        )}

        {/* ===== STEPPER ===== */}
        <Card className="space-y-2.5 p-3 sm:space-y-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Paso {currentStep + 1} de {activeSteps.length} · {activeSteps[currentStep].label}
            </p>
            <p className="text-xs font-bold text-brand-600 dark:text-brand-400">
              {Math.round(progressPct)}%
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <motion.div
              className={`h-full rounded-full ${
                isEnPanne
                  ? 'bg-gradient-to-r from-red-500 to-orange-500'
                  : 'bg-gradient-to-r from-brand-500 to-indigo-500'
              }`}
              animate={{ width: `${Math.max(progressPct, 3)}%` }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            />
          </div>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max items-center gap-1.5">
              {activeSteps.map((item, index) => {
                const Icon = item.icon
                const isCurrent = index === currentStep
                const isDone = index < currentStep
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => attemptNavigateToStep(index)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-[0.97] ${
                      isCurrent
                        ? isEnPanne
                          ? 'border-red-500 bg-red-600 text-white shadow-md shadow-red-500/25'
                          : 'border-brand-500 bg-brand-600 text-white shadow-md shadow-brand-500/25'
                        : isDone
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        </Card>

        {/* ===== ALERTA DE VALIDACIÓN ===== */}
        <AnimatePresence>
          {validationMessage && (
            <AlertBanner tone="error" title={`${validationMessage.title}: faltan datos`}>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                {validationMessage.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </AlertBanner>
          )}
        </AnimatePresence>

        {/* ===== PASO ACTUAL ===== */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`step-${currentStep}-${stepKey}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* ===== NAVEGACIÓN FIJA ===== */}
        <div className="sticky bottom-[4.6rem] z-20 md:bottom-4">
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white/95 px-2.5 py-2 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:gap-3 sm:px-4 sm:py-3">
            <Button
              type="button"
              variant="ghost"
              disabled={currentStep === 0}
              onClick={handlePrev}
              className="shrink-0 gap-1.5 px-3 sm:px-5"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Anterior</span>
            </Button>
            <p className="hidden text-xs text-slate-400 md:block">
              {bus ? `${bus.ppu} · ${activeSteps[currentStep].label}` : 'Selecciona un bus'}
            </p>
            {stepKey === 'cierre' ? (
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-500/25 hover:from-emerald-500 hover:to-emerald-400 sm:flex-initial sm:px-6"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Enviar revisión
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleNext}
                disabled={verificandoSemana}
                className="flex-1 gap-1.5 rounded-2xl sm:flex-initial sm:px-6"
              >
                {verificandoSemana ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Verificando...
                  </>
                ) : (
                  <>
                    Continuar
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </form>

      <BusRevisadoDialog
        revision={revisionPrevia}
        onConsultarOtro={() => {
          // Se suelta el bus y se devuelve el foco a la búsqueda: el caso
          // habitual es seguir con el siguiente de la hoja de pendientes
          limpiarBorrador()
          setRevisionPrevia(null)
          setBus(null)
          setBusQuery('')
          setStep(0)
          window.requestAnimationFrame(() =>
            document.getElementById('busSearch')?.focus()
          )
        }}
        onVolverARevisar={() => setRevisionPrevia(null)}
      />
    </FormProvider>
  )
}

const ObligatorioBadge = () => (
  <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">
    Obligatorio en panne
  </span>
)
