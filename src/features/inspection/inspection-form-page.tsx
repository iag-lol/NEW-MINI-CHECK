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

const publicidadAreaSchema = z.object({
  tiene: z.boolean(),
  danio: z.boolean().nullable(),
  residuos: z.boolean().nullable(),
  observacion: z.string().optional(),
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
    certificacion: z.enum(['BUENA', 'DAÑADA']).nullable(),
    sonda: z.enum(['BUENA', 'DAÑADA']).nullable(),
    manometro: z.enum(['BUENO', 'DAÑADO']).nullable(),
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
  })

const steps = [
  { key: 'estado', label: 'Estado general' },
  { key: 'tag', label: 'TAG' },
  { key: 'camaras', label: 'Cámaras' },
  { key: 'extintores', label: 'Extintores' },
  { key: 'odometro', label: 'Odómetro' },
  { key: 'mobileye', label: 'Mobileye' },
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
      { value: 'BUENA', label: 'Buena' },
      { value: 'DAÑADA', label: 'Dañada' },
    ],
  },
  {
    key: 'sonda' as const,
    label: 'Sonda',
    placeholder: 'Estado de la sonda',
    options: [
      { value: 'BUENA', label: 'Buena' },
      { value: 'DAÑADA', label: 'Dañada' },
    ],
  },
  {
    key: 'manometro' as const,
    label: 'Manómetro',
    placeholder: 'Estado del manómetro',
    options: [
      { value: 'BUENO', label: 'Bueno' },
      { value: 'DAÑADO', label: 'Dañado' },
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

  const searchBus = async (override?: string) => {
    const source = override ?? busQuery
    if (!source.trim()) return
    const query = source.trim().toUpperCase()
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
  }

  useEffect(() => {
    if (!trackingLocation) {
      setTerminalDetected(null)
      return
    }

    const detected = detectTerminal(trackingLocation.lat, trackingLocation.lon)
    if (!detected) {
      setTerminalDetected(null)
      return
    }

    setTerminalDetected({ name: detected.terminal, distance: detected.distance })
    const currentTerminal = methods.getValues('terminalReportado')
    if (!currentTerminal || currentTerminal === user?.terminal) {
      methods.setValue('terminalReportado', detected.terminal, { shouldDirty: true })
    }
  }, [trackingLocation, methods, user?.terminal])

  useEffect(() => {
    if (estadoBus === 'EN_PANNE' && step !== 0 && step !== steps.length - 1) {
      setStep(0)
    }
  }, [estadoBus, step])

  useEffect(() => {
    const ppuParam = searchParams.get('ppu')
    if (ppuParam) {
      const normalized = ppuParam.toUpperCase()
      setBusQuery(normalized)
      searchBus(normalized)
      const next = new URLSearchParams(searchParams.toString())
      next.delete('ppu')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleNext = () => {
    attemptNavigateToStep(Math.min(step + 1, steps.length - 1))
  }
  const handlePrev = () => {
    attemptNavigateToStep(Math.max(step - 1, 0))
  }

  const submitInspection = async (values: InspectionForm) => {
    if (step !== steps.length - 1) {
      attemptNavigateToStep(steps.length - 1)
      return
    }

    const snapshot = methods.getValues()
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

      await supabase.from('tags').insert({
        revision_id: revisionData.id,
        tiene: values.tag.tiene,
        serie: values.tag.serie || null,
        observacion: values.tag.observacion || null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      await supabase.from('camaras').insert({
        revision_id: revisionData.id,
        monitor_estado: values.camaras.monitorEstado,
        detalle: {
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
        observacion: values.camaras.observacion || null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

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

      if (values.mobileye.aplica) {
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
        lectura: values.odometro.lectura,
        estado: values.odometro.estado,
        observacion: values.odometro.observacion ?? null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

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
        nombre_publicidad: null,
        observacion: null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      }

      await supabase.from('publicidad').insert(publicidadPayload)

      const extintorCritico =
        !values.extintores.tiene ||
        values.extintores.certificacion === 'DAÑADA' ||
        (values.extintores.presion && values.extintores.presion !== 'OPTIMO') ||
        (values.extintores.cilindro && values.extintores.cilindro !== 'OK') ||
        values.extintores.sonda === 'DAÑADA' ||
        values.extintores.manometro === 'DAÑADO' ||
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
          for (const stepConfig of steps) {
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
    if (targetIndex < 0 || targetIndex >= steps.length) return false
    if (targetIndex > step) {
      const snapshot = methods.getValues()
      for (let current = step; current < targetIndex; current++) {
        const issues = getMissingForStep(steps[current].key, snapshot)
        if (issues.length) {
          setValidationMessage(`${steps[current].label}: ${issues.join(' · ')}`)
          setStep(current)
          return false
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
            <Button type="button" className="gap-2 rounded-2xl" variant="outline" onClick={() => searchBus()}>
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

        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {steps.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
                  step === index
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

        <AnimatePresence mode="wait">
          <motion.div
            key={stepKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
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
