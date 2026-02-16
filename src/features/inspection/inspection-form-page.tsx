import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Loader2, MapPin, Search } from 'lucide-react'
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
import type { Tables, Database } from '@/types/database'
import { useNotificationStore } from '@/store/notification-store'
import { useTracking } from '@/context/tracking-context'

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
  })

const steps = [
  { key: 'estado', label: 'Estado general' },
  { key: 'tag', label: 'TAG' },
  { key: 'camaras', label: 'Cámaras' },
  { key: 'extintores', label: 'Extintores' },
  { key: 'odometro', label: 'Odómetro' },
  { key: 'mobileye', label: 'Mobileye' },
  { key: 'wifi', label: 'WiFi' },
  { key: 'publicidad', label: 'Publicidad' },
  { key: 'cierre', label: 'Cierre' },
] as const

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
type StepKey = (typeof steps)[number]['key']
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
  <div className="space-y-2 rounded-2xl border border-slate-100/60 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    <div className="flex gap-3">
      <Button
        type="button"
        variant={value === true ? 'success' : 'outline'}
        className="flex-1 rounded-xl"
        onClick={() => onChange(true)}
      >
        {positiveLabel}
      </Button>
      <Button
        type="button"
        variant={value === false ? 'destructive' : 'outline'}
        className="flex-1 rounded-xl"
        onClick={() => onChange(false)}
      >
        {negativeLabel}
      </Button>
    </div>
  </div>
)

