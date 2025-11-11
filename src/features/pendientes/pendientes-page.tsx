import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BusFront,
  CheckCircle2,
  Clock,
  Compass,
  Search,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import { useAuthStore } from '@/store/auth-store'
import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

type FlotaRow = Tables<'flota'>
type RevisionRow = Tables<'revisiones'>

const getWeekRange = () => {
  const start = dayjs().isoWeekday(1).startOf('day')
  const end = start.add(6, 'day').endOf('day')
  return { start: start.toISOString(), end: end.toISOString() }
}

export const PendientesPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [terminalFilter, setTerminalFilter] = useState(user?.terminal ?? 'TODOS')
  const [searchQuery, setSearchQuery] = useState('')
  const { start, end } = getWeekRange()

  const { data: flota, isLoading: flotaLoading } = useQuery({
    queryKey: ['flota-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flota')
        .select('*')
        .order('numero_interno', { ascending: true })
      if (error) throw error
      return (data ?? []) as FlotaRow[]
    },
  })

  const { data: revisiones, isLoading: revisionesLoading } = useQuery({
    queryKey: ['pendientes-revisiones', start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revisiones')
        .select('id, bus_ppu, bus_interno, inspector_nombre, terminal_detectado, estado_bus, created_at')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as RevisionRow[]
    },
    refetchInterval: 15_000,
  })

  const buses = useMemo(() => {
    if (!flota) return []
    const latestByBus = new Map<string, RevisionRow>()
    revisiones?.forEach((revision) => {
      if (!latestByBus.has(revision.bus_ppu)) {
        latestByBus.set(revision.bus_ppu, revision)
      }
    })

    return flota.map((bus) => {
      const lastRevision = latestByBus.get(bus.ppu) ?? null
      const pending = !lastRevision
      return {
        bus,
        lastRevision,
        pending,
        lastInspectionAt: lastRevision ? dayjs(lastRevision.created_at) : null,
      }
    })
  }, [flota, revisiones])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toUpperCase()
    return buses
      .filter((item) => {
        if (terminalFilter !== 'TODOS' && item.bus.terminal !== terminalFilter) {
          return false
        }
        if (!query) return true
        return (
          item.bus.ppu.toUpperCase().includes(query) ||
          item.bus.numero_interno.toUpperCase().includes(query)
        )
      })
      .sort((a, b) => {
        if (a.pending && !b.pending) return -1
        if (!a.pending && b.pending) return 1
        return a.bus.numero_interno.localeCompare(b.bus.numero_interno)
      })
  }, [buses, terminalFilter, searchQuery])

  const pendingCount = filtered.filter((item) => item.pending).length
  const total = filtered.length
  const completedCount = total - pendingCount
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0

  const handleStartRevision = (bus: FlotaRow) => {
    navigate(`/app/formulario?ppu=${encodeURIComponent(bus.ppu)}`)
  }

  const loading = flotaLoading || revisionesLoading

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-brand-500">
            Control diario
          </p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">
            Buses pendientes
          </h1>
          <p className="text-sm text-slate-500">
            Revisa cuáles buses aún no tienen inspección registrada esta semana.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[240px,1fr]">
          <div>
            <Select value={terminalFilter} onValueChange={setTerminalFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar terminal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los terminales</SelectItem>
                <SelectItem value="El Roble">El Roble</SelectItem>
                <SelectItem value="La Reina">La Reina</SelectItem>
                <SelectItem value="María Angélica">María Angélica</SelectItem>
                <SelectItem value="El Descanso">El Descanso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por PPU o Nº interno"
              className="pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Pendientes"
          value={pendingCount}
          description="Sin revisión esta semana"
          icon={AlertTriangle}
          variant={pendingCount > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title="Completados"
          value={completedCount}
          description="Revisados esta semana"
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          title="Avance semanal"
          value={`${progress}%`}
          description={`${completedCount} de ${total} buses`}
          icon={Compass}
          variant={progress >= 80 ? 'success' : progress >= 50 ? 'info' : 'warning'}
        />
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-900">
          <div>
            <h2 className="text-lg font-semibold">Listado de buses</h2>
            <p className="text-sm text-slate-500">
              {pendingCount} pendientes · {completedCount} completados
            </p>
          </div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {loading && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              Cargando flota...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No encontramos buses con esos filtros.
            </div>
          )}
          {!loading &&
            filtered.map(({ bus, lastRevision, pending }) => (
              <div
                key={bus.id}
                className="flex flex-col gap-4 border-t border-transparent px-6 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-900/30 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <BusFront className="h-5 w-5 text-brand-500" />
                    <div>
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {bus.ppu} · #{bus.numero_interno}
                      </p>
                      <p className="text-xs text-slate-500">
                        Terminal {bus.terminal}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {lastRevision ? (
                      <>
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Revisado {lastRevision.inspector_nombre}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {dayjs(lastRevision.created_at).format('DD MMM HH:mm')}
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertTriangle className="h-3 w-3" />
                        Sin inspección esta semana
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 md:items-end">
                  <Badge variant={pending ? 'warning' : 'success'}>
                    {pending ? 'Pendiente' : 'Completado'}
                  </Badge>
                  {pending ? (
                    <Button size="sm" className="rounded-xl" onClick={() => handleStartRevision(bus)}>
                      Iniciar revisión
                    </Button>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Ult. estado: {lastRevision?.estado_bus ?? '—'}
                    </p>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  )
}
