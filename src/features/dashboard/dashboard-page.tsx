import { useMemo, useState, useRef } from 'react'
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
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, LayerGroup, Marker } from 'react-leaflet'
import { divIcon, type Map as LeafletMap } from 'leaflet'
import {
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  Activity,
  Bus,
  AlertCircle,
  Clock
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { exportAllModulesToXlsx, exportExecutivePdf } from '@/lib/exporters'
import { Card, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Skeleton, SkeletonCard, SkeletonChart } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Tables } from '@/types/database'
import { TERMINAL_GEOFENCES, type TerminalSlug } from '@/constants/geofences'
import { useActiveInspectors } from '@/hooks/use-active-inspectors'
import { useAuthStore } from '@/store/auth-store'

interface WeekPayload {
  start: string
  end: string
}

type BaseLayerKey = 'street' | 'satellite'

const createInspectorIcon = (label: string, color: string) =>
  divIcon({
    className: '',
    html: `<div style="
      display:flex;
      align-items:center;
      justify-content:center;
      width:32px;
      height:32px;
      border-radius:50%;
      background:${color};
      color:#fff;
      font-size:12px;
      font-weight:700;
      border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 6px 14px rgba(15,23,42,0.25);
    ">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const getWeekRange = (): WeekPayload => {
  const start = dayjs().isoWeekday(1).startOf('day')
  const end = start.add(6, 'day').endOf('day')
  return { start: start.toISOString(), end: end.toISOString() }
}

const useWeeklyRevisions = () => {
  const { start, end } = getWeekRange()
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

const useTickets = () =>
  useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Tables<'tickets'>[]
    },
    refetchInterval: 30_000,
  })

export const DashboardPage = () => {
  const [exporting, setExporting] = useState(false)
  const { user } = useAuthStore()
  const { data: revisions, isLoading: revisionsLoading } = useWeeklyRevisions()
  const { data: tickets } = useTickets()
  const { inspectors: liveInspectors } = useActiveInspectors()
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
      const day = dayjs(getWeekRange().start).add(index, 'day')
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
  }, [revisions])

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
  const mapRevisions =
    revisions?.filter(
      (revision) => typeof revision.lat === 'number' && typeof revision.lon === 'number'
    ) ?? []

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
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="col-span-2">
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
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200/60 bg-gradient-to-br from-brand-50 to-white p-6 dark:border-slate-800 dark:from-brand-950/20 dark:to-slate-950"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Dashboard de Supervisión
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Vista consolidada en tiempo real · Semana {dayjs().isoWeek()} de {dayjs().year()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-400" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Última actualización: {dayjs().format('HH:mm')}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="col-span-2">
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="col-span-2">
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
            className="mt-6 w-full gap-2 rounded-2xl"
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              await exportAllModulesToXlsx().catch((error) =>
                console.error('Error exportando XLSX', error)
              )
              setExporting(false)
            }}
          >
            <DownloadCloud className="h-4 w-4" />
            XLSX semanal
          </Button>
          <Button
            className="mt-3 w-full gap-2 rounded-2xl"
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              await exportExecutivePdf().catch((error) =>
                console.error('Error exportando PDF', error)
              )
              setExporting(false)
            }}
          >
            <DownloadCloud className="h-4 w-4" />
            PDF ejecutivo
          </Button>
          <p className="mt-4 text-xs text-slate-400">
            También puedes descargar reportes granulares desde la sección Reportes.
          </p>
        </Card>
      </div>

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
                {mapRevisions.map((revision) => (
                  <CircleMarker
                    key={revision.id}
                    center={[revision.lat, revision.lon]}
                    radius={7}
                    color={revision.estado_bus === 'EN_PANNE' ? '#f97316' : '#22c55e'}
                    weight={2}
                  >
                    <Popup>
                      <p className="text-sm font-semibold">{revision.bus_ppu}</p>
                      <p className="text-xs text-slate-500">
                        {revision.estado_bus === 'EN_PANNE' ? 'En panne' : 'Operativo'} ·{' '}
                        {dayjs(revision.created_at).format('ddd HH:mm')}
                      </p>
                    </Popup>
                  </CircleMarker>
                ))}
              </LayerGroup>
              <LayerGroup>
                {liveInspectors.map((inspector) => {
                  const isSelf = user?.rut === inspector.usuario_rut
                  const icon = createInspectorIcon(
                    getInitials(inspector.nombre),
                    isSelf ? '#22c55e' : '#0284c7'
                  )
                  return (
                    <Marker
                      key={`inspector-${inspector.usuario_rut}`}
                      position={[inspector.lat, inspector.lon]}
                      icon={icon}
                    >
                      <Popup>
                        <p className="text-sm font-semibold">{inspector.nombre}</p>
                        <p className="text-xs text-slate-500">
                          {inspector.terminal} · Precisión ±
                          {Math.round(inspector.accuracy ?? 0)} m
                          <br />
                          Último pulso {dayjs(inspector.last_heartbeat).fromNow()}
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
                Inspectores activos en vivo ({liveInspectors.length})
              </p>
              <ScrollArea className="mt-3 h-40 pr-3">
                {liveInspectors.length === 0 && (
                  <p className="text-xs text-slate-400">Sin inspectores conectados en las últimas horas.</p>
                )}
                {liveInspectors.map((inspector) => (
                  <div key={inspector.usuario_rut} className="mb-3 text-xs last:mb-0">
                    <p className="font-semibold text-slate-800 dark:text-white">
                      {inspector.nombre}
                    </p>
                    <p className="text-slate-500">
                      {inspector.terminal} · Precisión ±{Math.round(inspector.accuracy ?? 0)} m ·{' '}
                      {dayjs(inspector.last_heartbeat).format('HH:mm')} hrs
                    </p>
                  </div>
                ))}
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

      <div className="grid gap-6 lg:grid-cols-2">
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
    </div>
  )
}
