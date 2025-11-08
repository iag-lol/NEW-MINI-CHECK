import { useEffect, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, MapPin, Search } from 'lucide-react'
import { z } from 'zod'
import dayjs, { getIsoWeekYear } from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { detectTerminal } from '@/lib/geofence'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth-store'
import type { Tables } from '@/types/database'
import { useNotificationStore } from '@/store/notification-store'

const inspectionSchema = z.object({
  estadoBus: z.enum(['OPERATIVO', 'EN_PANNE']),
  observacionGeneral: z
    .string()
    .min(10, 'Describe brevemente el estado del bus')
    .max(600, 'Máximo 600 caracteres'),
  terminalReportado: z.string().min(2, 'Selecciona el terminal'),
  tag: z.object({
    tiene: z.boolean(),
    serie: z.string().optional(),
    observacion: z.string().optional(),
  }),
  camaras: z.object({
    monitor: z.enum(['FUNCIONA', 'APAGADO', 'CON_DANO', 'SIN_SENAL']),
    puertas: z.boolean(),
    reversa: z.boolean(),
    visibles: z.boolean(),
    observacion: z.string().optional(),
  }),
  extintores: z.object({
    tiene: z.boolean(),
    vencimientoMes: z.coerce.number().min(1).max(12).optional(),
    vencimientoAnio: z.coerce.number().min(2023).max(2035).optional(),
    certificacion: z.enum(['VIGENTE', 'VENCIDA']).optional(),
    sonda: z.enum(['OK', 'SIN_LECTURA', 'FUERA_DE_RANGO']).optional(),
    manometro: z.enum(['OK', 'SIN_LECTURA', 'FUERA_DE_RANGO']).optional(),
    presion: z.enum(['SOBRECARGA', 'OPTIMO', 'BAJA_CARGA']).optional(),
    cilindro: z.enum(['OK', 'ABOLLADO', 'OXIDADO']).optional(),
    porta: z.enum(['TIENE', 'NO_TIENE', 'DANADO']).optional(),
    observacion: z.string().optional(),
  }),
  mobileye: z.object({
    aplica: z.boolean(),
    alertaIzq: z.boolean().optional(),
    alertaDer: z.boolean().optional(),
    consola: z.boolean().optional(),
    sensorFrontal: z.boolean().optional(),
    sensorIzq: z.boolean().optional(),
    sensorDer: z.boolean().optional(),
    observacion: z.string().optional(),
  }),
  odometro: z.object({
    lectura: z.coerce.number().min(0, 'Debe ser positivo'),
    estado: z.enum(['OK', 'INCONSISTENTE', 'NO_FUNCIONA']),
    observacion: z.string().optional(),
  }),
  publicidad: z.object({
    tiene: z.boolean(),
    nombre: z.string().optional(),
    danio: z.boolean().nullable().optional(),
    residuos: z.boolean().nullable().optional(),
    observacion: z.string().optional(),
  }),
})

type InspectionForm = z.infer<typeof inspectionSchema>

const steps = [
  { key: 'estado', label: 'Estado general' },
  { key: 'tag', label: 'TAG y cámaras' },
  { key: 'extintores', label: 'Extintores' },
  { key: 'mobileye', label: 'Mobileye' },
  { key: 'odometro', label: 'Odómetro y publicidad' },
  { key: 'cierre', label: 'Cierre' },
]

type CameraToggleField = 'camaras.puertas' | 'camaras.reversa' | 'camaras.visibles'
type PublicidadFlagField = 'publicidad.danio' | 'publicidad.residuos'
type MobileyeToggleField =
  | 'mobileye.alertaIzq'
  | 'mobileye.alertaDer'
  | 'mobileye.consola'
  | 'mobileye.sensorFrontal'
  | 'mobileye.sensorIzq'
  | 'mobileye.sensorDer'

