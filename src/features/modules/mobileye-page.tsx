import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import { GraficoBarrasDobles, GraficoDona, PALETA } from '@/components/charts/graficos-modulo'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Radar, CheckCircle2, XCircle, AlertTriangle, Monitor } from 'lucide-react'

type MobileyeRow = Database['public']['Tables']['mobileye']['Row']

export const MobileyeModulePage = () => {
  return (
    <ModuleLayout
      table="mobileye"
      title="Mobileye"
      description="Sistema de sensores y alertas - Solo buses Volvo"
      icon={Radar}
      searchFields={['bus_ppu', 'terminal']}
      queryLimit={null}
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
            { label: 'Los Agricultores', value: 'Los Agricultores' },
          ],
        },
      ]}
      getCharts={(rows) => {
        const componentes = [
          { key: 'alerta_izq' as const, label: 'Alerta izq.' },
          { key: 'alerta_der' as const, label: 'Alerta der.' },
          { key: 'consola' as const, label: 'Consola' },
          { key: 'sensor_frontal' as const, label: 'S. frontal' },
          { key: 'sensor_izq' as const, label: 'S. izquierdo' },
          { key: 'sensor_der' as const, label: 'S. derecho' },
        ]
        const sistemasOk = rows.filter(
          (row) =>
            row.alerta_der &&
            row.alerta_izq &&
            row.consola &&
            row.sensor_der &&
            row.sensor_izq &&
            row.sensor_frontal
        ).length

        return [
          {
            title: 'Estado por componente',
            component: (
              <GraficoBarrasDobles
                datos={componentes.map(({ key, label }) => ({
                  nombre: label,
                  a: rows.filter((row) => row[key] === true).length,
                  b: rows.filter((row) => row[key] === false).length,
                }))}
                serieA={{ nombre: 'Operativo', color: PALETA.ok }}
                serieB={{ nombre: 'Dañado', color: PALETA.falla }}
              />
            ),
          },
          {
            title: 'Equipos completos',
            component: (
              <GraficoDona
                etiquetaCentro="equipos"
                datos={[
                  { nombre: 'Sin fallas', valor: sistemasOk, color: PALETA.ok },
                  { nombre: 'Con alguna falla', valor: rows.length - sistemasOk, color: PALETA.atencion },
                ]}
              />
            ),
          },
        ]
      }}
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
