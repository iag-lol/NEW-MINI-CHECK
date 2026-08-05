import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  Bus,
  Calendar,
  CheckCircle2,
  Gauge,
  Globe,
  MapPin,
  ShieldCheck,
  Ticket,
  User,
  X,
  XCircle,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type FlotaRow = Tables<'flota'>
type RevisionRow = Tables<'revisiones'>
type TagRow = Tables<'tags'>
type CamarasRow = Tables<'camaras'>
type ExtintoresRow = Tables<'extintores'>
type MobileyeRow = Tables<'mobileye'>
type OdometroRow = Tables<'odometro'>
type RackRow = Tables<'rack'>
type PublicidadRow = Tables<'publicidad'>
type WifiRow = Tables<'wifi'>
type TicketRow = Tables<'tickets'>

type Rango = '1m' | '2m' | 'all'

interface BusReport {
  bus: FlotaRow | null
  revisiones: RevisionRow[]
  tags: Map<string, TagRow>
  camaras: Map<string, CamarasRow>
  extintores: Map<string, ExtintoresRow>
  mobileyes: Map<string, MobileyeRow>
  odometros: Map<string, OdometroRow>
  racks: Map<string, RackRow>
  publicidades: Map<string, PublicidadRow>
  wifis: Map<string, WifiRow>
  tickets: TicketRow[]
}

const porRevision = <T extends { revision_id: string }>(rows: T[] | null): Map<string, T> => {
  const map = new Map<string, T>()
  ;(rows ?? []).forEach((row) => {
    if (!map.has(row.revision_id)) map.set(row.revision_id, row)
  })
  return map
}

const fetchBusReport = async (ppu: string, rango: Rango): Promise<BusReport> => {
  const desde =
    rango === 'all' ? null : dayjs().subtract(rango === '1m' ? 1 : 2, 'month').toISOString()

  let revisionesQuery = supabase
    .from('revisiones')
    .select('*')
    .eq('bus_ppu', ppu)
    .order('created_at', { ascending: false })
    .limit(500)
  if (desde) revisionesQuery = revisionesQuery.gte('created_at', desde)

  const [
    { data: bus },
    { data: revisiones },
    { data: tags },
    { data: camaras },
    { data: extintores },
    { data: mobileyes },
    { data: odometros },
    { data: racks },
    { data: publicidades },
    { data: wifis },
  ] = await Promise.all([
    supabase.from('flota').select('*').eq('ppu', ppu).maybeSingle(),
    revisionesQuery,
    supabase.from('tags').select('*').eq('bus_ppu', ppu).limit(1000),
    supabase.from('camaras').select('*').eq('bus_ppu', ppu).limit(1000),
    supabase.from('extintores').select('*').eq('bus_ppu', ppu).limit(1000),
    supabase.from('mobileye').select('*').eq('bus_ppu', ppu).limit(1000),
    supabase.from('odometro').select('*').eq('bus_ppu', ppu).limit(1000),
    supabase.from('rack').select('*').eq('bus_ppu', ppu).limit(1000),
    supabase.from('publicidad').select('*').eq('bus_ppu', ppu).limit(1000),
    supabase.from('wifi').select('*').eq('bus_ppu', ppu).limit(1000),
  ])

  const revisionIds = ((revisiones as RevisionRow[]) ?? []).map((rev) => rev.id)
  let tickets: TicketRow[] = []
  if (revisionIds.length > 0) {
    const { data: ticketsData } = await supabase
      .from('tickets')
      .select('*')
      .in('revision_id', revisionIds)
      .order('created_at', { ascending: false })
      .limit(1000)
    tickets = (ticketsData as TicketRow[]) ?? []
  }

  return {
    bus: (bus as FlotaRow) ?? null,
    revisiones: (revisiones as RevisionRow[]) ?? [],
    tags: porRevision(tags as TagRow[]),
    camaras: porRevision(camaras as CamarasRow[]),
    extintores: porRevision(extintores as ExtintoresRow[]),
    mobileyes: porRevision(mobileyes as MobileyeRow[]),
    odometros: porRevision(odometros as OdometroRow[]),
    racks: porRevision(racks as RackRow[]),
    publicidades: porRevision(publicidades as PublicidadRow[]),
    wifis: porRevision(wifis as WifiRow[]),
    tickets,
  }
}

