import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import { GraficoArea, GraficoDona, PALETA } from '@/components/charts/graficos-modulo'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Gauge, TrendingUp, CheckCircle2, AlertTriangle } from 'lucide-react'

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
            { label: 'Los Agricultores', value: 'Los Agricultores' },
          ],
        },
      ]}
      getCharts={(rows) => {
        const tendencia = [...rows]
          .sort((a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf())
          .slice(-20)
          .map((row) => ({
            nombre: dayjs(row.created_at).format('DD MMM'),
            valor: Number(row.lectura),
          }))

        return [
          {
            title: 'Tendencia de lecturas (últimas 20)',
            component: (
              <GraficoArea datos={tendencia} sufijo=" km" nombreSerie="Kilometraje" />
            ),
          },
          {
            title: 'Estado de las lecturas',
            component: (
              <GraficoDona
                etiquetaCentro="lecturas"
                datos={[
                  { nombre: 'OK', valor: rows.filter((row) => row.estado === 'OK').length, color: PALETA.ok },
                  { nombre: 'Inconsistente', valor: rows.filter((row) => row.estado === 'INCONSISTENTE').length, color: PALETA.atencion },
                  { nombre: 'No funciona', valor: rows.filter((row) => row.estado === 'NO_FUNCIONA').length, color: PALETA.falla },
                ]}
              />
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
