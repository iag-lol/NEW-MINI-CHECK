import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Camera, Monitor, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type CamarasRow = Database['public']['Tables']['camaras']['Row']

export const CamarasModulePage = () => {
  return (
    <ModuleLayout
      table="camaras"
      title="Cámaras"
      description="Monitoreo de sistemas de vigilancia y visualización"
      icon={Camera}
      searchFields={['bus_ppu', 'terminal']}
      getStats={(data: CamarasRow[]) => {
        const total = data.length
        const funcionando = data.filter(r => r.monitor_estado === 'FUNCIONA').length
        const conProblemas = data.filter(r => r.monitor_estado !== 'FUNCIONA').length
        const tasaFuncionamiento = total > 0 ? Math.round((funcionando / total) * 100) : 0

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Sistemas revisados',
            icon: Camera,
            variant: 'default' as const,
          },
          {
            title: 'Funcionando',
            value: funcionando,
            description: `${tasaFuncionamiento}% operativo`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Con Problemas',
            value: conProblemas,
            description: 'Requieren atención',
            icon: AlertTriangle,
            variant: conProblemas > 0 ? 'warning' as const : 'success' as const,
          },
          {
            title: 'Tasa Operativa',
            value: `${tasaFuncionamiento}%`,
            description: 'Sistemas operativos',
            icon: Monitor,
            variant: tasaFuncionamiento >= 90 ? 'success' as const : tasaFuncionamiento >= 70 ? 'warning' as const : 'danger' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'monitor_estado',
          label: 'Estado Monitor',
          type: 'select',
          options: [
            { label: 'Funciona', value: 'FUNCIONA' },
            { label: 'Apagado', value: 'APAGADO' },
            { label: 'Con Daño', value: 'CON_DANO' },
            { label: 'Sin Señal', value: 'SIN_SENAL' },
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
        const monitorStates = [
          { key: 'FUNCIONA', label: 'Funciona', color: '#10b981' },
          { key: 'APAGADO', label: 'Apagado', color: '#94a3b8' },
          { key: 'CON_DANO', label: 'Con daño', color: '#f59e0b' },
          { key: 'SIN_SENAL', label: 'Sin señal', color: '#ef4444' },
        ]
        const estadoData = monitorStates.map(({ key, label, color }) => ({
          estado: label,
          cantidad: rows.filter((row) => row.monitor_estado === key).length,
          color,
        }))
        const totalEstados = estadoData.reduce((sum, item) => sum + item.cantidad, 0)
        const pieData =
          totalEstados > 0
            ? estadoData.map(({ estado, cantidad, color }) => ({
                name: estado,
                value: cantidad,
                color,
              }))
            : [{ name: 'Sin datos', value: 1, color: '#cbd5f5' }]

        return [
          {
            title: 'Estado de Monitores',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={
                    totalEstados > 0
                      ? estadoData
                      : [{ estado: 'Sin datos', cantidad: 0, color: '#cbd5f5' }]
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="cantidad"
                    radius={[8, 8, 0, 0]}
                    name="Cantidad"
                    fill="#6366f1"
                  />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
          {
            title: 'Distribución por Estado',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                    outerRadius={90}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
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
          render: (row: CamarasRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Monitor',
          render: (row) => (
            <Badge
              variant={
                row.monitor_estado === 'FUNCIONA' ? 'success' :
                row.monitor_estado === 'APAGADO' ? 'default' :
                row.monitor_estado === 'SIN_SENAL' ? 'warning' : 'danger'
              }
            >
              {row.monitor_estado}
            </Badge>
          ),
        },
        {
          label: 'Detalle Cámaras',
          render: (row) => {
            const detalle = row.detalle as Record<string, any> ?? {}
            return (
              <div className="space-y-1">
                <div className="flex gap-2 text-xs">
                  {detalle.puertas ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Puertas
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <XCircle className="h-3 w-3" /> Puertas
                    </span>
                  )}
                  {detalle.reversa ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Reversa
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <XCircle className="h-3 w-3" /> Reversa
                    </span>
                  )}
                  {detalle.visibles ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Visibles
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <XCircle className="h-3 w-3" /> Visibles
                    </span>
                  )}
                </div>
              </div>
            )
          },
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
