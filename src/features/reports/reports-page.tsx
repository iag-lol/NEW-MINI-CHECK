import { useState } from 'react'
import { Search, Users, FileText, MapPin, TrendingUp, Calendar } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PPUSearchReport } from './components/ppu-search-report'
import { WorkerReports } from './components/worker-reports'
import { IPAnalytics } from './components/ip-analytics'
import { TimelineReport } from './components/timeline-report'

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState('ppu')

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
          value="1,234"
          trend="+12% vs mes anterior"
          trendUp
        />
        <StatsCard
          icon={Users}
          title="Inspectores Activos"
          value="24"
          trend="3 nuevos esta semana"
          trendUp
        />
        <StatsCard
          icon={MapPin}
          title="Terminales Cubiertos"
          value="8"
          trend="100% cobertura"
          trendUp
        />
        <StatsCard
          icon={TrendingUp}
          title="Promedio Diario"
          value="42"
          trend="+8% vs semana anterior"
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
