import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import dayjs, { getIsoWeekYear } from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Tables } from '@/types/database'

export const InformesPage = () => {
  const { data } = useQuery({
    queryKey: ['informes'],
    queryFn: async () => {
      const since = dayjs().subtract(21, 'day').toISOString()
      const { data, error } = await supabase
        .from('revisiones')
        .select('*')
        .gte('created_at', since)
      if (error) throw error
      return data as Tables<'revisiones'>[]
    },
  })

  const reports = useMemo(() => {
    if (!data) return []
      const byWeek = data.reduce<Record<string, Tables<'revisiones'>[]>>((acc, revision) => {
        const date = dayjs(revision.created_at)
        const week = date.isoWeek()
        const key = `${getIsoWeekYear(date)}-W${week}`
      acc[key] = acc[key] ? [...acc[key], revision] : [revision]
      return acc
    }, {})
    return Object.entries(byWeek)
      .map(([week, revisions]) => ({
        week,
        total: revisions.length,
        panne: revisions.filter((rev) => rev.estado_bus === 'EN_PANNE').length,
        terminales: Array.from(new Set(revisions.map((rev) => rev.terminal_detectado))).length,
      }))
      .sort((a, b) => (a.week > b.week ? -1 : 1))
  }, [data])

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <Card key={report.week} className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-brand-500">Semana {report.week}</p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {report.total} revisiones
            </h3>
            <p className="text-sm text-slate-500">
              {report.panne} buses en panne · {report.terminales} terminales
            </p>
          </div>
          <Button variant="outline" className="gap-2 rounded-2xl">
            <FileText className="h-4 w-4" />
            Descargar informe
          </Button>
        </Card>
      ))}
      {!reports.length && (
        <Card className="p-6 text-center text-sm text-slate-500">
          Aún no hay información suficiente para generar informes semanales.
        </Card>
      )}
    </div>
  )
}
