import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  Filter,
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  X,
  BusFront,
  ClipboardCheck,
  ListChecks,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/ui/stat-card'
import { SkeletonTable } from '@/components/ui/skeleton'
import { WeekSelector } from '@/components/week-selector'
import { useWeekFilter } from '@/hooks/use-week-filter'
import type { Tables } from '@/types/database'

type TicketEstado = Tables<'tickets'>['estado']
type TicketPrioridad = Tables<'tickets'>['prioridad']
type TicketRecord = Tables<'tickets'> & {
  revision: {
    bus_ppu: string | null
    bus_interno: string | null
    estado_bus: Tables<'revisiones'>['estado_bus']
    terminal_detectado: string | null
    created_at: string
    observaciones: string | null
  } | null
}

interface DetailedTicket extends TicketRecord {
  detailSummary?: string
  detailItems?: Array<{ label: string; value: string }>
}

interface BusTicketGroup {
  busPpu: string
  busInterno?: string | null
  terminal?: string | null
  estadoBus?: string | null
  tickets: DetailedTicket[]
  lastUpdate: string
}

export const TicketsPage = () => {
  const { weekInfo } = useWeekFilter()
  const [searchQuery, setSearchQuery] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<TicketEstado | 'TODOS'>('TODOS')
  const [prioridadFilter, setPrioridadFilter] = useState<TicketPrioridad | 'TODOS'>('TODOS')
  const [moduloFilter, setModuloFilter] = useState<string>('TODOS')

  const { data: tickets, refetch, isLoading } = useQuery({
    queryKey: ['tickets', 'detallados', weekInfo.startISO, weekInfo.endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(
          '*, revision:revision_id(bus_ppu, bus_interno, estado_bus, terminal_detectado, created_at, observaciones)'
        )
        .gte('created_at', weekInfo.startISO)
        .lte('created_at', weekInfo.endISO)
        .order('created_at', { ascending: false })
      if (error) throw error

      const typedData = (data ?? []) as TicketRecord[]
      const revisionIds = typedData.map((ticket) => ticket.revision_id).filter(Boolean) as string[]
      if (revisionIds.length === 0) return typedData

      const [extintores, publicidad, mobileye] = await Promise.all([
        supabase
          .from('extintores')
          .select('*')
          .in('revision_id', revisionIds)
          .then((res) => (res.data ?? []) as Tables<'extintores'>[]),
        supabase
          .from('publicidad')
          .select('*')
          .in('revision_id', revisionIds)
          .then((res) => (res.data ?? []) as Tables<'publicidad'>[]),
        supabase
          .from('mobileye')
          .select('*')
          .in('revision_id', revisionIds)
          .then((res) => (res.data ?? []) as Tables<'mobileye'>[]),
      ])

      const extMap = new Map(extintores.map((row) => [row.revision_id, row]))
      const pubMap = new Map(publicidad.map((row) => [row.revision_id, row]))
      const mobMap = new Map(mobileye.map((row) => [row.revision_id, row]))

      return typedData.map((ticket) => {
        const decorated: DetailedTicket = { ...ticket }
        switch (ticket.modulo.toLowerCase()) {
          case 'extintores': {
            const record = extMap.get(ticket.revision_id ?? '')
            if (record) {
              decorated.detailSummary = `Certificación ${record.certificacion ?? '—'} · Presión ${record.presion ?? '—'}`
              decorated.detailItems = [
                { label: 'Vencimiento', value: record.vencimiento_mes && record.vencimiento_anio ? `${record.vencimiento_mes}/${record.vencimiento_anio}` : '—' },
                { label: 'Sonda', value: record.sonda ?? '—' },
                { label: 'Manómetro', value: record.manometro ?? '—' },
                { label: 'Cilindro', value: record.cilindro ?? '—' },
                { label: 'Porta', value: record.porta ?? '—' },
              ]
            }
            break
          }
          case 'publicidad': {
            const record = pubMap.get(ticket.revision_id ?? '')
            if (record) {
              const detalle = record.detalle_lados as Record<string, any> | null
              const ladosConDanio =
                detalle &&
                Object.entries(detalle)
                  .filter(([, info]) => info?.danio || info?.residuos)
                  .map(([lado]) => lado)
              decorated.detailSummary =
                ladosConDanio && ladosConDanio.length > 0
                  ? `Hallazgos en ${ladosConDanio.join(', ')}`
                  : 'Daños no especificados'
              decorated.detailItems = [
                { label: 'Campaña', value: record.nombre_publicidad ?? 'No informada' },
                { label: 'Daño', value: record.danio ? 'Sí' : 'No' },
                { label: 'Residuos', value: record.residuos ? 'Sí' : 'No' },
                { label: 'Obs.', value: record.observacion ?? '—' },
              ]
            }
            break
          }
          case 'mobileye': {
            const record = mobMap.get(ticket.revision_id ?? '')
            if (record) {
              const fallas = [
                record.alerta_izq === false ? 'Alerta izquierda' : null,
                record.alerta_der === false ? 'Alerta derecha' : null,
                record.consola === false ? 'Consola' : null,
                record.sensor_frontal === false ? 'Sensor frontal' : null,
                record.sensor_izq === false ? 'Sensor izquierdo' : null,
                record.sensor_der === false ? 'Sensor derecho' : null,
              ].filter(Boolean)
              decorated.detailSummary =
                fallas.length > 0 ? `Fallas: ${fallas.join(', ')}` : 'Anomalía no especificada'
              decorated.detailItems = fallas.map((falla) => ({ label: 'Componente', value: falla! }))
            }
            break
          }
          default:
            decorated.detailSummary = ticket.descripcion
        }
        return decorated
      })
    },
    refetchInterval: 15_000,
  })

  const updateTicket = async (id: string, estado: TicketEstado) => {
    await supabase.from('tickets').update({ estado, actualizado_en: dayjs().toISOString() }).eq('id', id)
    refetch()
  }

  const updatePriority = async (id: string, prioridad: TicketPrioridad) => {
    await supabase.from('tickets').update({ prioridad, actualizado_en: dayjs().toISOString() }).eq('id', id)
    refetch()
  }

  const bulkUpdateEstado = async (ticketIds: string[], estado: TicketEstado) => {
    if (ticketIds.length === 0) return
    await supabase
      .from('tickets')
      .update({ estado, actualizado_en: dayjs().toISOString() })
      .in('id', ticketIds)
    refetch()
  }

  const filteredTickets = useMemo(() => {
    if (!tickets) return []
    return tickets.filter((ticket) => {
      const searchNormalized = searchQuery.toLowerCase()
      const matchesSearch =
        searchQuery === '' ||
        ticket.descripcion.toLowerCase().includes(searchNormalized) ||
        ticket.modulo.toLowerCase().includes(searchNormalized) ||
        ticket.terminal.toLowerCase().includes(searchNormalized) ||
        (ticket.revision?.bus_ppu?.toLowerCase().includes(searchNormalized) ?? false) ||
        (ticket.revision?.bus_interno?.toLowerCase().includes(searchNormalized) ?? false)
      const matchesEstado = estadoFilter === 'TODOS' || ticket.estado === estadoFilter
      const matchesPrioridad =
        prioridadFilter === 'TODOS' || ticket.prioridad === prioridadFilter
      const matchesModulo = moduloFilter === 'TODOS' || ticket.modulo === moduloFilter
      return matchesSearch && matchesEstado && matchesPrioridad && matchesModulo
    })
  }, [tickets, searchQuery, estadoFilter, prioridadFilter, moduloFilter])

  const stats = useMemo(() => {
    if (!tickets) return { total: 0, pendiente: 0, enProceso: 0, resuelto: 0 }
    return {
      total: tickets.length,
      pendiente: tickets.filter((t) => t.estado === 'PENDIENTE').length,
      enProceso: tickets.filter((t) => t.estado === 'EN_PROCESO').length,
      resuelto: tickets.filter((t) => t.estado === 'RESUELTO').length,
    }
  }, [tickets])

  const modulos = useMemo(() => {
    if (!tickets) return []
    return Array.from(new Set(tickets.map((t) => t.modulo)))
  }, [tickets])

  const groupedByBus = useMemo(() => {
    const groups = new Map<string, BusTicketGroup>()
    filteredTickets.forEach((ticket) => {
      const busPpu = ticket.revision?.bus_ppu ?? 'SIN_PPU'
      const terminal = ticket.revision?.terminal_detectado ?? ticket.terminal
      const key = `${busPpu}-${terminal}`
      if (!groups.has(key)) {
        groups.set(key, {
          busPpu,
          busInterno: ticket.revision?.bus_interno,
          terminal,
          estadoBus: ticket.revision?.estado_bus,
          tickets: [],
          lastUpdate: ticket.created_at,
        })
      }
      const group = groups.get(key)!
      group.tickets.push(ticket)
      if (dayjs(ticket.created_at).isAfter(group.lastUpdate)) {
        group.lastUpdate = ticket.created_at
      }
    })
    return Array.from(groups.values()).sort((a, b) =>
      dayjs(b.lastUpdate).valueOf() - dayjs(a.lastUpdate).valueOf()
    )
  }, [filteredTickets])

  const getTicketIcon = (prioridad: TicketPrioridad) => {
    switch (prioridad) {
      case 'ALTA':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'MEDIA':
        return <AlertCircle className="h-4 w-4 text-amber-500" />
      case 'BAJA':
        return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-32" />
          ))}
        </div>
        <Card className="p-6">
          <SkeletonTable rows={5} />
        </Card>
      </div>
    )
  }

  const hasActiveFilters =
    searchQuery !== '' ||
    estadoFilter !== 'TODOS' ||
    prioridadFilter !== 'TODOS' ||
    moduloFilter !== 'TODOS'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tickets</h1>
          <p className="text-muted-foreground">
            Gestión de incidencias y problemas reportados
          </p>
        </div>
        <WeekSelector />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total de Tickets"
          value={stats.total}
          description="Todos los registros"
          icon={AlertCircle}
          variant="default"
        />
        <StatCard
          title="Buses comprometidos"
          value={groupedByBus.length}
          description="Con tickets abiertos"
          icon={BusFront}
          variant="info"
        />
        <StatCard
          title="Pendientes"
          value={stats.pendiente}
          description="Requieren atención"
          icon={AlertTriangle}
          variant={stats.pendiente > 0 ? 'danger' : 'default'}
        />
        <StatCard
          title="En Proceso"
          value={stats.enProceso}
          description="Siendo atendidos"
          icon={Clock}
          variant={stats.enProceso > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Resueltos"
          value={stats.resuelto}
          description="Completados"
          icon={CheckCircle2}
          variant="success"
        />
      </div>

      {/* Filters */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Filtros</h3>
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchQuery('')
                setEstadoFilter('TODOS')
                setPrioridadFilter('TODOS')
                setModuloFilter('TODOS')
              }}
              className="ml-auto gap-1 text-xs"
            >
              <X className="h-3 w-3" />
              Limpiar filtros
            </Button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value as TicketEstado | 'TODOS')}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="EN_PROCESO">En Proceso</option>
            <option value="RESUELTO">Resuelto</option>
          </select>
          <select
            value={prioridadFilter}
            onChange={(e) => setPrioridadFilter(e.target.value as TicketPrioridad | 'TODOS')}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <option value="TODOS">Todas las prioridades</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Media</option>
            <option value="BAJA">Baja</option>
          </select>
          <select
            value={moduloFilter}
            onChange={(e) => setModuloFilter(e.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <option value="TODOS">Todos los módulos</option>
            {modulos.map((modulo) => (
              <option key={modulo} value={modulo}>
                {modulo}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Tickets agrupados por bus */}
      <div className="space-y-4">
        <AnimatePresence mode="sync">
          {groupedByBus.map((group) => (
            <motion.div
              key={`${group.busPpu}-${group.terminal}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <Card className="p-5 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <BusFront className="h-4 w-4 text-brand-500" />
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {group.busPpu}
                      </span>
                      {group.busInterno && <span>· #{group.busInterno}</span>}
                    </div>
                    <p className="text-xs text-slate-500">
                      {group.terminal} · Estado bus{' '}
                      {group.estadoBus === 'EN_PANNE' ? 'En panne' : 'Operativo'} · Última
                      actualización {dayjs(group.lastUpdate).fromNow()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 rounded-2xl"
                      onClick={() =>
                        bulkUpdateEstado(
                          group.tickets.map((ticket) => ticket.id),
                          'EN_PROCESO'
                        )
                      }
                    >
                      <ListChecks className="h-4 w-4" />
                      Marcar bus en proceso
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2 rounded-2xl"
                      onClick={() =>
                        bulkUpdateEstado(
                          group.tickets.map((ticket) => ticket.id),
                          'RESUELTO'
                        )
                      }
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Resolver todos
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {group.tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="rounded-2xl border border-slate-100/80 p-4 dark:border-slate-900/70"
                    >
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          {getTicketIcon(ticket.prioridad)}
                          <span className="font-semibold uppercase tracking-wide text-slate-500">
                            {ticket.modulo}
                          </span>
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
                          <Badge
                            variant={
                              ticket.estado === 'RESUELTO'
                                ? 'success'
                                : ticket.estado === 'EN_PROCESO'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {ticket.estado}
                          </Badge>
                        </div>
                        <select
                          value={ticket.prioridad}
                          onChange={(event) =>
                            updatePriority(ticket.id, event.target.value as TicketPrioridad)
                          }
                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs uppercase dark:border-slate-800 dark:bg-slate-950"
                        >
                          <option value="ALTA">Prioridad alta</option>
                          <option value="MEDIA">Prioridad media</option>
                          <option value="BAJA">Prioridad baja</option>
                        </select>
                      </div>
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {ticket.descripcion}
                      </p>
                      {ticket.detailSummary && (
                        <p className="text-sm text-slate-500">{ticket.detailSummary}</p>
                      )}
                      {ticket.detailItems && ticket.detailItems.length > 0 && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {ticket.detailItems.map((item, index) => (
                            <div
                              key={`${ticket.id}-detail-${index}`}
                              className="rounded-xl bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-600 dark:bg-slate-900/50 dark:text-slate-300"
                            >
                              {item.label}: <span className="text-slate-900 dark:text-white">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ticket.estado !== 'EN_PROCESO' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 rounded-2xl"
                            onClick={() => updateTicket(ticket.id, 'EN_PROCESO')}
                          >
                            <Clock className="h-4 w-4" />
                            Marcar en proceso
                          </Button>
                        )}
                        {ticket.estado !== 'RESUELTO' && (
                          <Button
                            size="sm"
                            className="gap-2 rounded-2xl"
                            onClick={() => updateTicket(ticket.id, 'RESUELTO')}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Cerrar ticket
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
        {groupedByBus.length === 0 && (
          <Card className="p-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">
              {hasActiveFilters
                ? 'No se encontraron tickets con los filtros aplicados'
                : 'No hay tickets registrados.'}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
