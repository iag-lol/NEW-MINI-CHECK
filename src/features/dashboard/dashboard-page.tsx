import { useEffect, useMemo, useState } from 'react'
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
import { LiveMap } from '@/features/dashboard/components/live-map'
import { Card, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Skeleton, SkeletonCard, SkeletonChart } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Tables } from '@/types/database'
import { detectTerminal } from '@/lib/geofence'
import { useActiveInspectors } from '@/hooks/use-active-inspectors'
import { useAuthStore } from '@/store/auth-store'
import { useWeekFilter } from '@/hooks/use-week-filter'
import { WeekSelector } from '@/components/week-selector'

/**
 * Segundos máximos desde el último pulso GPS para considerar a un inspector
 * "EN VIVO". El pulso llega cada 10 s: con 90 s de margen hacen falta ocho
 * fallos seguidos para marcar a alguien inactivo, así que un túnel, un
 * ascensor o un segundo de mala cobertura ya no lo apagan.
 */
const ONLINE_THRESHOLD_SEC = 90

/** Horas máximas de inactividad antes de sacar a un inspector del mapa */
const MAX_INACTIVITY_HOURS = 24

/** Usuarios ocultos del centro geoespacial */
const HIDDEN_RUTS = ['15.839.906-7', '18.866.264-1']

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
      <Card className="space-y-2.5 !p-2 sm:!p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pt-1">
          <div className="min-w-0">
            <CardTitle>Centro geoespacial en vivo</CardTitle>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
              Buses revisados, inspectores conectados y tickets críticos.
            </p>
          </div>
        </div>
        <LiveMap
          inspectores={visibleInspectors}
          buses={busMapMarkers}
          tickets={ticketMarkers}
          umbralEnVivoSeg={ONLINE_THRESHOLD_SEC}
          rutPropio={user?.rut}
          onSeleccionarBus={setReportPpu}
          tick={pulseTick}
          tokenMapbox={mapToken}
        />
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
