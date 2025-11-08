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
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/ui/stat-card'
import { SkeletonTable } from '@/components/ui/skeleton'
import type { Tables } from '@/types/database'

type TicketEstado = Tables<'tickets'>['estado']
type TicketPrioridad = Tables<'tickets'>['prioridad']

export const PendientesPage = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<TicketEstado | 'TODOS'>('TODOS')
  const [prioridadFilter, setPrioridadFilter] = useState<TicketPrioridad | 'TODOS'>('TODOS')
  const [moduloFilter, setModuloFilter] = useState<string>('TODOS')

  const { data: tickets, refetch, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Tables<'tickets'>[]
    },
    refetchInterval: 15_000,
  })

  const updateTicket = async (id: string, estado: TicketEstado) => {
    await supabase.from('tickets').update({ estado }).eq('id', id)
    refetch()
  }

  const filteredTickets = useMemo(() => {
    if (!tickets) return []
    return tickets.filter((ticket) => {
      const matchesSearch =
        searchQuery === '' ||
        ticket.descripcion.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.modulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.terminal.toLowerCase().includes(searchQuery.toLowerCase())
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
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Tickets"
          value={stats.total}
          description="Todos los registros"
          icon={AlertCircle}
          variant="default"
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

      {/* Tickets List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredTickets.map((ticket) => (
            <motion.div
              key={ticket.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getTicketIcon(ticket.prioridad)}
                      <p className="text-sm font-semibold text-slate-400">
                        {ticket.modulo}
                      </p>
                      <Badge
                        variant={
                          ticket.prioridad === 'ALTA'
                            ? 'danger'
                            : ticket.prioridad === 'MEDIA'
                            ? 'warning'
                            : 'default'
                        }
                        className="text-xs"
                      >
                        {ticket.prioridad}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {ticket.descripcion}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {ticket.terminal} · Creado el{' '}
                      {dayjs(ticket.created_at).format('DD MMM YYYY [a las] HH:mm')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                    {ticket.estado !== 'EN_PROCESO' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 rounded-2xl"
                        onClick={() => updateTicket(ticket.id, 'EN_PROCESO')}
                      >
                        <Clock className="h-4 w-4" />
                        En proceso
                      </Button>
                    )}
                    {ticket.estado !== 'RESUELTO' && (
                      <Button
                        size="sm"
                        className="gap-2 rounded-2xl"
                        onClick={() => updateTicket(ticket.id, 'RESUELTO')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Marcar resuelto
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
        {filteredTickets.length === 0 && (
          <Card className="p-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">
              {hasActiveFilters
                ? 'No se encontraron tickets con los filtros aplicados'
                : 'No hay tickets registrados'}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