export const InspectionFormPage = () => {
  const { user } = useAuthStore()
  const { push } = useNotificationStore()
  const methods = useForm<InspectionForm>({
    mode: 'onChange',
    defaultValues: {
      estadoBus: 'OPERATIVO',
      observacionGeneral: '',
      terminalReportado: user?.terminal ?? '',
      tag: { tiene: true, serie: '', observacion: '' },
      camaras: { monitor: 'FUNCIONA', puertas: true, reversa: true, visibles: true },
      extintores: { tiene: true },
      mobileye: { aplica: false },
      odometro: { estado: 'OK', lectura: 0 },
      publicidad: { tiene: false, danio: null, residuos: null, observacion: '' },
    },
  })
  const [step, setStep] = useState(0)
  const [busQuery, setBusQuery] = useState('')
  const [bus, setBus] = useState<Tables<'flota'> | null>(null)
  const [busAlert, setBusAlert] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(null)
  const [terminalDetected, setTerminalDetected] = useState<string | null>(null)
  const estadoBus = useWatch({ control: methods.control, name: 'estadoBus' })
  const tagTiene = useWatch({ control: methods.control, name: 'tag.tiene' })
  const extintorTiene = useWatch({ control: methods.control, name: 'extintores.tiene' })
  const publicidadTiene = useWatch({ control: methods.control, name: 'publicidad.tiene' })
  const mobileyeAplica = useWatch({ control: methods.control, name: 'mobileye.aplica' })
  const camMonitor = useWatch({ control: methods.control, name: 'camaras.monitor' })
  const cameraToggles: Array<{ label: string; field: CameraToggleField }> = [
    { label: 'Puertas', field: 'camaras.puertas' },
    { label: 'Reversa', field: 'camaras.reversa' },
    { label: 'Visibles', field: 'camaras.visibles' },
  ]
  const publicidadFlags: Array<{ label: string; field: PublicidadFlagField }> = [
    { label: 'Daño en gráfica', field: 'publicidad.danio' },
    { label: 'Residuos', field: 'publicidad.residuos' },
  ]
  const mobileyeFields: Array<{ label: string; field: MobileyeToggleField }> = [
    { label: 'Alerta Izquierda', field: 'mobileye.alertaIzq' },
    { label: 'Alerta Derecha', field: 'mobileye.alertaDer' },
    { label: 'Consola', field: 'mobileye.consola' },
    { label: 'Sensor frontal', field: 'mobileye.sensorFrontal' },
    { label: 'Sensor izquierdo', field: 'mobileye.sensorIzq' },
    { label: 'Sensor derecho', field: 'mobileye.sensorDer' },
  ]

  const requestLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCoordinates({ lat: latitude, lon: longitude })
        const detected = detectTerminal(latitude, longitude)
        if (detected) {
          setTerminalDetected(detected.terminal)
          methods.setValue('terminalReportado', detected.terminal, { shouldDirty: true })
        }
      },
      () => setTerminalDetected(null),
      { enableHighAccuracy: true }
    )
  }

  useEffect(() => {
    requestLocation()
  }, [])

  useEffect(() => {
    if (estadoBus === 'EN_PANNE' && step !== 0 && step !== steps.length - 1) {
      setStep(0)
    }
  }, [estadoBus, step])

  const searchBus = async () => {
    if (!busQuery.trim()) return
    const query = busQuery.trim().toUpperCase()
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
      .select('id, created_at')
      .eq('bus_ppu', busRecord.ppu)
      .order('created_at', { ascending: false })
      .limit(1)
    if (revisiones?.length && dayjs(revisiones[0].created_at).isoWeek() === currentWeek) {
      setBusAlert('Este bus ya tiene revisión registrada en la semana en curso.')
    }
    methods.setValue(
      'mobileye.aplica',
      busRecord.marca?.toLowerCase().includes('volvo') ?? false
    )
  }

  const submitInspection = async (values: InspectionForm) => {
    if (!user || !bus) {
      setBusAlert('Debes seleccionar un bus válido antes de enviar.')
      return
    }
    const guard = (
      condition: boolean,
      field: keyof InspectionForm | `${keyof InspectionForm}.${string}`,
      message: string,
      stepIndex: number
    ) => {
      if (condition) return true
      methods.setError(field as any, { type: 'manual', message })
      setStep(stepIndex)
      return false
    }

    if (
      !guard(
        values.tag.tiene ? Boolean(values.tag.serie?.trim()) : Boolean(values.tag.observacion?.trim()),
        values.tag.tiene ? ('tag.serie' as const) : ('tag.observacion' as const),
        values.tag.tiene
          ? 'La serie del TAG es obligatoria'
          : 'Describe la ausencia del TAG',
        1
      )
    ) {
      return
    }

    if (
      values.camaras.monitor !== 'FUNCIONA' &&
      !guard(
        Boolean(values.camaras.observacion?.trim()),
        'camaras.observacion',
        'Describe la falla del monitor',
        1
      )
    ) {
      return
    }

    if (
      !guard(
        values.extintores.tiene
          ? Boolean(
              values.extintores.vencimientoMes &&
                values.extintores.vencimientoAnio &&
                values.extintores.certificacion &&
                values.extintores.presion
            )
          : Boolean(values.extintores.observacion?.trim()),
        values.extintores.tiene
          ? ('extintores.vencimientoMes' as const)
          : ('extintores.observacion' as const),
        values.extintores.tiene
          ? 'Completa el vencimiento y certificación del extintor'
          : 'Describe por qué no tiene extintor',
        2
      )
    ) {
      return
    }

    if (
      values.mobileye.aplica &&
      [values.mobileye.alertaDer, values.mobileye.alertaIzq, values.mobileye.consola].some(
        (value) => value === false
      ) &&
      !guard(
        Boolean(values.mobileye.observacion?.trim()),
        'mobileye.observacion',
        'Describe la falla Mobileye detectada',
        3
      )
    ) {
      return
    }

    if (
      values.odometro.estado !== 'OK' &&
      !guard(
        Boolean(values.odometro.observacion?.trim()),
        'odometro.observacion',
        'Explica la anomalía del odómetro',
        4
      )
    ) {
      return
    }

    if (
      !guard(
        values.publicidad.tiene
          ? Boolean(values.publicidad.nombre?.trim())
          : Boolean(values.publicidad.observacion?.trim()),
        values.publicidad.tiene
          ? ('publicidad.nombre' as const)
          : ('publicidad.observacion' as const),
        values.publicidad.tiene
          ? 'Indica la campaña instalada'
          : 'Describe el estado de la carrocería',
        4
      )
    ) {
      return
    }

    if (
      !values.publicidad.tiene &&
      !guard(
        values.publicidad.danio !== null &&
          values.publicidad.danio !== undefined &&
          values.publicidad.residuos !== null &&
          values.publicidad.residuos !== undefined,
        'publicidad.danio',
        'Declara daño y residuos para carrocería',
        4
      )
    ) {
      return
    }

    setSaving(true)
    try {
      const revisionInsert = {
        inspector_rut: user.rut,
        inspector_nombre: user.nombre,
        terminal_detectado: terminalDetected ?? 'SIN_TERMINAL',
        terminal_reportado: values.terminalReportado,
        bus_ppu: bus.ppu,
        bus_interno: bus.numero_interno,
        estado_bus: values.estadoBus,
        lat: coordinates?.lat ?? -33.45,
        lon: coordinates?.lon ?? -70.66,
        observaciones: values.observacionGeneral,
        semana_iso: `${getIsoWeekYear()}-W${String(dayjs().isoWeek()).padStart(2, '0')}`,
        operativo: values.estadoBus === 'OPERATIVO',
      }
      const { data: revision, error } = await supabase
        .from('revisiones')
        .insert(revisionInsert)
        .select('id')
        .single()
      if (error) throw error

      await supabase.from('tags').insert({
        revision_id: revision.id,
        tiene: values.tag.tiene,
        serie: values.tag.serie || null,
        observacion: values.tag.observacion || null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      await supabase.from('camaras').insert({
        revision_id: revision.id,
        monitor_estado: values.camaras.monitor,
        detalle: {
          puertas: values.camaras.puertas,
          reversa: values.camaras.reversa,
          visibles: values.camaras.visibles,
        },
        observacion: values.camaras.observacion || null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      await supabase.from('extintores').insert({
        revision_id: revision.id,
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
          revision_id: revision.id,
          bus_marca: bus.marca,
          alerta_izq: values.mobileye.alertaIzq ?? false,
          alerta_der: values.mobileye.alertaDer ?? false,
          consola: values.mobileye.consola ?? false,
          sensor_frontal: values.mobileye.sensorFrontal ?? false,
          sensor_izq: values.mobileye.sensorIzq ?? false,
          sensor_der: values.mobileye.sensorDer ?? false,
          observacion: values.mobileye.observacion ?? null,
          bus_ppu: bus.ppu,
          terminal: values.terminalReportado,
        })
      }

      await supabase.from('odometro').insert({
        revision_id: revision.id,
        lectura: values.odometro.lectura,
        estado: values.odometro.estado,
        observacion: values.odometro.observacion ?? null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

      await supabase.from('publicidad').insert({
        revision_id: revision.id,
        tiene: values.publicidad.tiene,
        nombre_publicidad: values.publicidad.nombre ?? null,
        danio: values.publicidad.danio ?? null,
        residuos: values.publicidad.residuos ?? null,
        detalle_lados: null,
        observacion: values.publicidad.observacion ?? null,
        bus_ppu: bus.ppu,
        terminal: values.terminalReportado,
      })

    const triggeredTickets: Array<{ modulo: string; descripcion: string }> = []
      if (
        !values.extintores.tiene ||
        values.extintores.certificacion === 'VENCIDA' ||
        values.extintores.presion !== 'OPTIMO'
      ) {
        triggeredTickets.push({
          modulo: 'Extintores',
          descripcion: 'Revisión con hallazgos críticos en extintores',
        })
      }
      if (
        (values.publicidad.danio && values.publicidad.tiene === false) ||
        values.publicidad.residuos
      ) {
        triggeredTickets.push({
          modulo: 'Publicidad',
          descripcion: 'Publicidad con daño o residuos en carrocería',
        })
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
        triggeredTickets.push({
          modulo: 'Mobileye',
          descripcion: 'Se detectaron fallas en sensores Mobileye',
        })
      }
      if (triggeredTickets.length) {
      await supabase.from('tickets').insert(
        triggeredTickets.map((ticket) => ({
          revision_id: revision.id,
          descripcion: ticket.descripcion,
          modulo: ticket.modulo,
          estado: 'PENDIENTE' as const,
          prioridad: 'ALTA' as const,
          terminal: values.terminalReportado,
        }))
      )
      }

      push({
        id: revision.id,
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

  const nextStep = async () => {
    if (estadoBus === 'EN_PANNE') {
      setStep(steps.length - 1)
      return
    }
    const fieldsPerStep: Record<number, Array<keyof InspectionForm>> = {
      0: ['estadoBus', 'observacionGeneral', 'terminalReportado'],
      1: ['tag', 'camaras'],
      2: ['extintores'],
      3: ['mobileye'],
      4: ['odometro', 'publicidad'],
      5: [],
    }
    const currentFields = fieldsPerStep[step]
    if (currentFields.length) {
      const valid = await methods.trigger(currentFields as any, { shouldFocus: true })
      if (!valid) return
    }
    setStep((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const prevStep = () => setStep((prev) => Math.max(prev - 1, 0))

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(submitInspection)}
        className="space-y-8"
        aria-label="Formulario principal New Mini-Check"
      >
        <Card className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label htmlFor="busSearch">PPU o Nº interno</Label>
              <Input
                id="busSearch"
                placeholder="Ej: SHRS75"
                value={busQuery}
                onChange={(event) => setBusQuery(event.target.value.toUpperCase())}
              />
            </div>
            <Button
              type="button"
              className="gap-2 rounded-2xl"
              onClick={searchBus}
              variant="outline"
            >
              <Search className="h-4 w-4" />
              Buscar bus
            </Button>
          </div>
          {bus && (
            <div className="mt-4 rounded-2xl bg-slate-50/80 p-4 text-sm dark:bg-slate-900/40">
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                {bus.ppu} · #{bus.numero_interno} · {bus.marca} {bus.modelo}
              </p>
              <p className="text-slate-500">Terminal asignado: {bus.terminal}</p>
            </div>
          )}
          {busAlert && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              {busAlert}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            {steps.map((item, index) => {
              const isDisabled =
                estadoBus === 'EN_PANNE' && index !== 0 && index !== steps.length - 1
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                    step === index
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-900/40'
                  } ${isDisabled ? 'opacity-40' : ''}`}
                  disabled={isDisabled}
                  onClick={() => !isDisabled && setStep(index)}
                >
                  <span className="text-xs">{index + 1}</span>
                  {item.label}
                </button>
              )
            })}
          </div>
        </Card>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            {step === 0 && (
              <Card className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Estado del bus</Label>
                    <div className="mt-2 flex gap-3">
                      {['OPERATIVO', 'EN_PANNE'].map((state) => (
                        <Button
                          key={state}
                          type="button"
                          variant={estadoBus === state ? 'default' : 'outline'}
                          onClick={() => methods.setValue('estadoBus', state as any)}
                          className="flex-1 rounded-2xl"
                        >
                          {state === 'OPERATIVO' ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                          {state === 'OPERATIVO' ? 'Operativo' : 'En panne'}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Terminal</Label>
                    <Input
                      value={methods.watch('terminalReportado')}
                      onChange={(event) =>
                        methods.setValue('terminalReportado', event.target.value)
                      }
                    />
                    {terminalDetected && (
                      <p className="mt-1 text-xs text-emerald-500">
                        Detección automática: {terminalDetected}
                      </p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-2 gap-2 text-xs text-brand-600"
                      onClick={requestLocation}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      Recalcular por GPS
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Observación general</Label>
                  <Textarea
                    value={methods.watch('observacionGeneral')}
                    onChange={(event) =>
                      methods.setValue('observacionGeneral', event.target.value)
                    }
                  />
                </div>
              </Card>
            )}

            {step === 1 && (
              <Card className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>TAG instalado</Label>
                    <div className="mt-2 flex items-center gap-2">
                      <Switch
                        checked={tagTiene}
                        onCheckedChange={(checked) =>
                          methods.setValue('tag.tiene', checked, { shouldDirty: true })
                        }
                      />
                      <span className="text-sm text-slate-500">{tagTiene ? 'Sí' : 'No'}</span>
                    </div>
                    {tagTiene ? (
                      <Input
                        className="mt-2"
                        placeholder="Serie"
                        value={methods.watch('tag.serie') ?? ''}
                        onChange={(event) =>
                          methods.setValue('tag.serie', event.target.value, { shouldDirty: true })
                        }
                      />
                    ) : (
                      <Textarea
                        className="mt-2"
                        placeholder="Describe la observación"
                        value={methods.watch('tag.observacion') ?? ''}
                        onChange={(event) =>
                          methods.setValue('tag.observacion', event.target.value, {
                            shouldDirty: true,
                          })
                        }
                      />
                    )}
                  </div>
                  <div>
                    <Label>Monitor cámaras</Label>
                    <Select
                      value={camMonitor}
                      onValueChange={(value: InspectionForm['camaras']['monitor']) =>
                        methods.setValue('camaras.monitor', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FUNCIONA">Funciona</SelectItem>
                        <SelectItem value="APAGADO">Apagado</SelectItem>
                        <SelectItem value="CON_DANO">Con daño</SelectItem>
                        <SelectItem value="SIN_SENAL">Sin señal</SelectItem>
                      </SelectContent>
                    </Select>
                    {camMonitor !== 'FUNCIONA' ? (
                      <Textarea
                        className="mt-2"
                        placeholder="Describe la falla encontrada"
                        value={methods.watch('camaras.observacion') ?? ''}
                        onChange={(event) =>
                          methods.setValue('camaras.observacion', event.target.value)
                        }
                      />
                    ) : (
                      <div className="mt-2 flex gap-4">
                        {cameraToggles.map(({ label, field }) => {
                          const currentValue = methods.watch(field)
                          return (
                            <button
                              type="button"
                              key={field}
                              onClick={() =>
                                methods.setValue(field, !currentValue, {
                                  shouldDirty: true,
                                })
                              }
                              className={`flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold ${
                                currentValue
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 text-slate-500'
                              }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {step === 2 && (
              <Card className="space-y-6 p-6">
                <div>
                  <Label>Extintor instalado</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <Switch
                      checked={extintorTiene}
                      onCheckedChange={(checked) =>
                        methods.setValue('extintores.tiene', checked, { shouldDirty: true })
                      }
                    />
                    <span className="text-sm text-slate-500">{extintorTiene ? 'Sí' : 'No'}</span>
                  </div>
                </div>
                {extintorTiene ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      type="number"
                      placeholder="Mes vencimiento"
                      value={methods.watch('extintores.vencimientoMes') ?? ''}
                      onChange={(event) =>
                        methods.setValue('extintores.vencimientoMes', Number(event.target.value))
                      }
                    />
                    <Input
                      type="number"
                      placeholder="Año vencimiento"
                      value={methods.watch('extintores.vencimientoAnio') ?? ''}
                      onChange={(event) =>
                        methods.setValue('extintores.vencimientoAnio', Number(event.target.value))
                      }
                    />
                    <Select
                      value={methods.watch('extintores.certificacion') ?? undefined}
                      onValueChange={(value) =>
                        methods.setValue('extintores.certificacion', value as any)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Certificación" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIGENTE">Vigente</SelectItem>
                        <SelectItem value="VENCIDA">Vencida</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={methods.watch('extintores.presion') ?? undefined}
                      onValueChange={(value) =>
                        methods.setValue('extintores.presion', value as any)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Presión" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SOBRECARGA">Sobrecarga</SelectItem>
                        <SelectItem value="OPTIMO">Óptimo</SelectItem>
                        <SelectItem value="BAJA_CARGA">Baja carga</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Textarea
                    placeholder="Describe la observación obligatoria"
                    value={methods.watch('extintores.observacion') ?? ''}
                    onChange={(event) =>
                      methods.setValue('extintores.observacion', event.target.value)
                    }
                  />
                )}
              </Card>
            )}

            {step === 3 && (
              <Card className="space-y-6 p-6">
                <div>
                  <Label>Mobileye (solo buses Volvo)</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <Switch
                      checked={mobileyeAplica}
                      onCheckedChange={(checked) =>
                        methods.setValue('mobileye.aplica', checked, { shouldDirty: true })
                      }
                    />
                    <span className="text-sm text-slate-500">
                      {mobileyeAplica ? 'Aplicable' : 'No aplica'}
                    </span>
                  </div>
                </div>
                {mobileyeAplica && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {mobileyeFields.map(({ field, label }) => {
                      const value = methods.watch(field)
                      return (
                        <button
                          key={field}
                          type="button"
                          onClick={() =>
                            methods.setValue(field, !value, {
                              shouldDirty: true,
                            })
                          }
                          className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                            value
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-red-200 bg-red-50 text-red-600'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}

            {step === 4 && (
              <Card className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Lectura odómetro</Label>
                    <Input
                      type="number"
                      value={methods.watch('odometro.lectura')}
                      onChange={(event) =>
                        methods.setValue('odometro.lectura', Number(event.target.value))
                      }
                    />
                    <div className="mt-2">
                      <Select
                        value={methods.watch('odometro.estado')}
                        onValueChange={(value) =>
                          methods.setValue('odometro.estado', value as any)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="INCONSISTENTE">Inconsistente</SelectItem>
                          <SelectItem value="NO_FUNCIONA">No funciona</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Publicidad</Label>
                    <div className="mt-2 flex items-center gap-2">
                      <Switch
                        checked={publicidadTiene}
                        onCheckedChange={(checked) =>
                          methods.setValue('publicidad.tiene', checked, { shouldDirty: true })
                        }
                      />
                      <span className="text-sm text-slate-500">
                        {publicidadTiene ? 'Con publicidad' : 'Sin publicidad'}
                      </span>
                    </div>
                    {publicidadTiene ? (
                      <Input
                        className="mt-2"
                        placeholder="Nombre campaña"
                        value={methods.watch('publicidad.nombre') ?? ''}
                        onChange={(event) =>
                          methods.setValue('publicidad.nombre', event.target.value)
                        }
                      />
                    ) : (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {publicidadFlags.map(({ label, field }) => {
                          const value = methods.watch(field)
                          return (
                            <div key={field}>
                              <p className="text-xs uppercase tracking-wide text-slate-400">
                                {label}
                              </p>
                              <div className="mt-2 flex gap-2">
                                <Button
                                  type="button"
                                  variant={value === true ? 'destructive' : 'outline'}
                                  onClick={() => methods.setValue(field, true, { shouldDirty: true })}
                                >
                                  Sí
                                </Button>
                                <Button
                                  type="button"
                                  variant={value === false ? 'default' : 'outline'}
                                  onClick={() =>
                                    methods.setValue(field, false, { shouldDirty: true })
                                  }
                                >
                                  No
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {step === 5 && (
              <Card className="space-y-4 p-6">
                <h3 className="text-xl font-semibold">Confirmación</h3>
                <p className="text-sm text-slate-500">
                  Revisa la información capturada. Al enviar se dispararán notificaciones en
                  tiempo real al supervisor de terminal.
                </p>
                <div className="rounded-2xl bg-slate-50/80 p-4 text-sm dark:bg-slate-900/40">
                  <p>Bus: {bus?.ppu ?? '—'}</p>
                  <p>Estado: {estadoBus}</p>
                  <p>Terminal: {methods.watch('terminalReportado')}</p>
                </div>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0}
            onClick={prevStep}
            className="rounded-2xl"
          >
            Paso anterior
          </Button>
          <div className="flex gap-3">
            {step < steps.length - 1 ? (
              <Button type="button" onClick={nextStep} className="rounded-2xl">
                Continuar
              </Button>
            ) : (
              <Button type="submit" className="rounded-2xl" disabled={saving}>
                {saving ? 'Guardando...' : 'Enviar revisión'}
              </Button>
            )}
          </div>
        </div>
      </form>
    </FormProvider>
  )
}
