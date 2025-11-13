import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WeekSelector } from '@/components/week-selector'
import { useWeekFilter } from '@/hooks/use-week-filter'
import type { Tables } from '@/types/database'

export const InformesPage = () => {
  const { weekInfo } = useWeekFilter()

  const { data } = useQuery({
    queryKey: ['informes', weekInfo.startISO, weekInfo.endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revisiones')
        .select('*')
        .gte('created_at', weekInfo.startISO)
        .lte('created_at', weekInfo.endISO)
      if (error) throw error
      return data as Tables<'revisiones'>[]
    },
  })

  const report = useMemo(() => {
    if (!data) return null
    return {
      week: `${weekInfo.year}-W${weekInfo.weekNumber}`,
      total: data.length,
      panne: data.filter((rev) => rev.estado_bus === 'EN_PANNE').length,
      operativo: data.filter((rev) => rev.operativo).length,
      terminales: Array.from(new Set(data.map((rev) => rev.terminal_detectado))).length,
    }
  }, [data, weekInfo])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Informes Semanales</h1>
          <p className="text-muted-foreground">
            Resumen de actividad de la semana seleccionada
          </p>
        </div>
        <WeekSelector />
      </div>

      {report ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-brand-500">Semana {report.week}</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {report.total} revisiones
            </h3>
            <p className="text-sm text-slate-500">
              {report.panne} buses en panne · {report.operativo} operativos · {report.terminales} terminales
            </p>
          </div>
          <Button variant="outline" className="gap-2 rounded-2xl">
            <FileText className="h-4 w-4" />
            Descargar informe
          </Button>
        </Card>
      ) : (
        <Card className="p-6 text-center text-sm text-slate-500">
          No hay información para la semana seleccionada.
        </Card>
      )}
    </div>
  )
}
