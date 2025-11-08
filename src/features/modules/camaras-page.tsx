import { Badge } from '@/components/ui/badge'
import { ModuleBoard } from '@/features/modules/module-board'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'

export const CamarasModulePage = () => (
  <ModuleBoard
    table="camaras"
    title="Cámaras"
    description="Seguimiento de monitores y visualizaciones"
    columns={[
      {
        label: 'Bus',
        render: (row: Database['public']['Tables']['camaras']['Row']) => (
          <div>
            <p className="font-semibold">{row.bus_ppu}</p>
            <p className="text-xs text-slate-400">{row.terminal}</p>
          </div>
        ),
      },
      {
        label: 'Monitor',
        render: (row) => (
          <Badge variant={row.monitor_estado === 'FUNCIONA' ? 'success' : 'danger'}>
            {row.monitor_estado}
          </Badge>
        ),
      },
      {
        label: 'Detalle',
        render: (row) => {
          const detalle = row.detalle ?? {}
          return (
            <div className="text-xs text-slate-500">
              Puertas: {detalle.puertas ? 'OK' : '—'} · Reversa:{' '}
              {detalle.reversa ? 'OK' : '—'} · Visibles: {detalle.visibles ? 'OK' : '—'}
            </div>
          )
        },
      },
      {
        label: 'Actualizado',
        render: (row) => dayjs(row.created_at).format('DD MMM HH:mm'),
      },
    ]}
  />
)
