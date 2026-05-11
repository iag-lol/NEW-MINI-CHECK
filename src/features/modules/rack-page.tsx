import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { HardDrive, ShieldAlert, Lock, LockOpen } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type RackRow = Database['public']['Tables']['rack']['Row']

const formatBool = (value: boolean | null | undefined) => {
  if (value === null || value === undefined) return 'Sin dato'
  return value ? 'Sí' : 'No'
}

export const RackModulePage = () => {
  return (
    <ModuleLayout
      table="rack"
      title="Rack"
      description="Control de disco duro y seguridad física del rack"
      icon={HardDrive}
      searchFields={['bus_ppu', 'terminal']}
      getStats={(data: RackRow[]) => {
        const total = data.length
        const conDisco = data.filter((r) => r.tiene_disco_duro === true).length
        const sinDisco = data.filter((r) => r.tiene_disco_duro === false).length
        const alertasSeguridad = data.filter(
          (r) =>
            r.tiene_disco_duro === false ||
            r.cerraduras_buen_estado === false ||
            r.tiene_candado === false ||
            (r.tiene_disco_duro === true && r.tiene_seguridad_extra === false)
        ).length

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Racks inspeccionados',
            icon: HardDrive,
            variant: 'default' as const,
          },
          {
            title: 'Con Disco Duro',
            value: conDisco,
            description: `${total > 0 ? Math.round((conDisco / total) * 100) : 0}% del total`,
            icon: Lock,
            variant: 'success' as const,
          },
          {
            title: 'Sin Disco Duro',
            value: sinDisco,
            description: 'Seguimiento por posible robo',
            icon: LockOpen,
            variant: sinDisco > 0 ? 'danger' as const : 'success' as const,
          },
          {
            title: 'Alertas de Seguridad',
            value: alertasSeguridad,
            description: 'Candados/cerraduras/seguridad extra',
            icon: ShieldAlert,
            variant:
              alertasSeguridad > 5
                ? ('danger' as const)
                : alertasSeguridad > 0
                  ? ('warning' as const)
                  : ('success' as const),
          },
        ]
      }}
      filters={[
        {
          key: 'tiene_disco_duro',
          label: 'Disco duro',
          type: 'select',
          options: [
            { label: 'Sí', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        {
          key: 'cerraduras_buen_estado',
          label: 'Cerraduras',
          type: 'select',
          options: [
            { label: 'Buen estado', value: 'true' },
            { label: 'Con falla', value: 'false' },
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
        const discoData = [
          { estado: 'Con disco', cantidad: rows.filter((r) => r.tiene_disco_duro === true).length },
          { estado: 'Sin disco', cantidad: rows.filter((r) => r.tiene_disco_duro === false).length },
        ]
        const seguridadData = [
          {
            estado: 'Cerraduras OK',
            cantidad: rows.filter((r) => r.cerraduras_buen_estado === true).length,
          },
          {
            estado: 'Cerraduras con falla',
            cantidad: rows.filter((r) => r.cerraduras_buen_estado === false).length,
          },
        ]
        const terminalCounts = rows.reduce<Record<string, number>>((acc, row) => {
          const terminal = row.terminal || 'Sin terminal'
          acc[terminal] = (acc[terminal] ?? 0) + 1
          return acc
        }, {})
        const terminalData = Object.entries(terminalCounts).map(([name, value]) => ({ name, value }))

        if (terminalData.length === 0) {
          terminalData.push({ name: 'Sin datos', value: 1 })
        }

        return [
          {
            title: 'Estado de Disco Duro',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={discoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cantidad" fill="#0ea5e9" name="Cantidad" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
          {
            title: 'Estado de Cerraduras',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={seguridadData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cantidad" fill="#f59e0b" name="Cantidad" radius={[8, 8, 0, 0]} />
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
                        fill={['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#6366f1'][index % 5]}
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
          className: 'min-w-[160px]',
          render: (row: RackRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Cerraduras Esperadas',
          className: 'min-w-[150px]',
          render: (row) => (
            <span className="font-semibold text-slate-900 dark:text-white">
              {row.cantidad_cerraduras_esperada}
            </span>
          ),
        },
        {
          label: 'Cerraduras',
          className: 'min-w-[140px]',
          render: (row) => (
            <Badge
              variant={
                row.cerraduras_buen_estado === null
                  ? 'outline'
                  : row.cerraduras_buen_estado
                    ? 'success'
                    : 'danger'
              }
            >
              {formatBool(row.cerraduras_buen_estado)}
            </Badge>
          ),
        },
        {
          label: 'Candado',
          className: 'min-w-[120px]',
          render: (row) => (
            <Badge
              variant={
                row.tiene_candado === null ? 'outline' : row.tiene_candado ? 'success' : 'danger'
              }
            >
              {formatBool(row.tiene_candado)}
            </Badge>
          ),
        },
        {
          label: 'Disco Duro',
          className: 'min-w-[130px]',
          render: (row) => (
            <Badge
              variant={
                row.tiene_disco_duro === null
                  ? 'outline'
                  : row.tiene_disco_duro
                    ? 'success'
                    : 'danger'
              }
            >
              {formatBool(row.tiene_disco_duro)}
            </Badge>
          ),
        },
        {
          label: 'Seguridad Extra',
          className: 'min-w-[140px]',
          render: (row) => (
            <Badge
              variant={
                row.tiene_seguridad_extra === null
                  ? 'outline'
                  : row.tiene_seguridad_extra
                    ? 'success'
                    : 'warning'
              }
            >
              {formatBool(row.tiene_seguridad_extra)}
            </Badge>
          ),
        },
        {
          label: 'Observación',
          className: 'min-w-[240px]',
          render: (row) => (
            <span className="text-sm text-slate-600 dark:text-slate-400">{row.observacion ?? '—'}</span>
          ),
        },
        {
          label: 'Fecha',
          className: 'min-w-[120px]',
          render: (row) => (
            <div className="text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">{dayjs(row.created_at).format('DD MMM')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{dayjs(row.created_at).format('HH:mm')}</p>
            </div>
          ),
        },
      ]}
    />
  )
}
