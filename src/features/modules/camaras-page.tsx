import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import { GraficoBarras, GraficoDona, PALETA } from '@/components/charts/graficos-modulo'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Camera, Monitor, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

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
            title: 'Estado de monitores',
            component: (
              <GraficoDona
                etiquetaCentro="monitores"
                datos={[
                  { nombre: 'Funciona', valor: rows.filter((row) => row.monitor_estado === 'FUNCIONA').length, color: PALETA.ok },
                  { nombre: 'Apagado', valor: rows.filter((row) => row.monitor_estado === 'APAGADO').length, color: PALETA.neutro },
                  { nombre: 'Con daño', valor: rows.filter((row) => row.monitor_estado === 'CON_DAÑO').length, color: PALETA.atencion },
                  { nombre: 'Sin señal', valor: rows.filter((row) => row.monitor_estado === 'SIN_SENAL').length, color: PALETA.falla },
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
            const detalle: Record<string, unknown> = row.detalle ?? {}
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