// ---------- Detección de problemas por módulo ----------

const camaraDetalle = (detalle: CamarasRow['detalle'], keys: string[]): boolean | null => {
  if (!detalle || typeof detalle !== 'object') return null
  const record = detalle as Record<string, unknown>
  for (const key of keys) {
    if (key in record && typeof record[key] === 'boolean') return record[key] as boolean
  }
  return null
}

const contarProblemasRevision = (report: BusReport, revId: string): number => {
  let problemas = 0
  const tag = report.tags.get(revId)
  if (tag && !tag.tiene) problemas += 1
  const ext = report.extintores.get(revId)
  if (ext) {
    if (!ext.tiene) problemas += 1
    if (ext.certificacion === 'VENCIDA') problemas += 1
    if (ext.sonda && ext.sonda !== 'OK') problemas += 1
    if (ext.manometro && ext.manometro !== 'OK') problemas += 1
    if (ext.presion && ext.presion !== 'OPTIMO') problemas += 1
    if (ext.cilindro && ext.cilindro !== 'OK') problemas += 1
    if (ext.porta && ext.porta !== 'TIENE') problemas += 1
  }
  const cam = report.camaras.get(revId)
  if (cam) {
    if (cam.monitor_estado !== 'FUNCIONA') problemas += 1
    for (const key of ['camDelantera', 'camCabina', 'camInteriores', 'camTrasera']) {
      if (camaraDetalle(cam.detalle, [key]) === false) problemas += 1
    }
  }
  const mob = report.mobileyes.get(revId)
  if (mob) {
    for (const value of [mob.alerta_izq, mob.alerta_der, mob.consola, mob.sensor_frontal, mob.sensor_izq, mob.sensor_der]) {
      if (value === false) problemas += 1
    }
  }
  const odo = report.odometros.get(revId)
  if (odo && odo.estado !== 'OK') problemas += 1
  const rack = report.racks.get(revId)
  if (rack) {
    if (rack.tiene_disco_duro === false) problemas += 1
    if (rack.tiene_candado === false) problemas += 1
    if (rack.cerraduras_buen_estado === false) problemas += 1
  }
  const pub = report.publicidades.get(revId)
  if (pub) {
    if (pub.danio) problemas += 1
    if (pub.residuos) problemas += 1
  }
  const wifi = report.wifis.get(revId)
  if (wifi) {
    if (wifi.ppu_visible === false) problemas += 1
    if (wifi.bus_encendido === false) problemas += 1
    if (wifi.tiene_internet === false) problemas += 1
  }
  return problemas
}

// ---------- Tarjeta de módulo ----------

interface ModuleRowItem {
  label: string
  value: string
  bad?: boolean
}

type ModuleStatus = 'ok' | 'problema' | 'sin-dato'

