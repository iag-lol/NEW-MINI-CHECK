import { useState, useEffect } from 'react'
import { Calendar, User, MapPin, CheckCircle, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import dayjs from '@/lib/dayjs'
import type { Tables } from '@/types/database'

type Revision = Tables<'revisiones'>

interface TimelineReportProps {
  startDate: string
  endDate: string
}

export function TimelineReport({ startDate, endDate }: TimelineReportProps) {
  const [revisiones, setRevisiones] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTimeline()
  }, [startDate, endDate])

  const loadTimeline = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('revisiones')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })

      setRevisiones((data as Revision[]) || [])
    } catch (error) {
      console.error('Error loading timeline:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Cargando línea de tiempo...</p>
      </Card>
    )
  }

  // Agrupar por día
  const groupedByDay = revisiones.reduce(
    (acc, revision) => {
      const day = dayjs(revision.created_at).format('YYYY-MM-DD')
      if (!acc[day]) acc[day] = []
      acc[day].push(revision)
      return acc
    },
    {} as Record<string, Revision[]>
  )

  const stats = {
    total: revisiones.length,
    operative: revisiones.filter((r) => r.operativo).length,
    nonOperative: revisiones.filter((r) => !r.operativo).length,
    uniqueInspectors: new Set(revisiones.map((r) => r.inspector_rut)).size,
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={Calendar} color="blue" />
        <StatCard label="Operativos" value={stats.operative} icon={CheckCircle} color="green" />
        <StatCard label="En Panne" value={stats.nonOperative} icon={XCircle} color="red" />
        <StatCard label="Inspectores" value={stats.uniqueInspectors} icon={User} color="purple" />
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {Object.entries(groupedByDay).map(([day, dayRevisiones]) => (
          <DayGroup key={day} date={day} revisiones={dayRevisiones} />
        ))}
      </div>

      {revisiones.length === 0 && (
        <Card className="p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No hay inspecciones</h3>
          <p className="text-sm text-muted-foreground">
            No se encontraron inspecciones en el período seleccionado
          </p>
        </Card>
      )}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  icon: typeof Calendar
  color: 'blue' | 'green' | 'red' | 'purple'
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  )
}

interface DayGroupProps {
  date: string
  revisiones: Revision[]
}

function DayGroup({ date, revisiones }: DayGroupProps) {
  const isToday = dayjs(date).isSame(dayjs(), 'day')
  const formattedDate = isToday
    ? 'Hoy'
    : dayjs(date).format('dddd, D [de] MMMM [de] YYYY')

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-lg font-bold">{formattedDate}</h3>
        <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700">
          {revisiones.length} {revisiones.length === 1 ? 'inspección' : 'inspecciones'}
        </span>
      </div>
      <div className="relative space-y-3 border-l-2 border-gray-300 pl-6">
        {revisiones.map((revision) => (
          <TimelineItem key={revision.id} revision={revision} />
        ))}
      </div>
    </div>
  )
}

interface TimelineItemProps {
  revision: Revision
}

function TimelineItem({ revision }: TimelineItemProps) {
  return (
    <div className="relative">
      <div
        className={`absolute -left-[27px] h-4 w-4 rounded-full border-2 ${
          revision.operativo
            ? 'border-green-500 bg-green-500'
            : 'border-red-500 bg-red-500'
        }`}
      />
      <Card className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                {dayjs(revision.created_at).format('HH:mm')}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  revision.operativo
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {revision.operativo ? 'OPERATIVO' : 'EN PANNE'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{revision.inspector_nombre}</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{revision.terminal_reportado}</span>
              </div>
            </div>
            <p className="font-mono text-sm font-bold">Bus: {revision.bus_ppu}</p>
            {revision.observaciones && (
              <p className="text-sm text-muted-foreground">{revision.observaciones}</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
