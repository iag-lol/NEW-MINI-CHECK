import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Users, FileText, MapPin, TrendingUp, Calendar } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import dayjs from '@/lib/dayjs'
import { PPUSearchReport } from './components/ppu-search-report'
import { WorkerReports } from './components/worker-reports'
import { IPAnalytics } from './components/ip-analytics'
import { TimelineReport } from './components/timeline-report'

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState('ppu')

  // Query para obtener estadísticas reales
  const { data: stats } = useQuery({
    queryKey: ['reports-stats'],
    queryFn: async () => {
      // Total de inspecciones
      const { count: totalInspections } = await supabase
        .from('revisiones')
        .select('*', { count: 'exact', head: true })

      // Inspectores activos (últimos 30 días)
      const thirtyDaysAgo = dayjs().subtract(30, 'days').toISOString()
      const { data: activeInspectors } = await supabase
        .from('revisiones')
        .select('inspector_rut')
        .gte('created_at', thirtyDaysAgo)

      const uniqueInspectors = new Set(activeInspectors?.map(r => r.inspector_rut))

      // Terminales cubiertos
      const { data: terminals } = await supabase
        .from('revisiones')
        .select('terminal_reportado')

      const uniqueTerminals = new Set(terminals?.map(r => r.terminal_reportado))

      // Promedio diario (últimos 7 días)
      const sevenDaysAgo = dayjs().subtract(7, 'days').toISOString()
      const { count: lastWeekCount } = await supabase
        .from('revisiones')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo)

      const dailyAverage = Math.round((lastWeekCount || 0) / 7)

      return {
        totalInspections: totalInspections || 0,
        activeInspectors: uniqueInspectors.size,
        terminalsCovered: uniqueTerminals.size,
        dailyAverage,
      }
    },
    refetchInterval: 30000, // Actualizar cada 30 segundos
  })

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reportes Avanzados</h1>
          <p className="text-muted-foreground">
            Análisis detallado de inspecciones, trabajadores y rendimiento
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard
          icon={FileText}
          title="Inspecciones Totales"
          value={stats?.totalInspections.toLocaleString() || '0'}
          trend="Total acumulado"
          trendUp
        />
        <StatsCard
          icon={Users}
          title="Inspectores Activos"
          value={stats?.activeInspectors.toString() || '0'}
          trend="Últimos 30 días"
          trendUp
        />
        <StatsCard
          icon={MapPin}
          title="Terminales Cubiertos"
          value={stats?.terminalsCovered.toString() || '0'}
          trend="Total de terminales"
          trendUp
        />
        <StatsCard
          icon={TrendingUp}
          title="Promedio Diario"
          value={stats?.dailyAverage.toString() || '0'}
          trend="Últimos 7 días"
          trendUp
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="ppu" className="gap-2">
            <Search className="h-4 w-4" />
            Búsqueda PPU
          </TabsTrigger>
          <TabsTrigger value="workers" className="gap-2">
            <Users className="h-4 w-4" />
            Por Trabajador
          </TabsTrigger>
          <TabsTrigger value="ip" className="gap-2">
            <MapPin className="h-4 w-4" />
            Análisis IP
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-2">
            <Calendar className="h-4 w-4" />
            Línea de Tiempo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ppu" className="space-y-4">
          <PPUSearchReport />
        </TabsContent>

        <TabsContent value="workers" className="space-y-4">
          <WorkerReports />
        </TabsContent>

        <TabsContent value="ip" className="space-y-4">
          <IPAnalytics />
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <TimelineReport />
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface StatsCardProps {
  icon: typeof FileText
  title: string
  value: string
  trend: string
  trendUp: boolean
}

function StatsCard({ icon: Icon, title, value, trend, trendUp }: StatsCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${trendUp ? 'bg-green-100' : 'bg-red-100'}`}>
            <Icon className={`h-5 w-5 ${trendUp ? 'text-green-600' : 'text-red-600'}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className={`text-xs ${trendUp ? 'text-green-600' : 'text-red-600'}`}>{trend}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