const SectionCard = ({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) => (
  <Card className="space-y-6 border border-slate-100/80 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-500">{title}</p>
      {description && <p className="text-sm text-slate-500">{description}</p>}
    </div>
    {children}
  </Card>
)

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
    },
  })
  const [step, setStep] = useState(0)
  const [busQuery, setBusQuery] = useState('')
  const [bus, setBus] = useState<Tables<'flota'> | null>(null)
  const [busAlert, setBusAlert] = useState<string | null>(null)
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
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [wifiWaitingTime, setWifiWaitingTime] = useState(0)
  const [isWifiWaiting, setIsWifiWaiting] = useState(false)
  const {
    location: trackingLocation,
    error: trackingError,
    refreshLocation,
    lastLocationUpdate,
    isTracking: gpsActive,
  } = useTracking()
  const estadoBus = methods.watch('estadoBus')
  const mobileyeAplica = methods.watch('mobileye.aplica')
  const mobileyeState = methods.watch('mobileye')
  const publicityState = methods.watch('publicidad')
  const stepKey: StepKey = steps[step].key
  const suggestions = useMemo(() => {
    const query = busQuery.trim().toUpperCase()
    if (!query || !flotaCatalog) return []
    return flotaCatalog
      .filter(
        (record) =>
          record.ppu.toUpperCase().includes(query) ||
          record.numero_interno.toUpperCase().includes(query)
      )
      .slice(0, 5)
  }, [busQuery, flotaCatalog])

  // Auto-relleno de publicidad según reglas del usuario
  useEffect(() => {
    publicityAreas.forEach((area) => {
      const tiene = publicityState[area.key].tiene
      const currentDanio = publicityState[area.key].danio
      const currentResiduos = publicityState[area.key].residuos

      // Si TIENE publicidad → auto-rellenar Sin daño + Limpio
      if (tiene === true) {
        if (currentDanio !== false || currentResiduos !== false) {
          methods.setValue(`publicidad.${area.key}.danio`, false, { shouldDirty: true })
          methods.setValue(`publicidad.${area.key}.residuos`, false, { shouldDirty: true })
        }
      }

      // Si NO TIENE publicidad → resetear auto-relleno (dejar en null para forzar selección)
      if (tiene === false) {
        if (currentDanio === false && currentResiduos === false) {
          methods.setValue(`publicidad.${area.key}.danio`, null, { shouldDirty: true })
          methods.setValue(`publicidad.${area.key}.residuos`, null, { shouldDirty: true })
        }
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

    try {
      const { data, error } = await supabase
        .from('flota')
        .select('*')
        .or(`ppu.eq.${query},numero_interno.eq.${query}`)
        .maybeSingle()

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

      const currentWeek = dayjs().isoWeek()
      const { data: revisiones } = await supabase
        .from('revisiones')
        .select('id, created_at, inspector_nombre')
        .eq('bus_ppu', busRecord.ppu)
        .order('created_at', { ascending: false })
        .limit(1)

      if (revisiones?.length) {
        const lastRevision = revisiones[0]
        const lastDate = dayjs(lastRevision.created_at)
        const currentWeekYear = getIsoWeekYear()
        const lastWeekYear = getIsoWeekYear(lastDate)
        if (lastDate.isoWeek() === currentWeek && lastWeekYear === currentWeekYear) {
          setBusAlert(
            `Este bus ya tiene revisión registrada esta semana (${lastDate.format(
              'dddd D MMM · HH:mm'
            )} hrs por ${lastRevision.inspector_nombre ?? 'otro inspector'}).`
          )
        } else {
          setBusAlert(null)
        }
      }

      methods.setValue(
        'mobileye.aplica',
        busRecord.marca?.toLowerCase().includes('volvo') ?? false,
        { shouldDirty: true }
      )

      // Buscar el último registro de TAG para este bus
      const { data: lastTag, error: tagError } = await supabase
        .from('tags')
        .select('tiene, serie')
        .eq('bus_ppu', busRecord.ppu)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!tagError && lastTag) {
        // Si el último registro tiene TAG instalado y tiene serie, auto-rellenar
        if (lastTag.tiene === true && lastTag.serie) {
          methods.setValue('tag.tiene', true, { shouldDirty: true })
          methods.setValue('tag.serie', lastTag.serie, { shouldDirty: true })
          methods.setValue('tag.observacion', '', { shouldDirty: true })
        } else if (lastTag.tiene === false) {
          // Si el último registro dice que NO tiene TAG, marcar como "No tiene"
          methods.setValue('tag.tiene', false, { shouldDirty: true })
          methods.setValue('tag.serie', '', { shouldDirty: true })
          methods.setValue('tag.observacion', '', { shouldDirty: true })
        }
        // Si tiene === true pero no tiene serie, mantener el valor por defecto (instalado)
      }
    } catch (err) {
      console.error('Error in searchBus:', err)
      setBus(null)
      setBusAlert('Error al buscar el bus. Intenta nuevamente.')
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

  useEffect(() => {
    if (estadoBus === 'EN_PANNE' && step !== 0 && step !== steps.length - 1) {
      setStep(0)
    }
  }, [estadoBus, step])

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

  const handleNext = () => {
    // Si el bus está EN_PANNE, saltar directo al cierre (último paso)
    if (estadoBus === 'EN_PANNE' && step === 0) {
      attemptNavigateToStep(steps.length - 1)
      return
    }

    // VALIDACIÓN GPS: Bloquear navegación si no hay GPS (solo para buses OPERATIVOS)
    if (!gpsActive || !trackingLocation) {
      setValidationMessage('⚠️ Debes autorizar el GPS para continuar. Haz clic en "Actualizar GPS" arriba.')
      return
    }
    attemptNavigateToStep(Math.min(step + 1, steps.length - 1))
  }
  const handlePrev = () => {
    attemptNavigateToStep(Math.max(step - 1, 0))
  }

  const submitInspection = async (values: InspectionForm) => {
    // VALIDACIÓN GPS: Permitir envío sin GPS solo para buses EN_PANNE
    if (!gpsActive || !trackingLocation) {
      if (values.estadoBus === 'OPERATIVO') {
        setValidationMessage('❌ NO PUEDES ENVIAR SIN GPS ACTIVO. Autoriza el permiso de ubicación para continuar.')
        return
      }
      // Para buses EN_PANNE, continuar con coordenadas por defecto
      console.warn('Bus EN_PANNE enviado sin GPS - usando coordenadas por defecto')
    }

    if (step !== steps.length - 1) {
      attemptNavigateToStep(steps.length - 1)
      return
    }

    const snapshot = methods.getValues()

    // Para buses EN_PANNE, solo validar el paso 'estado'
    if (snapshot.estadoBus === 'EN_PANNE') {
      const estadoIssues = getMissingForStep('estado', snapshot)
      if (estadoIssues.length) {
        setValidationMessage(`Estado del bus: ${estadoIssues.join(' · ')}`)
        setStep(0)
        return
      }
    } else {
      // Para buses OPERATIVOS, validar todos los pasos
      for (let i = 0; i < steps.length; i++) {
        const issues = getMissingForStep(steps[i].key, snapshot)
        if (issues.length) {
          setValidationMessage(`${steps[i].label}: ${issues.join(' · ')}`)
          setStep(i)
          return
        }
      }

      const isValid = await methods.trigger()
      if (!isValid) {
        setValidationMessage('Revisa los campos con error antes de enviar.')
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

      // Insertar registros según estado del bus
      const isEnPanne = values.estadoBus === 'EN_PANNE'

      await supabase.from('tags').insert({
        revision_id: revisionData.id,
        tiene: isEnPanne ? false : values.tag.tiene,
        serie: isEnPanne ? null : (values.tag.serie || null),
        observacion: isEnPanne ? 'Bus en panne - no revisado' : (values.tag.observacion || null),
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      await supabase.from('camaras').insert({
        revision_id: revisionData.id,
        monitor_estado: isEnPanne ? 'SIN_SENAL' : values.camaras.monitorEstado,
        detalle: isEnPanne ? {} : {
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
        observacion: isEnPanne ? 'Bus en panne - no revisado' : (values.camaras.observacion || null),
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      await supabase.from('extintores').insert({
        revision_id: revisionData.id,
        tiene: isEnPanne ? false : values.extintores.tiene,
        vencimiento_mes: isEnPanne ? null : (values.extintores.vencimientoMes ?? null),
        vencimiento_anio: isEnPanne ? null : (values.extintores.vencimientoAnio ?? null),
        certificacion: isEnPanne ? null : (values.extintores.certificacion ?? null),
        sonda: isEnPanne ? null : (values.extintores.sonda ?? null),
        manometro: isEnPanne ? null : (values.extintores.manometro ?? null),
        presion: isEnPanne ? null : (values.extintores.presion ?? null),
        cilindro: isEnPanne ? null : (values.extintores.cilindro ?? null),
        porta: isEnPanne ? null : (values.extintores.porta ?? null),
        observacion: isEnPanne ? 'Bus en panne - no revisado' : (values.extintores.observacion ?? null),
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      // Mobileye solo para buses OPERATIVOS con marca Volvo
      if (!isEnPanne && values.mobileye.aplica) {
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

      await supabase.from('odometro').insert({
        revision_id: revisionData.id,
        lectura: isEnPanne ? 0 : values.odometro.lectura,
        estado: isEnPanne ? 'NO_FUNCIONA' : values.odometro.estado,
        observacion: isEnPanne ? 'Bus en panne - no revisado' : (values.odometro.observacion ?? null),
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      await supabase.from('wifi').insert({
        revision_id: revisionData.id,
        ppu_visible: isEnPanne ? null : (values.wifi.ppuVisible ?? null),
        bus_encendido: isEnPanne ? null : (values.wifi.busEncendido ?? null),
        tiene_internet: isEnPanne ? null : (values.wifi.tieneInternet ?? null),
        observacion: isEnPanne ? 'Bus en panne - no revisado' : (values.wifi.observacion || null),
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      const publicidadTiene = isEnPanne ? false : publicityAreas.some((area) => values.publicidad[area.key].tiene)
      const publicidadDanio = isEnPanne ? false : publicityAreas.some((area) => values.publicidad[area.key].danio)
      const publicidadResiduos = isEnPanne ? false : publicityAreas.some((area) => values.publicidad[area.key].residuos)

      const publicidadPayload: Database['public']['Tables']['publicidad']['Insert'] = {
        revision_id: revisionData.id,
        tiene: publicidadTiene,
        danio: publicidadDanio,
        residuos: publicidadResiduos,
        detalle_lados: isEnPanne ? {
          izquierda: { tiene: false, danio: false, residuos: false, observacion: 'Bus en panne - no revisado' },
          derecha: { tiene: false, danio: false, residuos: false, observacion: 'Bus en panne - no revisado' },
          luneta: { tiene: false, danio: false, residuos: false, observacion: 'Bus en panne - no revisado' },
        } : {
          izquierda: values.publicidad.izquierda,
          derecha: values.publicidad.derecha,
          luneta: values.publicidad.luneta,
        },
        nombre_publicidad: null,
        observacion: isEnPanne ? 'Bus en panne - no revisado' : null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      }

      await supabase.from('publicidad').insert(publicidadPayload)

      // NO generar tickets para buses EN_PANNE
      if (!isEnPanne) {
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

        if (tickets.length) {
          await supabase.from('tickets').insert(
            tickets.map((ticket) => ({
              revision_id: revisionData.id,
              descripcion: ticket.descripcion,
              modulo: ticket.modulo,
              estado: 'PENDIENTE' as const,
              prioridad: 'ALTA' as const,
              terminal: values.terminalReportado,
            }))
          )
        }
      }

      push({
        id: revisionData.id,
        title: 'Revisión enviada',
        body: `Bus ${bus.ppu} · ${values.terminalReportado}`,
      })

      methods.reset()
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

  const getMissingForStep = (
    stepKey: StepKey,
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

    switch (stepKey) {
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
      case 'publicidad':
        publicityAreas.forEach((area) => {
          const lateral = snapshot.publicidad[area.key]
          if (lateral.tiene === null || lateral.tiene === undefined) {
            missing.push(`Publicidad · ${area.label} · Indica si tiene campaña`)
          } else if (lateral.tiene) {
            requireBoolean(lateral.danio, `Publicidad · ${area.label} · Define si hay daño`)
            requireBoolean(lateral.residuos, `Publicidad · ${area.label} · Define si hay residuos`)
          }
        })
        break
      case 'cierre':
        if (!options?.shallow) {
          // Para buses EN_PANNE, solo validar el paso 'estado'
          if (snapshot.estadoBus === 'EN_PANNE') {
            const estadoMissing = getMissingForStep('estado', snapshot, { shallow: true })
            if (estadoMissing.length) {
              missing.push(`Estado del bus: ${estadoMissing[0]}`)
            }
          } else {
            // Para buses OPERATIVOS, validar todos los pasos
            for (const stepConfig of steps) {
              if (stepConfig.key === 'cierre') continue
              const childMissing = getMissingForStep(stepConfig.key, snapshot, { shallow: true })
              if (childMissing.length) {
                missing.push(`${stepConfig.label}: ${childMissing[0]}`)
              }
            }
          }
        }
        break
    }

    return missing
  }

  const attemptNavigateToStep = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= steps.length) return false
    if (targetIndex > step) {
      const snapshot = methods.getValues()

      // Para buses EN_PANNE saltando al cierre, NO validar pasos intermedios
      const isEnPanneToCierre = snapshot.estadoBus === 'EN_PANNE' && targetIndex === steps.length - 1 && step === 0

      if (!isEnPanneToCierre) {
        // Solo validar pasos intermedios para buses OPERATIVOS
        for (let current = step; current < targetIndex; current++) {
          const issues = getMissingForStep(steps[current].key, snapshot)
          if (issues.length) {
            setValidationMessage(`${steps[current].label}: ${issues.join(' · ')}`)
            setStep(current)
            return false
          }
        }
      }
    }
    setValidationMessage(null)
    setStep(targetIndex)
    return true
  }

  const renderEstado = () => (
    <SectionCard title="Estado del bus" description="Valida condiciones generales antes de continuar.">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Estado operativo</Label>
          <div className="mt-3 flex gap-3">
            <Button
              type="button"
              variant={estadoBus === 'OPERATIVO' ? 'success' : 'outline'}
              className="flex-1 rounded-2xl"
              onClick={() => methods.setValue('estadoBus', 'OPERATIVO')}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Operativo
            </Button>
            <Button
              type="button"
              variant={estadoBus === 'EN_PANNE' ? 'destructive' : 'outline'}
              className="flex-1 rounded-2xl"
              onClick={() => methods.setValue('estadoBus', 'EN_PANNE')}
            >
              <AlertTriangle className="mr-2 h-4 w-4" /> En panne
            </Button>
          </div>
        </div>
        <div>
          <Label>Terminal</Label>
          <Input
            value={methods.watch('terminalReportado')}
            onChange={(event) => methods.setValue('terminalReportado', event.target.value)}
          />
          {terminalDetected && (
            <p className="mt-1 text-xs text-emerald-500">
              Detectado por GPS: {terminalDetected.name} ({terminalDetected.distance} m)
            </p>
          )}
          <div className="mt-3 rounded-2xl border border-dashed border-slate-200/70 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-300">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
              <span className="font-semibold text-slate-600 dark:text-slate-100">
                GPS en vivo {gpsActive ? '· activo' : '· inactivo'}
              </span>
              <span className="text-slate-400">{lastLocationUpdate ? dayjs(lastLocationUpdate).fromNow() : 'sin lectura'}</span>
            </div>
            <p className="mt-2 font-mono text-sm text-slate-700 dark:text-white">
              {trackingLocation
                ? `${trackingLocation.lat.toFixed(6)}, ${trackingLocation.lon.toFixed(6)}`
                : 'Sin coordenadas'}
            </p>
            <p className="text-[11px] text-slate-500">
              Precisión:&nbsp;
              {trackingLocation ? `±${Math.round(trackingLocation.accuracy)} m` : 'no disponible'}
            </p>
            {trackingError && (
              <p className="mt-1 text-[11px] font-semibold text-red-500">Error: {trackingError}</p>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 gap-2 text-xs text-brand-600"
              onClick={handleRefreshGps}
              disabled={refreshingGPS}
            >
              {refreshingGPS ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MapPin className="h-3.5 w-3.5" />
              )}
              {refreshingGPS ? 'Actualizando...' : 'Actualizar GPS'}
            </Button>
          </div>
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
    <SectionCard title="TAG" description="Valida instalación y serie">
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
      <SectionCard title="Cámaras" description="Preguntas específicas por componente">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Estado del Monitor</Label>
            <select
              value={camaras.monitorEstado}
              onChange={(e) => methods.setValue('camaras.monitorEstado', e.target.value as any)}
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
            <div className="grid gap-4 md:grid-cols-2">
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
            <div className="grid gap-4 md:grid-cols-2">
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
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            El monitor no está operativo, por lo que no se continuó con la revisión de cámaras.
            Describe la falla para generar el ticket correspondiente.
          </div>
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
      <SectionCard title="Extintores" description="Completa vencimientos y estado físico">
        <BinaryQuestion
          label="¿Tiene extintor instalado?"
          value={tieneExtintor}
          onChange={(value) => methods.setValue('extintores.tiene', value, { shouldDirty: true })}
        />
        {tieneExtintor && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
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
            <div className="grid gap-4 md:grid-cols-2">
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
        )}
      </SectionCard>
    )
  }

  const renderMobileye = () => (
    <SectionCard title="Mobileye" description="Aplica solo a buses Volvo">
      <BinaryQuestion
        label="¿Este bus cuenta con Mobileye?"
        value={mobileyeAplica}
        positiveLabel="Sí, aplica"
        negativeLabel="No aplica"
        onChange={(value) => methods.setValue('mobileye.aplica', value)}
      />
      {mobileyeAplica && (
        <div className="grid gap-4 md:grid-cols-3">
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

  const renderOdometro = () => (
    <SectionCard title="Odómetro" description="Captura lectura real">
      <div className="grid gap-4 md:grid-cols-2">
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
                {estado}
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
      <SectionCard title="WiFi" description="Revisión de conexión WiFi del bus">
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
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                ✓ La PPU aparece en la señal buscada
              </p>
            </div>
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
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  ✓ Revisión WiFi completada correctamente
                </p>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    )
  }

  const renderPublicidad = () => (
    <SectionCard title="Publicidad" description="Evalúa cada cara del bus">
      <div className="grid gap-6">
        {publicityAreas.map((area) => (
          <div key={area.key} className="rounded-2xl border border-slate-100/60 p-4 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{area.label}</p>
            <div className="mt-3 space-y-3">
              <BinaryQuestion
                label="¿Tiene publicidad instalada?"
                value={publicityState?.[area.key].tiene ?? false}
                onChange={(value) =>
                  methods.setValue(`publicidad.${area.key}.tiene` as PublicidadPath, value, {
                    shouldDirty: true,
                  })
                }
              />
              <BinaryQuestion
                label="¿Daño en pintura?"
                value={
                  publicityState?.[area.key].danio == null
                    ? null
                    : publicityState?.[area.key].danio === false
                      ? true
                      : false
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
                  publicityState?.[area.key].residuos == null
                    ? null
                    : publicityState?.[area.key].residuos === false
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
              <div>
                <Label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Observación específica
                </Label>
                <Textarea
                  className="mt-2"
                  rows={2}
                  placeholder="Campaña instalada, daños, notas"
                  value={publicityState?.[area.key].observacion ?? ''}
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
        ))}
      </div>
    </SectionCard>
  )

  const renderCierre = () => (
    <SectionCard title="Resumen" description="Confirma antes de enviar">
      <div className="rounded-2xl border border-slate-100/70 p-4 text-sm dark:border-slate-800">
        <p>Bus: {bus?.ppu ?? 'Selecciona una PPU'}</p>
        <p>Terminal: {methods.watch('terminalReportado')}</p>
        <p>Estado: {estadoBus}</p>
      </div>
      <p className="text-xs text-slate-500">
        Al enviar se notificará a los supervisores y se crearán tickets automáticos según hallazgos.
      </p>
    </SectionCard>
  )

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
      case 'odometro':
        return renderOdometro()
      case 'wifi':
        return renderWifi()
      case 'publicidad':
        return renderPublicidad()
      case 'cierre':
        return renderCierre()
      default:
        return null
    }
  }

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(submitInspection)}
        onKeyDown={(e) => {
          // Prevenir envío con Enter si no estamos en el paso final
          if (e.key === 'Enter' && step !== steps.length - 1) {
            e.preventDefault()
          }
        }}
        className="space-y-8"
        aria-label="Formulario principal New Mini-Check"
      >
        <Card className="space-y-4 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <Label htmlFor="busSearch">PPU o Nº interno</Label>
              <Input
                id="busSearch"
                placeholder="Ej: SHRS75"
                value={busQuery}
                onChange={(event) => setBusQuery(event.target.value.toUpperCase())}
              />
              {suggestions.length > 0 && (
                <div className="mt-2 rounded-2xl border border-slate-100 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {suggestions.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-4 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                      onClick={() => {
                        const value = record.ppu.toUpperCase()
                        setBusQuery(value)
                        searchBus(value)
                      }}
                    >
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {record.ppu} · #{record.numero_interno}
                      </span>
                      <span className="text-xs text-slate-500">Terminal {record.terminal}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              type="button"
              className="gap-2 rounded-2xl"
              variant="outline"
              onClick={() => searchBus()}
            >
              <Search className="h-4 w-4" /> Buscar bus
            </Button>
          </div>
          {bus && (
            <div className="rounded-2xl bg-slate-50/80 p-4 text-sm dark:bg-slate-900/40">
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                {bus.ppu} · #{bus.numero_interno} · {bus.marca} {bus.modelo}
              </p>
              <p className="text-slate-500">Terminal asignado: {bus.terminal}</p>
            </div>
          )}
          {busAlert && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              {busAlert}
            </div>
          )}
        </Card>

        {/* BANNER GPS NO AUTORIZADO */}
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

        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {steps.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${step === index
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-900/40'
                  }`}
                onClick={() => attemptNavigateToStep(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Card>

        {validationMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {validationMessage}
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`step-${step}-${stepKey}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <Button type="button" variant="ghost" disabled={step === 0} onClick={handlePrev}>
            Paso anterior
          </Button>
          {stepKey === 'cierre' ? (
            <Button type="submit" disabled={saving} className="rounded-2xl">
              {saving ? 'Guardando...' : 'Enviar revisión'}
            </Button>
          ) : (
            <Button type="button" onClick={handleNext} className="rounded-2xl">
              Continuar
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  )
}
