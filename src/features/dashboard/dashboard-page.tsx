import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  DownloadCloud,
  Activity,
  Bus,
  AlertCircle,
  FileSpreadsheet,
  FileText,
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
import { ModulosActivos } from '@/features/dashboard/components/modulos-activos'
import { Card, CardEyebrow, CardTitle } from '@/components/ui/card'
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
import { cn } from '@/lib/utils'

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

/* Estilo compartido de los tooltips de Recharts: los de fábrica salen con
   fondo blanco fijo y son ilegibles en modo noche */
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: 'none',
  fontSize: 12,
  padding: '8px 12px',
  background: 'rgba(15,23,42,0.92)',
  color: '#fff',
  boxShadow: '0 10px 24px -12px rgba(15,23,42,.6)',
} as const

const TOOLTIP_LABEL_STYLE = { color: '#cbd5e1', fontSize: 11 } as const

const GRID_STROKE = 'rgba(148,163,184,0.18)'
const AXIS_STROKE = '#94a3b8'

const COLOR_OPERATIVO = '#22c55e'
const COLOR_PANNE = '#f97316'

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

  // Semana anterior: da contexto a las cifras. "142 revisiones" no dice nada
  // hasta saber si la semana pasada fueron 90 o 200.
  const prevStartISO = useMemo(
    () => weekInfo.start.subtract(7, 'day').toISOString(),
    [weekInfo.start]
  )
  const prevEndISO = useMemo(
    () => weekInfo.start.subtract(1, 'millisecond').toISOString(),
    [weekInfo.start]
  )
  const { data: prevRevisions } = useWeeklyRevisions(prevStartISO, prevEndISO)

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
        busesUnicos: 0,
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
        esHoy: day.isSame(dayjs(), 'day'),
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
      busesUnicos: new Set(revisions.map((rev) => rev.bus_ppu)).size,
      terminalTop: orderedTerminal[0]?.terminal ?? '—',
      activity: byDay,
      status: byStatus,
      terminals: orderedTerminal,
    }
  }, [revisions, weekInfo.start])

  // Variación frente a la semana anterior, sólo cuando hay base de comparación
  const prevTotal = prevRevisions?.length ?? 0
  const variacionSemanal =
    prevTotal > 0 ? Math.round(((stats.total - prevTotal) / prevTotal) * 100) : null

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

  const latestRevisions = revisions?.slice(0, 8) ?? []

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
      <div className="space-y-3 sm:space-y-5">
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
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
  const esSupervisor = user?.cargo === 'SUPERVISOR'

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* ------------------------------------------------- Barra de mando */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel relative overflow-hidden rounded-[var(--app-radius-lg)] p-3 sm:p-4"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-brand-400/12 blur-3xl"
        />
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <CardEyebrow>Centro de control</CardEyebrow>
            <h1 className="text-[19px] font-extrabold leading-tight tracking-[-0.04em] text-slate-950 dark:text-white sm:text-2xl">
              Dashboard de Supervisión
            </h1>
            <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 sm:text-sm">
              Semana {weekInfo.weekNumber} · {weekInfo.label} · actualizado{' '}
              {dayjs().format('HH:mm')} hrs
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
            {/* Buscador de bus: abre el informe completo de la PPU */}
            <div className="relative w-full sm:w-56">
              <div className="glass-control flex h-10 items-center gap-2 rounded-[var(--app-radius-sm)] border px-3 transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-300/20">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={busSearch}
                  onChange={(event) => setBusSearch(event.target.value)}
                  placeholder="Buscar PPU o N° bus…"
                  aria-label="Buscar bus por PPU o número interno"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
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

            <Button className="h-10 gap-2" onClick={() => setIpPerformanceOpen(true)}>
              <Globe className="h-4 w-4" />
              Rendimiento IP
            </Button>

            <WeekSelector />
          </div>
        </div>
      </motion.div>

      {/* ---------------------------------------------------- Indicadores */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard
          title="Revisiones"
          value={stats.total}
          description={`${stats.busesUnicos} buses distintos`}
          icon={Activity}
          variant="info"
          trend={
            variacionSemanal !== null
              ? { value: variacionSemanal, label: 'vs semana previa' }
              : undefined
          }
        />
        <StatCard
          title="Operatividad"
          value={`${operationalRate.toFixed(0)}%`}
          description={`${stats.operativo} buses operativos`}
          icon={Bus}
          variant="success"
        />
        <StatCard
          title="En panne"
          value={stats.panne}
          description={
            prevTotal > 0
              ? `Semana previa: ${prevRevisions?.filter((r) => r.estado_bus === 'EN_PANNE').length ?? 0}`
              : 'Requieren atención'
          }
          icon={AlertTriangle}
          variant={stats.panne > 0 ? 'danger' : 'default'}
        />
        <StatCard
          title="Tickets abiertos"
          value={pendingTickets.length}
          description={`${pendingTickets.filter((t) => t.estado === 'EN_PROCESO').length} en proceso`}
          icon={AlertCircle}
          variant={pendingTickets.length > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* --------------------------------------------------- Análisis */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardEyebrow>Análisis</CardEyebrow>
          <CardTitle>Actividad diaria</CardTitle>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Revisiones por día · lunes a domingo
          </p>
          <div className="mt-4 h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.activity} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="actividad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-brand-500)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke={AXIS_STROKE}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  allowDecimals={false}
                  stroke={AXIS_STROKE}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <RechartsTooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(valor: number) => [valor, 'Revisiones']}
                  cursor={{ stroke: 'rgba(148,163,184,0.3)' }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--color-brand-500)"
                  strokeWidth={2.5}
                  fill="url(#actividad)"
                  dot={({ cx, cy, payload, index }) => (
                    <circle
                      key={`dot-${index}`}
                      cx={cx}
                      cy={cy}
                      r={payload.esHoy ? 5 : 3}
                      fill="var(--color-brand-500)"
                      stroke="#fff"
                      strokeWidth={payload.esHoy ? 2 : 0}
                    />
                  )}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Donut: dos categorías se comparan como partes de un todo, no con
            un gráfico de área que sugiere evolución temporal inexistente */}
        <Card>
          <CardEyebrow>Distribución</CardEyebrow>
          <CardTitle>Estado operativo</CardTitle>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Semana {weekInfo.weekNumber}
          </p>
          {stats.total === 0 ? (
            <div className="mt-4 flex h-56 items-center justify-center text-[12.5px] text-slate-400 sm:h-64">
              Sin revisiones esta semana todavía.
            </div>
          ) : (
            <>
              <div className="relative mx-auto mt-4 h-44 w-44 sm:h-48 sm:w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.status}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="68%"
                      outerRadius="100%"
                      paddingAngle={stats.panne > 0 ? 3 : 0}
                      strokeWidth={0}
                    >
                      <Cell fill={COLOR_OPERATIVO} />
                      <Cell fill={COLOR_PANNE} />
                    </Pie>
                    <RechartsTooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[26px] font-extrabold leading-none tabular-nums text-slate-900 dark:text-white">
                    {operationalRate.toFixed(0)}%
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    operatividad
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <FilaLeyenda
                  color={COLOR_OPERATIVO}
                  etiqueta="Operativos"
                  valor={stats.operativo}
                  total={stats.total}
                />
                <FilaLeyenda
                  color={COLOR_PANNE}
                  etiqueta="En panne"
                  valor={stats.panne}
                  total={stats.total}
                />
              </div>
            </>
          )}
        </Card>
      </div>

      {/* --------------------------------------- Terminales + exportar */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardEyebrow>Comparativo</CardEyebrow>
          <CardTitle>Revisiones por terminal</CardTitle>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Semana seleccionada · ordenado de mayor a menor
          </p>
          {stats.terminals.length === 0 ? (
            <div className="mt-4 flex h-48 items-center justify-center text-[12.5px] text-slate-400">
              Sin datos por terminal.
            </div>
          ) : (
            <div
              className="mt-4"
              style={{ height: Math.max(160, stats.terminals.length * 52) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                {/* Barras horizontales: los nombres de terminal se leen
                    completos sin girar la cabeza ni truncarse */}
                <BarChart
                  data={stats.terminals}
                  layout="vertical"
                  margin={{ top: 0, right: 34, left: 8, bottom: 0 }}
                  barCategoryGap="28%"
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="terminal"
                    width={118}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11.5, fill: AXIS_STROKE }}
                  />
                  <RechartsTooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(valor: number) => [valor, 'Revisiones']}
                    cursor={{ fill: 'rgba(148,163,184,0.1)' }}
                  />
                  <Bar dataKey="value" fill="var(--color-brand-500)" radius={[6, 6, 6, 6]}>
                    <LabelList
                      dataKey="value"
                      position="right"
                      style={{ fontSize: 11, fontWeight: 700, fill: AXIS_STROKE }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardEyebrow>Documentos</CardEyebrow>
          <CardTitle>Exportar semana {weekInfo.weekNumber}</CardTitle>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Reportes oficiales de la semana seleccionada
          </p>

          <div className="mt-4 flex flex-1 flex-col gap-2">
            <BotonExportar
              icono={FileSpreadsheet}
              titulo="Consolidados semanales"
              detalle="Los 4 archivos oficiales: Cámaras, Mobileye, TAG y Revisión"
              destacado
              onClick={() => setConsolidadosOpen(true)}
            />
            <BotonExportar
              icono={DownloadCloud}
              titulo="XLSX de todos los módulos"
              detalle="Una hoja por módulo, con cada registro"
              deshabilitado={exporting}
              onClick={async () => {
                setExporting(true)
                await exportAllModulesToXlsx(weekInfo.startISO, weekInfo.endISO).catch(
                  (error) => console.error('Error exportando XLSX', error)
                )
                setExporting(false)
              }}
            />
            <BotonExportar
              icono={FileText}
              titulo="PDF ejecutivo"
              detalle="Resumen imprimible de la semana"
              deshabilitado={exporting}
              onClick={async () => {
                setExporting(true)
                await exportExecutivePdf(weekInfo.startISO, weekInfo.endISO).catch(
                  (error) => console.error('Error exportando PDF', error)
                )
                setExporting(false)
              }}
            />
          </div>

          <p className="mt-3 text-[10.5px] leading-snug text-slate-400">
            Reportes granulares por módulo en la sección Reportes.
          </p>
        </Card>
      </div>

      {/* --------------------------------------------- Cobertura de módulos */}
      <ModulosActivos
        desde={weekInfo.startISO}
        hasta={weekInfo.endISO}
        totalRevisiones={revisions?.length ?? 0}
      />

      {/* -------------------------------------------- Operación en vivo */}
      {esSupervisor && (
        <Card className="space-y-2.5 !p-2 sm:!p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pt-1">
            <div className="min-w-0">
              <CardEyebrow>En vivo</CardEyebrow>
              <CardTitle>Centro geoespacial</CardTitle>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Buses revisados, inspectores conectados y tickets críticos
            </p>
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
      )}

      {/* ------------------------------------------------------- Detalle */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="!p-0">
          <div className="flex items-center justify-between gap-2 border-b border-white/50 px-3.5 py-3 dark:border-white/[0.06] sm:px-4">
            <div>
              <CardEyebrow>Actividad</CardEyebrow>
              <CardTitle>Últimas revisiones</CardTitle>
            </div>
            <Badge variant="outline">{stats.total} esta semana</Badge>
          </div>
          <ScrollArea className="h-72">
            <div className="divide-y divide-white/40 dark:divide-white/[0.04]">
              {latestRevisions.map((revision) => {
                const enPanne = revision.estado_bus === 'EN_PANNE'
                return (
                  <button
                    key={revision.id}
                    type="button"
                    onClick={() => setReportPpu(revision.bus_ppu)}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/50 dark:hover:bg-white/[0.05] sm:px-4"
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px]',
                        enPanne
                          ? 'bg-orange-500/12 text-orange-600 dark:text-orange-400'
                          : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {enPanne ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-extrabold text-slate-900 dark:text-white">
                          {revision.bus_ppu}
                        </span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
                          {dayjs(revision.created_at).format('ddd HH:mm')}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {revision.inspector_nombre} ·{' '}
                        {revision.terminal_detectado || revision.terminal_reportado}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                  </button>
                )
              })}
              {latestRevisions.length === 0 && (
                <p className="px-4 py-10 text-center text-[12.5px] text-slate-400">
                  Sin revisiones esta semana todavía.
                </p>
              )}
            </div>
          </ScrollArea>
        </Card>

        <Card className="!p-0">
          <div className="flex items-center justify-between gap-2 border-b border-white/50 px-3.5 py-3 dark:border-white/[0.06] sm:px-4">
            <div>
              <CardEyebrow>Seguimiento</CardEyebrow>
              <CardTitle>Tickets activos</CardTitle>
            </div>
            <Badge variant={pendingTickets.length > 0 ? 'warning' : 'success'}>
              {pendingTickets.length} abiertos
            </Badge>
          </div>
          <ScrollArea className="h-72">
            <div className="divide-y divide-white/40 dark:divide-white/[0.04]">
              {pendingTickets.map((ticket) => (
                <div key={ticket.id} className="px-3.5 py-2.5 sm:px-4">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-slate-900 dark:text-white">
                      {ticket.modulo}
                    </p>
                    <Badge
                      variant={
                        ticket.prioridad === 'ALTA'
                          ? 'danger'
                          : ticket.prioridad === 'MEDIA'
                            ? 'warning'
                            : 'outline'
                      }
                    >
                      {ticket.prioridad}
                    </Badge>
                    <Badge variant={ticket.estado === 'PENDIENTE' ? 'danger' : 'warning'}>
                      {ticket.estado === 'EN_PROCESO' ? 'En proceso' : 'Pendiente'}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-slate-600 dark:text-slate-300">
                    {ticket.descripcion}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-slate-400">
                    {ticket.terminal} · {dayjs(ticket.created_at).format('DD MMM HH:mm')}
                  </p>
                </div>
              ))}
              {pendingTickets.length === 0 && (
                <p className="px-4 py-10 text-center text-[12.5px] text-slate-400">
                  Todos los tickets están resueltos.
                </p>
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

/* ------------------------------------------------------------------ Piezas */

const FilaLeyenda = ({
  color,
  etiqueta,
  valor,
  total,
}: {
  color: string
  etiqueta: string
  valor: number
  total: number
}) => (
  <div className="flex items-center gap-2">
    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-600 dark:text-slate-300">
      {etiqueta}
    </span>
    <span className="shrink-0 text-[12px] font-extrabold tabular-nums text-slate-900 dark:text-white">
      {valor}
    </span>
    <span className="w-10 shrink-0 text-right text-[10.5px] tabular-nums text-slate-400">
      {total > 0 ? `${Math.round((valor / total) * 100)}%` : '—'}
    </span>
  </div>
)

const BotonExportar = ({
  icono: Icono,
  titulo,
  detalle,
  destacado,
  deshabilitado,
  onClick,
}: {
  icono: typeof FileSpreadsheet
  titulo: string
  detalle: string
  destacado?: boolean
  deshabilitado?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    disabled={deshabilitado}
    onClick={onClick}
    className={cn(
      'press-feedback flex w-full items-center gap-3 rounded-[var(--app-radius-sm)] border p-3 text-left transition disabled:opacity-50',
      destacado
        ? 'border-brand-400/40 bg-gradient-to-r from-brand-500/12 to-violet-500/8 hover:border-brand-400/60'
        : 'border-white/60 bg-white/40 hover:bg-white/60 dark:border-white/[0.07] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]'
    )}
  >
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]',
        destacado
          ? 'bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-md'
          : 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
      )}
    >
      <Icono className="h-4 w-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[12.5px] font-bold leading-tight text-slate-900 dark:text-white">
        {titulo}
      </span>
      <span className="mt-0.5 block text-[10.5px] leading-tight text-slate-500 dark:text-slate-400">
        {detalle}
      </span>
    </span>
    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
  </button>
)
