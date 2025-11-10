import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { ShieldCheck, CheckCircle2, XCircle, Hash } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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
            { label: 'El Descanso', value: 'El Descanso' },
          ],
        },
      ]}
      getCharts={(rows) => {
        const estadoData = [
          { estado: 'Instalado', cantidad: rows.filter((row) => row.tiene).length },
          { estado: 'Sin TAG', cantidad: rows.filter((row) => !row.tiene).length },
        ]
        const totalEstados = estadoData.reduce((sum, item) => sum + item.cantidad, 0)
        const terminalCounts = rows.reduce<Record<string, number>>((acc, row) => {
          acc[row.terminal] = (acc[row.terminal] ?? 0) + 1
          return acc
        }, {})
        const terminalData = Object.entries(terminalCounts).map(([terminal, value]) => ({
          name: terminal,
          value,
        }))
        if (terminalData.length === 0) {
          terminalData.push({ name: 'Sin datos', value: 1 })
        }

        return [
          {
            title: 'Estado de Instalación',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={
                    totalEstados > 0 ? estadoData : [{ estado: 'Sin datos', cantidad: 0 }]
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cantidad" fill="#6366f1" name="Cantidad" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
          {
            title: 'Distribución por Terminal',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={terminalData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                    outerRadius={90}
                    dataKey="value"
                  >
                    {terminalData.map((entry, index) => (
                      <Cell
                        key={`${entry.name}-${index}`}
                        fill={['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#0ea5e9'][index % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ),
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
