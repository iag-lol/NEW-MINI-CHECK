import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Radar, CheckCircle2, XCircle, AlertTriangle, Monitor } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type MobileyeRow = Database['public']['Tables']['mobileye']['Row']

export const MobileyeModulePage = () => {
  return (
    <ModuleLayout
      table="mobileye"
      title="Mobileye"
      description="Sistema de sensores y alertas - Solo buses Volvo"
      icon={Radar}
      searchFields={['bus_ppu', 'terminal']}
      getStats={(data: MobileyeRow[]) => {
        const total = data.length
        const completosOk = data.filter(r =>
          r.alerta_der && r.alerta_izq && r.consola &&
          r.sensor_der && r.sensor_izq && r.sensor_frontal
        ).length
        const conFallas = data.filter(r =>
          !r.alerta_der || !r.alerta_izq || !r.consola ||
          !r.sensor_der || !r.sensor_izq || !r.sensor_frontal
        ).length
        const consolasOk = data.filter(r => r.consola).length
        const tasaOperativa = total > 0 ? Math.round((completosOk / total) * 100) : 0

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Buses Volvo revisados',
            icon: Radar,
            variant: 'default' as const,
          },
          {
            title: 'Sistemas OK',
            value: completosOk,
            description: `${tasaOperativa}% operativo`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Con Fallas',
            value: conFallas,
            description: 'Requieren atención',
            icon: AlertTriangle,
            variant: conFallas > 0 ? 'warning' as const : 'success' as const,
          },
          {
            title: 'Consolas OK',
            value: consolasOk,
            description: `${total > 0 ? Math.round((consolasOk / total) * 100) : 0}% del total`,
            icon: Monitor,
            variant: 'info' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'bus_marca',
          label: 'Marca',
          type: 'select',
          options: [
            { label: 'Volvo', value: 'Volvo' },
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
      charts={[
        {
          title: 'Estado de Componentes',
          component: (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="componente" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="ok" fill="#10b981" name="OK" radius={[8, 8, 0, 0]} />
                <Bar dataKey="falla" fill="#ef4444" name="Falla" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ),
        },
        {
          title: 'Distribución de Estado General',
          component: (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={[]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.name} ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ),
        },
      ]}
      columns={[
        {
          label: 'Bus',
          render: (row: MobileyeRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {row.bus_marca} · {row.terminal}
              </p>
            </div>
          ),
        },
        {
          label: 'Estado General',
          render: (row) => {
            const ok =
              row.alerta_der &&
              row.alerta_izq &&
              row.consola &&
              row.sensor_der &&
              row.sensor_izq &&
              row.sensor_frontal
            return <Badge variant={ok ? 'success' : 'danger'}>{ok ? 'OK' : 'Con Fallas'}</Badge>
          },
        },
        {
          label: 'Alertas',
          render: (row) => (
            <div className="space-y-1">
              <div className="flex gap-2 text-xs">
                {row.alerta_izq ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Izq
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Izq
                  </span>
                )}
                {row.alerta_der ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Der
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Der
                  </span>
                )}
              </div>
            </div>
          ),
        },
        {
          label: 'Sensores',
          render: (row) => (
            <div className="space-y-1">
              <div className="flex gap-2 text-xs">
                {row.sensor_frontal ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Front
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Front
                  </span>
                )}
                {row.sensor_izq ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Izq
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Izq
                  </span>
                )}
                {row.sensor_der ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Der
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Der
                  </span>
                )}
              </div>
            </div>
          ),
        },
        {
          label: 'Consola',
          render: (row) => (
            <Badge variant={row.consola ? 'success' : 'danger'}>
              {row.consola ? 'OK' : 'Falla'}
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
