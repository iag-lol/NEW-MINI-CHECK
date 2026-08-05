import { useEffect, useMemo, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, LayerGroup, Marker, Tooltip as LeafletTooltip } from 'react-leaflet'
import { divIcon, type Map as LeafletMap } from 'leaflet'
import {
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  Activity,
  Bus,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  Search,
  Globe,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { exportAllModulesToXlsx, exportExecutivePdf } from '@/lib/exporters'
import { ConsolidadosDialog } from '@/features/dashboard/components/consolidados-dialog'
import { BusReportDialog } from '@/features/dashboard/components/bus-report-dialog'
import { IpPerformanceDialog } from '@/features/dashboard/components/ip-performance-dialog'
import { Card, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Skeleton, SkeletonCard, SkeletonChart } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Tables } from '@/types/database'
import { TERMINAL_GEOFENCES, type TerminalSlug } from '@/constants/geofences'
import { detectTerminal } from '@/lib/geofence'
import { useActiveInspectors } from '@/hooks/use-active-inspectors'
import { useAuthStore } from '@/store/auth-store'
import { useWeekFilter } from '@/hooks/use-week-filter'
import { WeekSelector } from '@/components/week-selector'

type BaseLayerKey = 'street' | 'satellite'

const escapeHtml = (value: string) =>
  value.replace(/[<>&"']/g, '')

/** Segundos máximos desde el último pulso GPS para considerar a un inspector "EN VIVO" */
const ONLINE_THRESHOLD_SEC = 60

/** Horas máximas de inactividad antes de sacar a un inspector del mapa */
const MAX_INACTIVITY_HOURS = 24

/** Usuarios ocultos del centro geoespacial */
const HIDDEN_RUTS = ['15.839.906-7', '18.866.264-1']

const createInspectorIcon = (label: string, name: string, color: string, online: boolean) =>
  divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
      <div style="position:relative;">
        <div style="
          display:flex;
          align-items:center;
          justify-content:center;
          width:34px;
          height:34px;
          border-radius:50%;
          background:${color};
          color:#fff;
          font-size:12px;
          font-weight:700;
          border:2px solid rgba(255,255,255,0.95);
          box-shadow:0 6px 14px rgba(15,23,42,0.35);
          ${online ? '' : 'filter:grayscale(0.6);opacity:0.75;'}
        ">${escapeHtml(label)}</div>
        <span class="${online ? 'marker-live-dot' : ''}" style="
          position:absolute;
          top:-2px;
          right:-2px;
          width:11px;
          height:11px;
          border-radius:50%;
          background:${online ? '#22c55e' : '#94a3b8'};
          border:2px solid #fff;
        "></span>
      </div>
      <span style="
        background:rgba(15,23,42,0.88);
        color:#fff;
        font-size:10px;
        font-weight:600;
        padding:2px 8px;
        border-radius:9px;
        white-space:nowrap;
        box-shadow:0 2px 6px rgba(15,23,42,0.3);
      ">${escapeHtml(name)}${online ? '' : ' · inactivo'}</span>
    </div>`,
    iconSize: [120, 56],
    iconAnchor: [60, 20],
  })

const createBusIcon = (enPanne: boolean) =>
  divIcon({
    className: '',
    html: `<div class="marker-bus" style="
      display:flex;
      align-items:center;
      justify-content:center;
      width:34px;
      height:34px;
      border-radius:12px;
      background:${enPanne ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'linear-gradient(135deg,#22c55e,#16a34a)'};
      border:2px solid rgba(255,255,255,0.95);
      box-shadow:0 6px 16px rgba(15,23,42,0.4);
      font-size:17px;
      cursor:pointer;
    ">🚌</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })

const isInspectorOnline = (lastHeartbeat: string) =>
  dayjs().diff(dayjs(lastHeartbeat), 'second') <= ONLINE_THRESHOLD_SEC

/** Formatea el tiempo desde el último pulso con precisión de segundos */
const formatPulse = (lastHeartbeat: string) => {
  const seconds = dayjs().diff(dayjs(lastHeartbeat), 'second')
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min ${seconds % 60} s`
  return dayjs(lastHeartbeat).fromNow()
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const useWeeklyRevisions = (start: string, end: string) => {
  return useQuery({
    queryKey: ['revisiones', { start, end }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revisiones')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Tables<'revisiones'>[]
    },
    refetchInterval: 20_000,
  })
}

const useTickets = (start: string, end: string) =>
  useQuery({
    queryKey: ['tickets', { start, end }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Tables<'tickets'>[]
    },
    refetchInterval: 30_000,
  })

export const DashboardPage = () => {
  const [exporting, setExporting] = useState(false)
  const [consolidadosOpen, setConsolidadosOpen] = useState(false)
  const [busSearch, setBusSearch] = useState('')
  const [reportPpu, setReportPpu] = useState<string | null>(null)
  const [ipPerformanceOpen, setIpPerformanceOpen] = useState(false)

  // Tick cada 5 s para re-evaluar en vivo el estado de los pulsos GPS
  const [pulseTick, setPulseTick] = useState(0)
  useEffect(() => {
    const interval = window.setInterval(() => setPulseTick((tick) => tick + 1), 5000)
    return () => window.clearInterval(interval)
  }, [])
  const { user } = useAuthStore()
  const { weekInfo } = useWeekFilter()
  const { data: revisions, isLoading: revisionsLoading } = useWeeklyRevisions(
    weekInfo.startISO,
    weekInfo.endISO
  )
  const { data: tickets } = useTickets(weekInfo.startISO, weekInfo.endISO)
  const { data: flotaList } = useQuery({
    queryKey: ['flota-search'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flota')
        .select('ppu, numero_interno, terminal, marca, modelo')
        .order('ppu', { ascending: true })
        .limit(10000)
      if (error) throw error
      return data as Pick<Tables<'flota'>, 'ppu' | 'numero_interno' | 'terminal' | 'marca' | 'modelo'>[]
    },
    staleTime: 5 * 60_000,
  })

  const busMatches = useMemo(() => {
    const term = busSearch.trim().toUpperCase()
    if (term.length < 2 || !flotaList) return []
    return flotaList
      .filter(
        (bus) =>
          bus.ppu.toUpperCase().includes(term) || bus.numero_interno.toUpperCase().includes(term)
      )
      .slice(0, 8)
  }, [busSearch, flotaList])
  const { inspectors: liveInspectors } = useActiveInspectors()

  // Inspectores visibles: sin ocultos, con actividad en las últimas 24 h
  // y únicamente dentro de las geocercas de los terminales
  const visibleInspectors = useMemo(
    () =>
      liveInspectors.filter((inspector) => {
        if (HIDDEN_RUTS.includes(inspector.usuario_rut)) return false
        if (dayjs().diff(dayjs(inspector.last_heartbeat), 'hour') >= MAX_INACTIVITY_HOURS)
          return false
        if (typeof inspector.lat !== 'number' || typeof inspector.lon !== 'number') return false
        return detectTerminal(inspector.lat, inspector.lon) !== null
      }),
    // pulseTick fuerza la re-evaluación periódica de la ventana de 24 h
    [liveInspectors, pulseTick] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapRef = useRef<LeafletMap | null>(null)
  const [mapLayer, setMapLayer] = useState<BaseLayerKey>('satellite')
  const baseLayers = useMemo<Record<BaseLayerKey, { id: BaseLayerKey; label: string; url: string; attribution: string }>>(
    () => ({
      street: {
        id: 'street',
        label: 'Calles',
        url: mapToken
          ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${mapToken}`
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: mapToken ? '© Mapbox · © OpenStreetMap' : '© OpenStreetMap contributors',
      },
      satellite: {
        id: 'satellite',
        label: 'Satélite',
        url: mapToken
          ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${mapToken}`
          : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: mapToken ? '© Mapbox · © OpenStreetMap' : '© Esri · Earthstar Geographics',
      },
    }),
    [mapToken]
  )
  const currentLayer = baseLayers[mapLayer] ?? baseLayers.street

  const stats = useMemo(() => {
    if (!revisions) {
      return {
        total: 0,
        panne: 0,
        operativo: 0,
        terminalTop: '—',
        activity: [],
        status: [],
        terminals: [],
      }
    }
    const total = revisions.length
    const panne = revisions.filter((rev) => rev.estado_bus === 'EN_PANNE').length
    const operativo = total - panne
    const byDay = Array.from({ length: 7 }, (_, index) => {
      const day = weekInfo.start.add(index, 'day')
      const daily = revisions.filter((rev) => dayjs(rev.created_at).isSame(day, 'day'))
      return {
        day: day.format('ddd'),
        total: daily.length,
      }
    })
    const byStatus = [
      { name: 'Operativo', value: operativo },
      { name: 'En panne', value: panne },
    ]
    const byTerminal = revisions.reduce<Record<string, number>>((acc, revision) => {
      const terminal = revision.terminal_detectado || revision.terminal_reportado
      acc[terminal] = (acc[terminal] ?? 0) + 1
      return acc
    }, {})
    const orderedTerminal = Object.entries(byTerminal)
      .map(([terminal, value]) => ({ terminal, value }))
      .sort((a, b) => b.value - a.value)
    return {
      total,
      panne,
      operativo,
      terminalTop: orderedTerminal[0]?.terminal ?? '—',
      activity: byDay,
      status: byStatus,
      terminals: orderedTerminal,
    }
  }, [revisions, weekInfo.start])

  const revisionById = useMemo(() => {
    const map = new Map<string, Tables<'revisiones'>>()
    revisions?.forEach((revision) => map.set(revision.id, revision))
    return map
  }, [revisions])

  const ticketMarkers = useMemo(() => {
    if (!tickets) return []
    return tickets
      .map((ticket) => {
        const revision = revisionById.get(ticket.revision_id)
        if (!revision) return null
        return { ticket, revision }
      })
      .filter(
        (value): value is { ticket: Tables<'tickets'>; revision: Tables<'revisiones'> } => value !== null
      )
  }, [revisionById, tickets])

  const pendingTickets = tickets?.filter((ticket) => ticket.estado !== 'RESUELTO') ?? []

  const latestRevisions = revisions?.slice(0, 6) ?? []

  // Un solo ícono de bus por PPU: la revisión más reciente con coordenadas
  const busMapMarkers = useMemo(() => {
    if (!revisions) return []
    const porPpu = new Map<string, Tables<'revisiones'>>()
    revisions.forEach((revision) => {
      if (typeof revision.lat !== 'number' || typeof revision.lon !== 'number') return
      if (!porPpu.has(revision.bus_ppu)) porPpu.set(revision.bus_ppu, revision)
    })
    return [...porPpu.values()]
  }, [revisions])

  const flyToTerminal = (terminal: TerminalSlug) => {
    const fence = TERMINAL_GEOFENCES.find((item) => item.name === terminal)
    if (fence && mapRef.current) {
      mapRef.current.flyTo([fence.lat, fence.lon], 15, { duration: 1.2 })
    }
  }

  const resetMapView = () => {
    if (mapRef.current) {
      mapRef.current.flyTo([-33.46, -70.65], 11, { duration: 1 })
    }
  }

  if (revisionsLoading) {
    return (
      <div className="space-y-3 sm:space-y-6">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-3 sm:gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <Skeleton className="mb-2 h-6 w-1/3" />
            <Skeleton className="mb-4 h-4 w-1/2" />
            <SkeletonChart />
          </Card>
          <SkeletonCard />
        </div>
      </div>
    )
  }

  const operationalRate = stats.total > 0 ? (stats.operativo / stats.total) * 100 : 0

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel relative overflow-hidden rounded-[var(--app-radius-lg)] p-3 sm:p-5"
      >
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-brand-400/15 blur-3xl" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">Centro de control</p>
            <h1 className="text-[19px] font-extrabold tracking-[-0.04em] text-slate-950 dark:text-white sm:text-2xl">
              Dashboard de Supervisión
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Vista consolidada · Semana {weekInfo.weekNumber} de {weekInfo.year}
            </p>
          </div>

          <div className="relative flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center lg:max-w-[48rem] lg:justify-end">
            {/* Buscador de PPU */}
            <div className="relative w-full sm:w-auto">
              <div className="glass-control flex h-11 items-center gap-2 rounded-xl border px-3 transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-300/20">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={busSearch}
                  onChange={(event) => setBusSearch(event.target.value)}
                  placeholder="Buscar PPU o N° bus…"
                  aria-label="Buscar bus por PPU o número interno"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 sm:w-40 dark:text-slate-100"
                  spellCheck={false}
                />
                {busSearch && (
                  <button
                    type="button"
                    onClick={() => setBusSearch('')}
                    aria-label="Limpiar búsqueda"
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              {busMatches.length > 0 && (
                <div className="glass-panel-strong absolute left-0 top-full z-[1100] mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl">
                  {busMatches.map((bus) => (
                    <button
                      key={bus.ppu}
                      type="button"
                      onClick={() => {
                        setReportPpu(bus.ppu)
                        setBusSearch('')
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-brand-50 dark:hover:bg-brand-950/30"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {bus.ppu}
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            N° {bus.numero_interno}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {bus.marca} {bus.modelo} · {bus.terminal}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase text-brand-500">
                        Ver informe →
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {busSearch.trim().length >= 2 && busMatches.length === 0 && (
                <div className="glass-panel-strong absolute left-0 top-full z-[1100] mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl px-4 py-3 text-xs text-slate-400">
                  Sin coincidencias para "{busSearch.trim()}"
                </div>
              )}
            </div>

            {/* Rendimiento por IP y colaborador */}
            <Button
              className="gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-indigo-400"
              onClick={() => setIpPerformanceOpen(true)}
            >
              <Globe className="h-4 w-4" />
              Rendimiento IP
            </Button>

            {/* Selector de Semana Global */}
            <WeekSelector />

            {/* Última actualización */}
            <div className="glass-control flex h-10 items-center gap-2 rounded-xl border px-3">
              <Clock className="h-4 w-4 text-slate-400" />
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {dayjs().format('HH:mm')}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard
          title="Revisiones Totales"
          value={stats.total}
          description="Buses revisados esta semana"
          icon={Activity}
          variant="default"
        />
        <StatCard
          title="Buses Operativos"
          value={stats.operativo}
          description={`${operationalRate.toFixed(1)}% de operatividad`}
          icon={Bus}
          variant="success"
        />
        <StatCard
          title="Buses en Panne"
          value={stats.panne}
          description="Requieren atención inmediata"
          icon={AlertTriangle}
          variant={stats.panne > 0 ? 'danger' : 'default'}
        />
        <StatCard
          title="Tickets Abiertos"
          value={pendingTickets.length}
          description={`${pendingTickets.filter((t) => t.estado === 'EN_PROCESO').length} en proceso`}
          icon={AlertCircle}
          variant={pendingTickets.length > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid gap-3 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Actividad diaria</CardTitle>
          <p className="text-sm text-slate-500">Conteo por día · lunes a domingo</p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.activity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#3b5bff"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#3b5bff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle>Estado operativo</CardTitle>
          <p className="text-sm text-slate-500">Distribución semanal</p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.status}>
                <defs>
                  <linearGradient id="operativo" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="panne" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <RechartsTooltip />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#22c55e"
                  fill="url(#operativo)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Terminales</CardTitle>
          <p className="text-sm text-slate-500">Comparativo por terminal en la semana</p>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.terminals}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="terminal" stroke="#94a3b8" />
                <YAxis allowDecimals={false} stroke="#94a3b8" />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle>Exportar</CardTitle>
          <p className="text-sm text-slate-500">Descarga inmediata</p>
          <Button
            className="mt-6 w-full gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 shadow-lg shadow-brand-500/25 hover:from-brand-500 hover:to-brand-400"
            onClick={() => setConsolidadosOpen(true)}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Consolidados semanales
          </Button>
          <Button
            className="mt-3 w-full gap-2 rounded-2xl"
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              await exportAllModulesToXlsx(weekInfo.startISO, weekInfo.endISO).catch((error) =>
                console.error('Error exportando XLSX', error)
              )
              setExporting(false)
            }}
          >
            <DownloadCloud className="h-4 w-4" />
            XLSX semana {weekInfo.weekNumber}
          </Button>
          <Button
            className="mt-3 w-full gap-2 rounded-2xl"
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              await exportExecutivePdf(weekInfo.startISO, weekInfo.endISO).catch((error) =>
                console.error('Error exportando PDF', error)
              )
              setExporting(false)
            }}
          >
            <DownloadCloud className="h-4 w-4" />
            PDF semana {weekInfo.weekNumber}
          </Button>
          <p className="mt-4 text-xs text-slate-400">
            Consolidados semanales descarga los 4 archivos oficiales (Cámaras, Mobileye, TAG y
            Revisión Semanal). También puedes descargar reportes granulares desde Reportes.
          </p>
        </Card>
      </div>

      {user?.cargo === 'SUPERVISOR' ? (
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Centro geoespacial en vivo</CardTitle>
            <p className="text-sm text-slate-500">
              Seguimiento satelital, inspectores conectados y tickets críticos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.values(baseLayers) as Array<(typeof baseLayers)[BaseLayerKey]>).map(
              (layer) => (
                <Button
                  key={layer.id}
                  variant={mapLayer === layer.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMapLayer(layer.id)}
                >
                  {layer.label}
                </Button>
              )
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TERMINAL_GEOFENCES.map((terminal) => (
            <Button
              key={terminal.name}
              variant="outline"
              size="sm"
              onClick={() => flyToTerminal(terminal.name)}
            >
              {terminal.name}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={resetMapView}>
            Ver todos
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-600 text-[11px]">🚌</span>
            Bus revisado operativo · clic para informe completo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-orange-600 text-[11px]">🚌</span>
            Bus revisado en panne
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Inspector EN VIVO (pulso GPS &lt; {ONLINE_THRESHOLD_SEC} s)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
            Inspector inactivo
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-100/80 dark:border-slate-900">
            <MapContainer
              center={[-33.46, -70.65]}
              zoom={11}
              scrollWheelZoom
              className="h-full w-full"
              ref={mapRef}
            >
              <TileLayer
                key={currentLayer.id}
                url={currentLayer.url}
                attribution={currentLayer.attribution}
              />
              <LayerGroup>
                {TERMINAL_GEOFENCES.map((fence) => (
                  <Circle
                    key={fence.name}
                    center={[fence.lat, fence.lon]}
                    radius={fence.radius}
                    pathOptions={{ color: '#0ea5e9', fillOpacity: 0.08 }}
                  >
                    <Popup>
                      <p className="text-sm font-semibold">{fence.name}</p>
                      <p className="text-xs text-slate-500">Geocerca de {fence.radius} m</p>
                    </Popup>
                  </Circle>
                ))}
              </LayerGroup>
              <LayerGroup>
                {busMapMarkers.map((revision) => (
                  <Marker
                    key={`bus-${revision.id}`}
                    position={[revision.lat, revision.lon]}
                    icon={createBusIcon(revision.estado_bus === 'EN_PANNE')}
                    eventHandlers={{
                      click: () => setReportPpu(revision.bus_ppu),
                    }}
                  >
                    <LeafletTooltip
                      direction="top"
                      offset={[0, -14]}
                      opacity={1}
                      className="bus-tooltip"
                    >
                      <span className="font-bold">{revision.bus_ppu}</span>
                      <span className="ml-1.5 opacity-75">
                        {revision.estado_bus === 'EN_PANNE' ? '· En panne' : '· Operativo'}
                      </span>
                    </LeafletTooltip>
                  </Marker>
                ))}
              </LayerGroup>
              <LayerGroup>
                {visibleInspectors.map((inspector) => {
                  const isSelf = user?.rut === inspector.usuario_rut
                  const online = isInspectorOnline(inspector.last_heartbeat)
                  const firstName = inspector.nombre.split(' ').filter(Boolean).slice(0, 2).join(' ')
                  const icon = createInspectorIcon(
                    getInitials(inspector.nombre),
                    firstName,
                    isSelf ? '#22c55e' : '#0284c7',
                    online
                  )
                  return (
                    <Marker
                      key={`inspector-${inspector.usuario_rut}`}
                      position={[inspector.lat, inspector.lon]}
                      icon={icon}
                      zIndexOffset={online ? 1000 : 0}
                    >
                      <Popup>
                        <p className="text-sm font-semibold">{inspector.nombre}</p>
                        <p className="text-xs text-slate-500">
                          {online
                            ? `🟢 EN VIVO · pulso ${formatPulse(inspector.last_heartbeat)}`
                            : `⚪ Inactivo · último pulso ${formatPulse(inspector.last_heartbeat)}`}
                          <br />
                          {inspector.terminal} · Precisión GPS ±
                          {Math.round(inspector.accuracy ?? 0)} m
                          <br />
                          Última señal {dayjs(inspector.last_heartbeat).format('HH:mm:ss')} hrs
                        </p>
                      </Popup>
                    </Marker>
                  )
                })}
              </LayerGroup>
              <LayerGroup>
                {ticketMarkers.map(({ ticket, revision }) => (
                  <CircleMarker
                    key={`ticket-${ticket.id}`}
                    center={[revision.lat, revision.lon]}
                    radius={9}
                    color={
                      ticket.estado === 'PENDIENTE'
                        ? '#ef4444'
                        : ticket.estado === 'EN_PROCESO'
                        ? '#facc15'
                        : '#14b8a6'
                    }
                    weight={3}
                    opacity={0.8}
                  >
                    <Popup>
                      <p className="text-sm font-semibold">{ticket.modulo}</p>
                      <p className="text-xs text-slate-500">
                        {ticket.descripcion}
                        <br />
                        Estado: {ticket.estado}
                      </p>
                    </Popup>
                  </CircleMarker>
                ))}
              </LayerGroup>
            </MapContainer>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100/80 p-4 dark:border-slate-900">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Inspectores activos en vivo ({visibleInspectors.length})
              </p>
              <ScrollArea className="mt-3 h-40 pr-3">
                {visibleInspectors.length === 0 && (
                  <p className="text-xs text-slate-400">
                    Sin inspectores dentro de terminales en las últimas 24 horas.
                  </p>
                )}
                {visibleInspectors.map((inspector) => {
                  const online = isInspectorOnline(inspector.last_heartbeat)
                  return (
                  <div key={inspector.usuario_rut} className="mb-3 text-xs last:mb-0">
                    <p className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-white">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          online ? 'marker-live-dot bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                      {inspector.nombre}
                      {online && (
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          En vivo
                        </span>
                      )}
                    </p>
                    <p className="text-slate-500">
                      {inspector.terminal} · ±{Math.round(inspector.accuracy ?? 0)} m · pulso{' '}
                      {formatPulse(inspector.last_heartbeat)} (
                      {dayjs(inspector.last_heartbeat).format('HH:mm:ss')})
                    </p>
                  </div>
                  )
                })}
              </ScrollArea>
            </div>
            <div className="rounded-2xl border border-slate-100/80 p-4 dark:border-slate-900">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Tickets geolocalizados ({ticketMarkers.length})
              </p>
              <ScrollArea className="mt-3 h-40 pr-3">
                {ticketMarkers.length === 0 && (
                  <p className="text-xs text-slate-400">Sin tickets con coordenadas disponibles.</p>
                )}
                {ticketMarkers.map(({ ticket, revision }) => (
                  <div key={ticket.id} className="mb-3 text-xs last:mb-0">
                    <p className="font-semibold text-slate-800 dark:text-white">
                      {ticket.modulo} · {ticket.estado}
                    </p>
                    <p className="text-slate-500">
                      {revision.bus_ppu} · {revision.terminal_detectado}
                    </p>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
        </div>
      </Card>
      ) : (
        <Card className="space-y-3">
          <div>
            <CardTitle>Centro geoespacial</CardTitle>
            <p className="text-sm text-slate-500">
              Esta vista solo está disponible para supervisores. Contacta a tu supervisor si necesitas acceso.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Últimas revisiones</CardTitle>
          <ScrollArea className="mt-4 h-80 pr-4">
            <div className="space-y-4">
              {latestRevisions.map((revision) => (
                <div
                  key={revision.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100/80 px-4 py-3 text-sm dark:border-slate-900"
                >
                  <div>
                    <p className="text-base font-semibold text-slate-900 dark:text-white">
                      {revision.bus_ppu}
                    </p>
                    <p className="text-xs text-slate-400">
                      {revision.estado_bus === 'EN_PANNE' ? 'En panne' : 'Operativo'} ·{' '}
                      {dayjs(revision.created_at).format('ddd HH:mm')}
                    </p>
                  </div>
                  {revision.estado_bus === 'EN_PANNE' ? (
                    <Badge variant="danger" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      En panne
                    </Badge>
                  ) : (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Operativo
                    </Badge>
                  )}
                </div>
              ))}
              {latestRevisions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200/80 p-6 text-center text-sm text-slate-400 dark:border-slate-800">
                  Sin revisiones esta semana todavía.
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
        <Card>
          <CardTitle>Tickets activos</CardTitle>
          <ScrollArea className="mt-4 h-80 pr-4">
            <div className="space-y-4">
              {pendingTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-900"
                >
                  <p className="text-base font-semibold text-slate-900 dark:text-white">
                    {ticket.modulo}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ticket.terminal} · prioridad {ticket.prioridad.toLowerCase()}
                  </p>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">{ticket.descripcion}</p>
                  <Badge
                    className="mt-3 uppercase"
                    variant={ticket.estado === 'PENDIENTE' ? 'danger' : 'warning'}
                  >
                    {ticket.estado}
                  </Badge>
                </div>
              ))}
              {pendingTickets.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200/80 p-6 text-center text-sm text-slate-400 dark:border-slate-800">
                  Todos los tickets están resueltos.
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      <ConsolidadosDialog
        open={consolidadosOpen}
        onClose={() => setConsolidadosOpen(false)}
        startISO={weekInfo.startISO}
        endISO={weekInfo.endISO}
        weekNumber={weekInfo.weekNumber}
        year={weekInfo.year}
      />

      <BusReportDialog ppu={reportPpu} onClose={() => setReportPpu(null)} />

      <IpPerformanceDialog open={ipPerformanceOpen} onClose={() => setIpPerformanceOpen(false)} />
    </div>
  )
}
