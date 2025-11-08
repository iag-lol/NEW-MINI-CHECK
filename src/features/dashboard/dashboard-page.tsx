import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { AlertTriangle, CheckCircle2, DownloadCloud } from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { exportAllModulesToXlsx, exportExecutivePdf } from '@/lib/exporters'
import { Card, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Tables } from '@/types/database'

interface WeekPayload {
  start: string
  end: string
}

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
  const { data: revisions, isLoading: revisionsLoading } = useWeeklyRevisions()
  const { data: tickets, isLoading: ticketsLoading } = useTickets()
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN
  const tileLayerUrl = mapToken
    ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${mapToken}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const attribution = mapToken
    ? '© Mapbox · © OpenStreetMap'
    : '© OpenStreetMap contributors'

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

  const pendingTickets = tickets?.filter((ticket) => ticket.estado !== 'RESUELTO') ?? []

  const latestRevisions = revisions?.slice(0, 6) ?? []

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardTitle className="text-sm uppercase text-slate-500">Semana actual</CardTitle>
          <p className="mt-3 text-4xl font-black text-slate-900 dark:text-white">
            {revisionsLoading ? '—' : stats.total}
          </p>
          <p className="text-sm text-slate-500">Revisiones enviadas</p>
        </Card>
        <Card>
          <CardTitle className="text-sm uppercase text-slate-500">Operatividad</CardTitle>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-4xl font-black text-emerald-500">{stats.operativo}</span>
            <Badge variant="warning">{stats.panne} en panne</Badge>
          </div>
          <Progress
            value={stats.total ? (stats.operativo / (stats.total || 1)) * 100 : 0}
            className="mt-3"
          />
        </Card>
        <Card>
          <CardTitle className="text-sm uppercase text-slate-500">Tickets abiertos</CardTitle>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-4xl font-black text-brand-500">
              {ticketsLoading ? '—' : pendingTickets.length}
            </span>
            <p className="text-sm text-slate-500">pendientes</p>
          </div>
          <p className="text-xs text-slate-400">
            {pendingTickets.filter((ticket) => ticket.estado === 'EN_PROCESO').length} en proceso
          </p>
        </Card>
        <Card>
          <CardTitle className="text-sm uppercase text-slate-500">Terminal destacada</CardTitle>
          <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white">
            {stats.terminalTop}
          </p>
          <p className="text-sm text-slate-500">Mayor actividad esta semana</p>
        </Card>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Mapa de revisiones</CardTitle>
          <p className="text-sm text-slate-500">Ubicaciones GPS con color por estado</p>
          <div className="mt-4 h-80 overflow-hidden rounded-2xl">
            <MapContainer
              center={[-33.46, -70.65]}
              zoom={11}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer url={tileLayerUrl} attribution={attribution} />
              {latestRevisions.map((revision) => (
                <CircleMarker
                  key={revision.id}
                  center={[revision.lat, revision.lon]}
                  radius={8}
                  color={
                    revision.estado_bus === 'EN_PANNE' ? '#f97316' : '#22c55e'
                  }
                  weight={2}
                >
                  <Popup>
                    <p className="text-sm font-semibold">{revision.bus_ppu}</p>
                    <p className="text-xs text-slate-500">
                      {revision.terminal_detectado} ·{' '}
                      {dayjs(revision.created_at).format('HH:mm')}
                    </p>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </Card>
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
      </div>
    </div>
  )
}
