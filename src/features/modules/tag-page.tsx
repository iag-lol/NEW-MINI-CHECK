import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import { GraficoBarras, GraficoDona, PALETA } from '@/components/charts/graficos-modulo'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { ShieldCheck, CheckCircle2, XCircle, Hash } from 'lucide-react'

type TagsRow = Database['public']['Tables']['tags']['Row']

export const TagModulePage = () => {
  return (
    <ModuleLayout
      table="tags"
      title="TAG"
      description="Control y seguimiento de TAG por bus"
      icon={ShieldCheck}
      searchFields={['bus_ppu', 'terminal', 'serie']}
      getStats={(data: TagsRow[]) => {
        const total = data.length
        const instalados = data.filter(r => r.tiene).length
        const sinTag = data.filter(r => !r.tiene).length
        const conSerie = data.filter(r => r.tiene && r.serie).length
        const tasaInstalacion = total > 0 ? Math.round((instalados / total) * 100) : 0

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Buses revisados',
            icon: ShieldCheck,
            variant: 'default' as const,
          },
          {
            title: 'TAG Instalados',
            value: instalados,
            description: `${tasaInstalacion}% del total`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Sin TAG',
            value: sinTag,
            description: 'Requieren instalación',
            icon: XCircle,
            variant: sinTag > 0 ? 'danger' as const : 'success' as const,
          },
          {
            title: 'Con Serie',
            value: conSerie,
            description: 'Registrados',
            icon: Hash,
            variant: 'info' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'tiene',
          label: 'Estado',
          type: 'select',
          options: [
            { label: 'Instalado', value: 'true' },
            { label: 'No tiene', value: 'false' },
          ],
        },
        {
          key: 'terminal',
          label: 'Terminal',
          type: 'select',
          options: [
            { label: 'El Roble', value: 'El Roble' },
            { label: 'La Reina', value: 'La Reina' },
            { label: 'María Angélica', value: 'María Angélica' },
            { label: 'Los Agricultores', value: 'Los Agricultores' },
          ],
        },
      ]}
      getCharts={(rows) => {
        const porTerminal = Object.entries(
          rows.reduce<Record<string, number>>((acc, row) => {
            acc[row.terminal] = (acc[row.terminal] ?? 0) + 1
            return acc
          }, {})
        )
          .map(([nombre, valor]) => ({ nombre, valor }))
          .sort((a, b) => b.valor - a.valor)

        return [
          {
            title: 'Estado de instalación',
            component: (
              <GraficoDona
                etiquetaCentro="revisiones"
                datos={[
                  { nombre: 'Instalado', valor: rows.filter((row) => row.tiene).length, color: PALETA.ok },
                  { nombre: 'Sin TAG', valor: rows.filter((row) => !row.tiene).length, color: PALETA.falla },
                ]}
              />
            ),
          },
          {
            title: 'Revisiones por terminal',
            component: <GraficoBarras datos={porTerminal} />,
          },
        ]
      }}
      columns={[
        {
          label: 'Bus',
          render: (row: TagsRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Estado',
          render: (row) => (
            <Badge variant={row.tiene ? 'success' : 'danger'}>
              {row.tiene ? 'Instalado' : 'No tiene'}
            </Badge>
          ),
        },
        {
          label: 'Serie TAG',
          render: (row) => (
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
              {row.serie ?? '—'}
            </span>
          ),
        },
        {
          label: 'Observación',
          render: (row) => (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {row.observacion ?? '—'}
            </span>
          ),
        },
        {
          label: 'Fecha',
          render: (row) => (
            <div className="text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">
                {dayjs(row.created_at).format('DD MMM')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dayjs(row.created_at).format('HH:mm')}
              </p>
            </div>
          ),
        },
      ]}
    />
  )
}
