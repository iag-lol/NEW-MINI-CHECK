import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Megaphone, CheckCircle2, XCircle, AlertTriangle, Tag } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type PublicidadRow = Database['public']['Tables']['publicidad']['Row']

export const PublicidadModulePage = () => {
  return (
    <ModuleLayout
      table="publicidad"
      title="Publicidad"
      description="Control de campañas publicitarias y hallazgos"
      icon={Megaphone}
      searchFields={['bus_ppu', 'terminal', 'nombre_publicidad']}
      getStats={(data: PublicidadRow[]) => {
        const total = data.length
        const conPublicidad = data.filter(r => r.tiene).length
        const conDanio = data.filter(r => r.danio).length
        const conResiduos = data.filter(r => r.residuos).length
        const tasaInstalacion = total > 0 ? Math.round((conPublicidad / total) * 100) : 0

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Buses revisados',
            icon: Megaphone,
            variant: 'default' as const,
          },
          {
            title: 'Con Publicidad',
            value: conPublicidad,
            description: `${tasaInstalacion}% del total`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Con Daños',
            value: conDanio,
            description: 'Requieren reparación',
            icon: AlertTriangle,
            variant: conDanio > 0 ? 'warning' as const : 'success' as const,
          },
          {
            title: 'Con Residuos',
            value: conResiduos,
            description: 'Requieren limpieza',
            icon: XCircle,
            variant: conResiduos > 0 ? 'danger' as const : 'success' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'tiene',
          label: 'Estado',
          type: 'select',
          options: [
            { label: 'Con publicidad', value: 'true' },
            { label: 'Sin publicidad', value: 'false' },
          ],
        },
        {
          key: 'danio',
          label: 'Daños',
          type: 'select',
          options: [
            { label: 'Con daños', value: 'true' },
            { label: 'Sin daños', value: 'false' },
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
          title: 'Estado de Publicidad',
          component: (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="cantidad" fill="#6366f1" name="Cantidad" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ),
        },
        {
          title: 'Distribución de Hallazgos',
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
                  <Cell fill="#ef4444" />
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
          render: (row: PublicidadRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Estado',
          render: (row) => (
            <Badge variant={row.tiene ? 'success' : 'default'}>
              {row.tiene ? 'Con publicidad' : 'Sin publicidad'}
            </Badge>
          ),
        },
        {
          label: 'Campaña',
          render: (row) => (
            <div className="flex items-center gap-2">
              {row.nombre_publicidad ? (
                <>
                  <Tag className="h-3 w-3 text-brand-500" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {row.nombre_publicidad}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          ),
        },
        {
          label: 'Hallazgos',
          render: (row) => (
            <div className="space-y-1">
              <div className="flex gap-2 text-xs">
                {row.danio ? (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> Con daño
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Sin daño
                  </span>
                )}
                {row.residuos ? (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Con residuos
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Sin residuos
                  </span>
                )}
              </div>
            </div>
          ),
        },
        {
          label: 'Detalle Lados',
          render: (row) => {
            const detalle = row.detalle_lados as Record<string, any> ?? {}
            return (
              <div className="space-y-1">
                <div className="flex gap-2 text-xs">
                  {detalle.izquierda ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Izq
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <XCircle className="h-3 w-3" /> Izq
                    </span>
                  )}
                  {detalle.derecha ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Der
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <XCircle className="h-3 w-3" /> Der
                    </span>
                  )}
                  {detalle.luneta ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Luneta
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <XCircle className="h-3 w-3" /> Luneta
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