const ModuleCard = ({
  title,
  status,
  rows,
}: {
  title: string
  status: ModuleStatus
  rows: ModuleRowItem[]
}) => (
  <div
    className={`rounded-xl border p-3 ${
      status === 'problema'
        ? 'border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20'
        : status === 'ok'
        ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10'
        : 'border-slate-200/70 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40'
    }`}
  >
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{title}</p>
      {status === 'problema' ? (
        <Badge variant="danger" className="gap-1 px-1.5 py-0 text-[9px]">
          <XCircle className="h-2.5 w-2.5" /> Problema
        </Badge>
      ) : status === 'ok' ? (
        <Badge variant="success" className="gap-1 px-1.5 py-0 text-[9px]">
          <CheckCircle2 className="h-2.5 w-2.5" /> OK
        </Badge>
      ) : (
        <Badge variant="default" className="px-1.5 py-0 text-[9px]">Sin registro</Badge>
      )}
    </div>
    {status === 'sin-dato' ? (
      <p className="text-[11px] text-slate-400">Módulo no inspeccionado en esta revisión.</p>
    ) : (
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 text-[11px] leading-tight">
            <span className="shrink-0 text-slate-500 dark:text-slate-400">{row.label}</span>
            <span
              className={`truncate text-right font-semibold ${
                row.bad ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'
              }`}
              title={row.value}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
)

const siNo = (value: boolean | null | undefined, positivo = 'SI', negativo = 'NO') => {
  if (value === null || value === undefined) return '—'
  return value ? positivo : negativo
}

// El nombre de la campaña histórico quedó guardado en la observación de cada lado
const nombrePublicidadDe = (pub: PublicidadRow): string => {
  if (pub.nombre_publicidad?.trim()) return pub.nombre_publicidad
  const lados = pub.detalle_lados as Record<
    string,
    { tiene?: boolean; observacion?: string }
  > | null
  if (!lados) return '—'
  const nombres = (['izquierda', 'derecha', 'luneta'] as const)
    .map((key) => lados[key])
    .filter((lado) => lado?.tiene && typeof lado.observacion === 'string' && lado.observacion.trim())
    .map((lado) => (lado?.observacion as string).trim())
  return [...new Set(nombres)].join(' · ') || '—'
}

// ============================================================
// DIALOGO PRINCIPAL
// ============================================================

interface BusReportDialogProps {
  ppu: string | null
  onClose: () => void
}

export const BusReportDialog = ({ ppu, onClose }: BusReportDialogProps) => {
  const [rango, setRango] = useState<Rango>('1m')
  const [revisionId, setRevisionId] = useState<string | null>(null)

  // Bloquear el scroll de la página mientras el informe está abierto
  useEffect(() => {
    if (!ppu) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [ppu])

  const { data: report, isLoading } = useQuery({
    queryKey: ['bus-report', ppu, rango],
    queryFn: () => fetchBusReport(ppu as string, rango),
    enabled: Boolean(ppu),
  })

  // Al cargar/cambiar datos, seleccionar la revisión más reciente
  useEffect(() => {
    if (report && report.revisiones.length > 0) {
      setRevisionId((prev) =>
        prev && report.revisiones.some((rev) => rev.id === prev) ? prev : report.revisiones[0].id
      )
    } else {
      setRevisionId(null)
    }
  }, [report])

  const revision = report?.revisiones.find((rev) => rev.id === revisionId) ?? null

  const kpis = useMemo(() => {
    if (!report) return null
    const total = report.revisiones.length
    const panne = report.revisiones.filter((rev) => rev.estado_bus === 'EN_PANNE').length
    const pctOperativo = total > 0 ? (((total - panne) / total) * 100).toFixed(0) : '—'
    const ticketsAbiertos = report.tickets.filter((t) => t.estado !== 'RESUELTO').length
    const ultima = report.revisiones[0]
    const diasDesde = ultima ? dayjs().diff(dayjs(ultima.created_at), 'day') : null
    const problemasUltima = ultima ? contarProblemasRevision(report, ultima.id) : 0
    const inspectores = new Set(report.revisiones.map((rev) => rev.inspector_nombre)).size
    return { total, panne, pctOperativo, ticketsAbiertos, diasDesde, problemasUltima, inspectores }
  }, [report])

  const chartData = useMemo(() => {
    if (!report) return { odo: [], problemas: [] }
    const asc = [...report.revisiones].reverse()
    const odo = asc
      .map((rev) => {
        const lectura = report.odometros.get(rev.id)?.lectura
        return lectura !== undefined && lectura !== null
          ? { fecha: dayjs(rev.created_at).format('DD/MM'), km: lectura }
          : null
      })
      .filter((v): v is { fecha: string; km: number } => v !== null)
    const problemas = asc.map((rev) => ({
      fecha: dayjs(rev.created_at).format('DD/MM'),
      problemas: contarProblemasRevision(report, rev.id),
      panne: rev.estado_bus === 'EN_PANNE',
    }))
    return { odo, problemas }
  }, [report])

  const moduleCards = useMemo(() => {
    if (!report || !revision) return []
    const revId = revision.id

    const cards: { title: string; status: ModuleStatus; rows: ModuleRowItem[] }[] = []

    const tag = report.tags.get(revId)
    cards.push({
      title: '🏷️ TAG',
      status: tag ? (tag.tiene ? 'ok' : 'problema') : 'sin-dato',
      rows: tag
        ? [
            { label: 'Tiene TAG', value: siNo(tag.tiene, 'TIENE', 'NO TIENE'), bad: !tag.tiene },
            { label: 'N° serie', value: tag.serie || '—' },
            { label: 'Observación', value: tag.observacion || '—' },
          ]
        : [],
    })

    const ext = report.extintores.get(revId)
    const extBad =
      ext !== undefined &&
      (!ext.tiene ||
        ext.certificacion === 'VENCIDA' ||
        (ext.sonda !== null && ext.sonda !== 'OK') ||
        (ext.manometro !== null && ext.manometro !== 'OK') ||
        (ext.presion !== null && ext.presion !== 'OPTIMO') ||
        (ext.cilindro !== null && ext.cilindro !== 'OK') ||
        (ext.porta !== null && ext.porta !== 'TIENE'))
    cards.push({
      title: '🧯 Extintor',
      status: ext ? (extBad ? 'problema' : 'ok') : 'sin-dato',
      rows: ext
        ? [
            { label: 'Tiene', value: siNo(ext.tiene), bad: !ext.tiene },
            {
              label: 'Vencimiento',
              value:
                ext.vencimiento_mes && ext.vencimiento_anio
                  ? `${String(ext.vencimiento_mes).padStart(2, '0')}/${ext.vencimiento_anio}`
                  : '—',
            },
            { label: 'Certificación', value: ext.certificacion ?? '—', bad: ext.certificacion === 'VENCIDA' },
            { label: 'Sonda', value: ext.sonda?.replace(/_/g, ' ') ?? '—', bad: Boolean(ext.sonda && ext.sonda !== 'OK') },
            { label: 'Manómetro', value: ext.manometro?.replace(/_/g, ' ') ?? '—', bad: Boolean(ext.manometro && ext.manometro !== 'OK') },
            { label: 'Presión', value: ext.presion?.replace(/_/g, ' ') ?? '—', bad: Boolean(ext.presion && ext.presion !== 'OPTIMO') },
            { label: 'Cilindro', value: ext.cilindro ?? '—', bad: Boolean(ext.cilindro && ext.cilindro !== 'OK') },
            { label: 'Porta extintor', value: ext.porta?.replace(/_/g, ' ') ?? '—', bad: Boolean(ext.porta && ext.porta !== 'TIENE') },
          ]
        : [],
    })

    const cam = report.camaras.get(revId)
    const camKeys: [string, string][] = [
      ['Cám. delantera', 'camDelantera'],
      ['Cám. cabina', 'camCabina'],
      ['Cám. interiores', 'camInteriores'],
      ['Cám. trasera', 'camTrasera'],
      ['Visibles en monitor', 'visiblesMonitor'],
      ['Activa en reversa', 'activaReversa'],
      ['Activa puertas', 'activaPuertas'],
    ]
    const camBad =
      cam !== undefined &&
      (cam.monitor_estado !== 'FUNCIONA' ||
        camKeys.some(([, key]) => camaraDetalle(cam.detalle, [key]) === false))
    cards.push({
      title: '📹 Cámaras',
      status: cam ? (camBad ? 'problema' : 'ok') : 'sin-dato',
      rows: cam
        ? [
            {
              label: 'Monitor',
              value: cam.monitor_estado.replace(/_/g, ' '),
              bad: cam.monitor_estado !== 'FUNCIONA',
            },
            ...camKeys.map(([label, key]) => {
              const value = camaraDetalle(cam.detalle, [key])
              return {
                label,
                value: value === null ? '—' : value ? 'OK' : 'CON FALLA',
                bad: value === false,
              }
            }),
            { label: 'Observación', value: cam.observacion || '—' },
          ]
        : [],
    })

    const mob = report.mobileyes.get(revId)
    const mobItems: [string, boolean | null][] = mob
      ? [
          ['Alerta izquierda', mob.alerta_izq],
          ['Alerta derecha', mob.alerta_der],
          ['Consola', mob.consola],
          ['Sensor frontal', mob.sensor_frontal],
          ['Sensor izquierdo', mob.sensor_izq],
          ['Sensor derecho', mob.sensor_der],
        ]
      : []
    cards.push({
      title: '🛡️ Mobileye',
      status: mob ? (mobItems.some(([, v]) => v === false) ? 'problema' : 'ok') : 'sin-dato',
      rows: mob
        ? [
            ...mobItems.map(([label, value]) => ({
              label,
              value: value === null ? '—' : value ? 'TIENE' : 'DAÑADO',
              bad: value === false,
            })),
            { label: 'Observación', value: mob.observacion || '—' },
          ]
        : [],
    })

    const odo = report.odometros.get(revId)
    cards.push({
      title: '⏱️ Odómetro',
      status: odo ? (odo.estado !== 'OK' ? 'problema' : 'ok') : 'sin-dato',
      rows: odo
        ? [
            { label: 'Lectura', value: `${odo.lectura.toLocaleString('es-CL')} km` },
            { label: 'Estado', value: odo.estado.replace(/_/g, ' '), bad: odo.estado !== 'OK' },
            { label: 'Observación', value: odo.observacion || '—' },
          ]
        : [],
    })

    const rack = report.racks.get(revId)
    const rackBad =
      rack !== undefined &&
      (rack.tiene_disco_duro === false ||
        rack.tiene_candado === false ||
        rack.cerraduras_buen_estado === false)
    cards.push({
      title: '💾 Rack',
      status: rack ? (rackBad ? 'problema' : 'ok') : 'sin-dato',
      rows: rack
        ? [
            { label: 'Disco duro', value: siNo(rack.tiene_disco_duro), bad: rack.tiene_disco_duro === false },
            { label: 'Seguridad extra', value: siNo(rack.tiene_seguridad_extra) },
            { label: 'Candado', value: siNo(rack.tiene_candado), bad: rack.tiene_candado === false },
            { label: 'Cerraduras OK', value: siNo(rack.cerraduras_buen_estado), bad: rack.cerraduras_buen_estado === false },
            { label: 'Cerraduras esperadas', value: String(rack.cantidad_cerraduras_esperada) },
            { label: 'Observación', value: rack.observacion || '—' },
          ]
        : [],
    })

    const wifi = report.wifis.get(revId)
    const wifiBad =
      wifi !== undefined &&
      (wifi.ppu_visible === false || wifi.bus_encendido === false || wifi.tiene_internet === false)
    cards.push({
      title: '📶 WiFi',
      status: wifi ? (wifiBad ? 'problema' : 'ok') : 'sin-dato',
      rows: wifi
        ? [
            { label: 'PPU visible', value: siNo(wifi.ppu_visible), bad: wifi.ppu_visible === false },
            { label: 'Bus encendido', value: siNo(wifi.bus_encendido), bad: wifi.bus_encendido === false },
            { label: 'Con internet', value: siNo(wifi.tiene_internet), bad: wifi.tiene_internet === false },
            { label: 'Observación', value: wifi.observacion || '—' },
          ]
        : [],
    })

    const pub = report.publicidades.get(revId)
    cards.push({
      title: '📢 Publicidad',
      status: pub ? (pub.danio || pub.residuos ? 'problema' : 'ok') : 'sin-dato',
      rows: pub
        ? [
            { label: 'Tiene', value: siNo(pub.tiene) },
            { label: 'Nombre campaña', value: nombrePublicidadDe(pub) },
            { label: 'Con daño', value: siNo(pub.danio), bad: pub.danio === true },
            { label: 'Residuos', value: siNo(pub.residuos), bad: pub.residuos === true },
            { label: 'Observación', value: pub.observacion || '—' },
          ]
        : [],
    })

    return cards
  }, [report, revision])

  const open = Boolean(ppu)
  const ticketsAbiertos = report?.tickets.filter((t) => t.estado !== 'RESUELTO') ?? []
  const ticketsResueltos = report?.tickets.filter((t) => t.estado === 'RESUELTO') ?? []

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-md sm:p-5"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="glass-panel-strong flex h-[100dvh] w-full flex-col overflow-hidden shadow-2xl sm:h-[92vh] sm:max-w-6xl sm:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Encabezado */}
            <div className="relative bg-gradient-to-r from-slate-900 via-brand-800 to-brand-600 px-4 py-4 text-white sm:px-6 sm:py-5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar informe del bus"
                className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-2xl bg-white/15 p-3">
                  <Bus className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black tracking-wide sm:text-2xl">{ppu}</h2>
                    {revision && (
                      <Badge
                        variant={revision.estado_bus === 'EN_PANNE' ? 'danger' : 'success'}
                        className="uppercase"
                      >
                        {revision.estado_bus === 'EN_PANNE' ? 'En panne' : 'Operativo'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-white/80">
                    {report?.bus
                      ? `N° ${report.bus.numero_interno} · ${report.bus.marca} ${report.bus.modelo} ${report.bus.anio} · Terminal ${report.bus.terminal}`
                      : 'Informe completo de inspecciones'}
                  </p>
                </div>
                <div className="ml-auto flex gap-1 rounded-2xl border border-white/15 bg-slate-950/30 p-1">
                  {(
                    [
                      ['1m', '1 mes'],
                      ['2m', '2 meses'],
                      ['all', 'Todo'],
                    ] as [Rango, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRango(value)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        rango === value
                          ? 'bg-white text-brand-700 shadow'
                          : 'text-white/80 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPIs */}
              {kpis && (
                <div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6 sm:gap-2">
                  {[
                    { label: 'Revisiones', value: kpis.total, icon: Activity },
                    { label: '% Operativo', value: `${kpis.pctOperativo}%`, icon: CheckCircle2 },
                    { label: 'En panne', value: kpis.panne, icon: AlertTriangle },
                    { label: 'Problemas últ. rev.', value: kpis.problemasUltima, icon: XCircle },
                    { label: 'Tickets abiertos', value: kpis.ticketsAbiertos, icon: Ticket },
                    {
                      label: 'Última revisión',
                      value: kpis.diasDesde === null ? '—' : kpis.diasDesde === 0 ? 'Hoy' : `Hace ${kpis.diasDesde} d`,
                      icon: Calendar,
                    },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-xl border border-white/15 bg-slate-950/30 px-3 py-2"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/70">
                        <kpi.icon className="h-3 w-3" /> {kpi.label}
                      </div>
                      <p className="mt-0.5 text-lg font-bold text-white">{kpi.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-4">
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                  Cargando historial completo del bus…
                </div>
              ) : !report || report.revisiones.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
                  <Bus className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Sin revisiones en el rango seleccionado
                  </p>
                  <p className="text-xs text-slate-400">
                    Prueba ampliando el rango a "Todo" para ver el historial completo.
                  </p>
                </div>
              ) : (
                <Tabs defaultValue="resumen">
                  <TabsList className="mb-4 flex w-full flex-wrap">
                    <TabsTrigger value="resumen" className="flex-1">📊 Resumen</TabsTrigger>
                    <TabsTrigger value="modulos" className="flex-1">🔍 Módulos</TabsTrigger>
                    <TabsTrigger value="seguridad" className="flex-1">🌐 IPs y Seguridad</TabsTrigger>
                    <TabsTrigger value="tickets" className="flex-1">
                      🎫 Tickets ({report.tickets.length})
                    </TabsTrigger>
                  </TabsList>

                  {/* ---------- RESUMEN ---------- */}
                  <TabsContent value="resumen" className="space-y-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
                        <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                          <XCircle className="h-4 w-4 text-red-500" /> Problemas detectados por revisión
                        </p>
                        <div className="mt-3 h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData.problemas}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="fecha" stroke="#94a3b8" fontSize={11} />
                              <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} />
                              <RechartsTooltip
                                formatter={(value: number) => [`${value} problemas`, 'Detectados']}
                              />
                              <Bar dataKey="problemas" radius={[6, 6, 0, 0]}>
                                {chartData.problemas.map((entry, index) => (
                                  <Cell
                                    key={index}
                                    fill={entry.panne ? '#f97316' : entry.problemas > 0 ? '#eab308' : '#22c55e'}
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Verde: sin problemas · Amarillo: con problemas · Naranja: bus en panne
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
                        <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                          <Gauge className="h-4 w-4 text-brand-500" /> Evolución del odómetro (km)
                        </p>
                        <div className="mt-3 h-48">
                          {chartData.odo.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData.odo}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="fecha" stroke="#94a3b8" fontSize={11} />
                                <YAxis
                                  stroke="#94a3b8"
                                  fontSize={10}
                                  domain={['auto', 'auto']}
                                  tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                                />
                                <RechartsTooltip
                                  formatter={(value: number) => [`${value.toLocaleString('es-CL')} km`, 'Lectura']}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="km"
                                  stroke="#3b5bff"
                                  strokeWidth={2.5}
                                  dot={{ r: 4, fill: '#3b5bff' }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-400">
                              Sin lecturas de odómetro en el rango.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Línea de tiempo */}
                    <div className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
                      <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                        <Activity className="h-4 w-4 text-brand-500" /> Línea de tiempo de revisiones
                      </p>
                      <div className="mt-3 max-h-60 overflow-y-auto overscroll-contain pr-2">
                        <div className="space-y-2">
                          {report.revisiones.map((rev) => {
                            const problemas = contarProblemasRevision(report, rev.id)
                            return (
                              <button
                                key={rev.id}
                                type="button"
                                onClick={() => setRevisionId(rev.id)}
                                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                                  rev.id === revisionId
                                    ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-950/30'
                                    : 'border-slate-200/70 hover:border-brand-300 dark:border-slate-800'
                                }`}
                              >
                                <span
                                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                    rev.estado_bus === 'EN_PANNE' ? 'bg-orange-500' : 'bg-emerald-500'
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                                    {dayjs(rev.created_at).format('dddd DD MMM YYYY · HH:mm')} hrs
                                    <span className="ml-2 font-normal text-slate-400">
                                      Semana {rev.semana_iso}
                                    </span>
                                  </p>
                                  <p className="truncate text-[11px] text-slate-500">
                                    <User className="mr-1 inline h-3 w-3" />
                                    {rev.inspector_nombre} · {rev.terminal_detectado || rev.terminal_reportado}
                                  </p>
                                </div>
                                {problemas > 0 ? (
                                  <Badge variant="danger" className="shrink-0 text-[10px]">
                                    {problemas} problema{problemas > 1 ? 's' : ''}
                                  </Badge>
                                ) : (
                                  <Badge variant="success" className="shrink-0 text-[10px]">
                                    Sin problemas
                                  </Badge>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ---------- MÓDULOS ---------- */}
                  <TabsContent value="modulos" className="space-y-4">
                    {/* Selector de revisión */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {report.revisiones.map((rev) => (
                        <button
                          key={rev.id}
                          type="button"
                          onClick={() => setRevisionId(rev.id)}
                          className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                            rev.id === revisionId
                              ? 'border-brand-500 bg-brand-600 text-white shadow'
                              : 'border-slate-200/70 text-slate-600 hover:border-brand-300 dark:border-slate-800 dark:text-slate-300'
                          }`}
                        >
                          Sem {rev.semana_iso.split('-W')[1] ?? rev.semana_iso}
                          <span className="ml-1.5 font-normal opacity-75">
                            {dayjs(rev.created_at).format('DD/MM')}
                          </span>
                        </button>
                      ))}
                    </div>

                    {revision && (
                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <span className="font-semibold">
                          {dayjs(revision.created_at).format('dddd DD MMMM YYYY · HH:mm')} hrs
                        </span>{' '}
                        · Inspector <span className="font-semibold">{revision.inspector_nombre}</span> (
                        {revision.inspector_rut}) · Terminal{' '}
                        {revision.terminal_detectado || revision.terminal_reportado}
                        {revision.observaciones && (
                          <p className="mt-1 italic text-slate-500">"{revision.observaciones}"</p>
                        )}
                      </div>
                    )}

                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {moduleCards.map((card) => (
                        <ModuleCard key={card.title} {...card} />
                      ))}
                    </div>
                  </TabsContent>

                  {/* ---------- IPS Y SEGURIDAD ---------- */}
                  <TabsContent value="seguridad" className="space-y-4">
                    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800">
                      <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
                        <ShieldCheck className="h-4 w-4 text-brand-500" />
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          Trazabilidad de accesos · quién, cuándo y desde dónde
                        </p>
                      </div>
                      <div className="max-h-[52vh] overflow-auto overscroll-contain">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                            <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                              <th className="px-4 py-2">Fecha y hora</th>
                              <th className="px-4 py-2">Semana</th>
                              <th className="px-4 py-2">Inspector</th>
                              <th className="px-4 py-2">Dirección IP</th>
                              <th className="px-4 py-2">Ubicación red</th>
                              <th className="px-4 py-2">Coordenadas GPS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.revisiones.map((rev) => (
                              <tr
                                key={rev.id}
                                className="border-t border-slate-100 dark:border-slate-800/60"
                              >
                                <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                                  {dayjs(rev.created_at).format('DD/MM/YYYY HH:mm')}
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">{rev.semana_iso}</td>
                                <td className="px-4 py-2.5">
                                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                                    {rev.inspector_nombre}
                                  </p>
                                  <p className="text-[10px] text-slate-400">{rev.inspector_rut}</p>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    <Globe className="mr-1 inline h-3 w-3 text-brand-500" />
                                    {rev.ip_address ?? 'Sin IP'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">
                                  {rev.ip_info
                                    ? [rev.ip_info.city, rev.ip_info.region, rev.ip_info.isp]
                                        .filter(Boolean)
                                        .join(' · ') || '—'
                                    : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">
                                  <MapPin className="mr-1 inline h-3 w-3 text-slate-400" />
                                  {typeof rev.lat === 'number' && typeof rev.lon === 'number'
                                    ? `${rev.lat.toFixed(5)}, ${rev.lon.toFixed(5)}`
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {kpis?.inspectores ?? 0} inspector(es) distintos han revisado este bus en el rango
                      seleccionado. Las IP y coordenadas se registran automáticamente en cada inspección.
                    </p>
                  </TabsContent>

                  {/* ---------- TICKETS ---------- */}
                  <TabsContent value="tickets" className="space-y-4">
                    {report.tickets.length === 0 ? (
                      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200/80 text-center dark:border-slate-800">
                        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                          Sin tickets generados para este bus en el rango
                        </p>
                      </div>
                    ) : (
                      <>
                        {ticketsAbiertos.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-red-500">
                              Abiertos ({ticketsAbiertos.length})
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {ticketsAbiertos.map((ticket) => (
                                <TicketCard key={ticket.id} ticket={ticket} report={report} />
                              ))}
                            </div>
                          </div>
                        )}
                        {ticketsResueltos.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-600">
                              Resueltos ({ticketsResueltos.length})
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {ticketsResueltos.map((ticket) => (
                                <TicketCard key={ticket.id} ticket={ticket} report={report} />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>

            {/* Pie */}
            <div className="flex items-center justify-between border-t border-slate-200/70 px-4 py-2.5 dark:border-slate-800 sm:px-6 sm:py-3">
              <p className="text-[11px] text-slate-400">
                Informe generado en tiempo real desde la base de datos · Mini-Check
              </p>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

const TicketCard = ({ ticket, report }: { ticket: TicketRow; report: BusReport }) => {
  const revision = report.revisiones.find((rev) => rev.id === ticket.revision_id)
  return (
    <div className="rounded-2xl border border-slate-200/70 p-3.5 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{ticket.modulo}</p>
        <div className="flex gap-1.5">
          <Badge
            className="text-[10px] uppercase"
            variant={
              ticket.prioridad === 'ALTA' ? 'danger' : ticket.prioridad === 'MEDIA' ? 'warning' : 'default'
            }
          >
            {ticket.prioridad}
          </Badge>
          <Badge
            className="text-[10px] uppercase"
            variant={
              ticket.estado === 'PENDIENTE' ? 'danger' : ticket.estado === 'EN_PROCESO' ? 'warning' : 'success'
            }
          >
            {ticket.estado.replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{ticket.descripcion}</p>
      <p className="mt-2 text-[10px] text-slate-400">
        Creado {dayjs(ticket.created_at).format('DD/MM/YYYY HH:mm')} · {ticket.terminal}
        {revision && ` · Detectado en revisión del ${dayjs(revision.created_at).format('DD/MM/YYYY')}`}
      </p>
    </div>
  )
}
