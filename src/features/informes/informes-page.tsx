import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WeekSelector } from '@/components/week-selector'
import { useWeekFilter } from '@/hooks/use-week-filter'
import type { Tables } from '@/types/database'
import { exportExecutivePdf } from '@/lib/exporters'
import { useNotificationStore } from '@/store/notification-store'

export const InformesPage = () => {
  const { weekInfo } = useWeekFilter()
  const { push } = useNotificationStore()
  const [downloading, setDownloading] = useState(false)

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

  const downloadReport = async () => {
    setDownloading(true)
    try {
      await exportExecutivePdf(weekInfo.startISO, weekInfo.endISO)
      push({
        id: `weekly-report-${Date.now()}`,
        title: 'Informe generado',
        body: `El informe de ${weekInfo.label} se descargó correctamente.`,
        type: 'success',
      })
    } catch (error) {
      console.error('No pudimos generar el informe semanal', error)
      push({
        id: `weekly-report-error-${Date.now()}`,
        title: 'No se pudo generar el informe',
        body: 'Intenta nuevamente en unos momentos.',
        type: 'error',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-col gap-4 rounded-[26px] p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">Resumen ejecutivo</p>
          <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-slate-950 dark:text-white sm:text-3xl">Informes Semanales</h1>
          <p className="text-sm text-muted-foreground">
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
          <Button
            variant="outline"
            className="w-full gap-2 rounded-2xl sm:w-auto"
            onClick={() => void downloadReport()}
            disabled={downloading}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {downloading ? 'Generando...' : 'Descargar informe'}
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
