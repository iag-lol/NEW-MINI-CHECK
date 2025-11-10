import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Gauge, TrendingUp, CheckCircle2, AlertTriangle } from 'lucide-react'
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type OdometroRow = Database['public']['Tables']['odometro']['Row']

export const OdometroModulePage = () => {
  return (
    <ModuleLayout
      table="odometro"
      title="Odómetro"
      description="Historial de lecturas y análisis de consistencia"
      icon={Gauge}
      searchFields={['bus_ppu', 'terminal']}
      getStats={(data: OdometroRow[]) => {
        const total = data.length
        const okCount = data.filter(r => r.estado === 'OK').length
        const inconsistentCount = data.filter(r => r.estado === 'INCONSISTENTE').length
        const avgKm = data.length > 0
          ? Math.round(data.reduce((sum, r) => sum + Number(r.lectura), 0) / data.length)
          : 0

        return [
          {
            title: 'Total Lecturas',
            value: total,
            description: 'Registros totales',
            icon: Gauge,
            variant: 'default' as const,
          },
          {
            title: 'Promedio Km',
            value: avgKm.toLocaleString('es-CL'),
            description: 'Kilometraje promedio',
            icon: TrendingUp,
            variant: 'info' as const,
          },
          {
            title: 'Estado OK',
            value: okCount,
            description: `${total > 0 ? Math.round((okCount / total) * 100) : 0}% del total`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Inconsistentes',
            value: inconsistentCount,
            description: 'Requieren revisión',
            icon: AlertTriangle,
            variant: inconsistentCount > 0 ? 'warning' as const : 'success' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'estado',
          label: 'Estado',
          type: 'select',
          options: [
            { label: 'OK', value: 'OK' },
            { label: 'Inconsistente', value: 'INCONSISTENTE' },
            { label: 'No Funciona', value: 'NO_FUNCIONA' },
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
        const sorted = [...rows].sort(
          (a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf()
        )
        const trendData = sorted
          .slice(-20)
          .map((row) => ({
            date: dayjs(row.created_at).format('DD MMM'),
            lectura: Number(row.lectura),
          }))
        if (!trendData.length) {
          trendData.push({ date: 'Sin datos', lectura: 0 })
        }
        const stateMeta = [
          { key: 'OK' as const, label: 'OK', color: '#10b981' },
          { key: 'INCONSISTENTE' as const, label: 'Inconsistente', color: '#f59e0b' },
          { key: 'NO_FUNCIONA' as const, label: 'No funciona', color: '#ef4444' },
        ]
        const stateData = stateMeta.map(({ key, label, color }) => ({
          name: label,
          value: rows.filter((row) => row.estado === key).length,
          color,
        }))
        const stateDataFinal = stateData.some((entry) => entry.value > 0)
          ? stateData
          : [{ name: 'Sin datos', value: 1, color: '#cbd5f5' }]

        return [
          {
            title: 'Tendencia de Lecturas (Últimas 20)',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="lectura"
                    stroke="#6366f1"
                    strokeWidth={2}
                    name="Kilometraje"
                  />
                </LineChart>
              </ResponsiveContainer>
            ),
          },
          {
            title: 'Distribución por Estado',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={stateDataFinal}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                    outerRadius={90}
                    dataKey="value"
                  >
                    {stateDataFinal.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={entry.color} />
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
          render: (row: OdometroRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Lectura',
          render: (row) => (
            <span className="font-mono font-semibold text-slate-900 dark:text-white">
              {Number(row.lectura).toLocaleString('es-CL')} km
            </span>
          ),
        },
        {
          label: 'Estado',
          render: (row) => (
            <Badge variant={row.estado === 'OK' ? 'success' : row.estado === 'INCONSISTENTE' ? 'warning' : 'danger'}>
              {row.estado}
            </Badge>
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
