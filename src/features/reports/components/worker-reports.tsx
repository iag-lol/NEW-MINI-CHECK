import { useState, useEffect } from 'react'
import { Users, TrendingUp, Clock, Award, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import dayjs from '@/lib/dayjs'
import type { Tables } from '@/types/database'

type Worker = Tables<'usuarios'>
type WorkerStats = {
  worker: Worker
  totalInspections: number
  operativeRate: number
  avgInspectionsPerDay: number
  lastInspection: string | null
  terminals: string[]
}

export function WorkerReports() {
  const [workers, setWorkers] = useState<WorkerStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadWorkerStats()
  }, [])

  const loadWorkerStats = async () => {
    try {
      // Obtener todos los inspectores
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('*')
        .eq('cargo', 'INSPECTOR')

      const usuarios = (usuariosData || []) as Worker[]

      if (!usuarios || usuarios.length === 0) return

      // Obtener estadísticas de cada inspector
      const stats = await Promise.all(
        usuarios.map(async (worker) => {
          const { data: revisionesData } = await supabase
            .from('revisiones')
            .select('*')
            .eq('inspector_rut', worker.rut)
            .order('created_at', { ascending: false })

          const revisiones = (revisionesData || []) as Tables<'revisiones'>[]

          const totalInspections = revisiones?.length || 0
          const operativeCount = revisiones?.filter((r) => r.operativo).length || 0
          const operativeRate = totalInspections > 0 ? (operativeCount / totalInspections) * 100 : 0

          // Calcular inspecciones por día (últimos 30 días)
          const thirtyDaysAgo = dayjs().subtract(30, 'days').toISOString()
          const recentInspections =
            revisiones?.filter((r) => r.created_at >= thirtyDaysAgo).length || 0
          const avgInspectionsPerDay = recentInspections / 30

          const lastInspection = revisiones?.[0]?.created_at || null
          const terminals = [...new Set(revisiones?.map((r) => r.terminal_reportado) || [])]

          return {
            worker,
            totalInspections,
            operativeRate,
            avgInspectionsPerDay,
            lastInspection,
            terminals,
          }
        })
      )

      setWorkers(stats.sort((a, b) => b.totalInspections - a.totalInspections))
    } catch (error) {
      console.error('Error loading worker stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Cargando estadísticas...</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={Users}
          label="Total Inspectores"
          value={workers.length.toString()}
          color="blue"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Inspecciones Totales"
          value={workers.reduce((acc, w) => acc + w.totalInspections, 0).toString()}
          color="green"
        />
        <SummaryCard
          icon={Award}
          label="Promedio Operatividad"
          value={`${Math.round(workers.reduce((acc, w) => acc + w.operativeRate, 0) / workers.length)}%`}
          color="purple"
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-bold">Rendimiento por Inspector</h3>
        {workers.map((stats) => (
          <WorkerCard key={stats.worker.rut} stats={stats} />
        ))}
      </div>
    </div>
  )
}

interface SummaryCardProps {
  icon: typeof Users
  label: string
  value: string
  color: 'blue' | 'green' | 'purple'
}

function SummaryCard({ icon: Icon, label, value, color }: SummaryCardProps) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
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

interface WorkerCardProps {
  stats: WorkerStats
}

function WorkerCard({ stats }: WorkerCardProps) {
  const { worker, totalInspections, operativeRate, avgInspectionsPerDay, lastInspection, terminals } = stats

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white font-bold text-lg">
            {worker.nombre.charAt(0)}
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-lg">{worker.nombre}</h4>
            <p className="text-sm text-muted-foreground">{worker.rut}</p>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {worker.terminal}
              </span>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                {worker.cargo}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <StatItem
          icon={TrendingUp}
          label="Inspecciones"
          value={totalInspections.toString()}
        />
        <StatItem
          icon={Award}
          label="Operatividad"
          value={`${Math.round(operativeRate)}%`}
        />
        <StatItem
          icon={Clock}
          label="Promedio/Día"
          value={avgInspectionsPerDay.toFixed(1)}
        />
        <StatItem
          icon={Clock}
          label="Última Inspección"
          value={lastInspection ? dayjs(lastInspection).fromNow() : 'N/A'}
        />
      </div>

      {terminals.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Terminales:</span>
          <div className="flex flex-wrap gap-1">
            {terminals.map((terminal) => (
              <span
                key={terminal}
                className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
              >
                {terminal}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

interface StatItemProps {
  icon: typeof TrendingUp
  label: string
  value: string
}

function StatItem({ icon: Icon, label, value }: StatItemProps) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  )
}
