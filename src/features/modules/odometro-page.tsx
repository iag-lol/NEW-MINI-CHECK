import { Badge } from '@/components/ui/badge'
import { ModuleBoard } from '@/features/modules/module-board'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'

export const OdometroModulePage = () => (
  <ModuleBoard
    table="odometro"
    title="Odómetro"
    description="Historial de lecturas y consistencia"
    columns={[
      {
        label: 'Bus',
        render: (row: Database['public']['Tables']['odometro']['Row']) => (
          <div>
            <p className="font-semibold">{row.bus_ppu}</p>
            <p className="text-xs text-slate-400">{row.terminal}</p>
          </div>
        ),
      },
      {
        label: 'Lectura',
        render: (row) => row.lectura.toLocaleString('es-CL'),
      },
      {
        label: 'Estado',
        render: (row) => (
          <Badge variant={row.estado === 'OK' ? 'success' : 'warning'}>{row.estado}</Badge>
        ),
      },
      {
        label: 'Observación',
        render: (row) => row.observacion ?? '—',
      },
      {
        label: 'Fecha',
        render: (row) => dayjs(row.created_at).format('DD MMM HH:mm'),
      },
    ]}
  />
)
