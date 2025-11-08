import { Badge } from '@/components/ui/badge'
import { ModuleBoard } from '@/features/modules/module-board'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'

export const MobileyeModulePage = () => (
  <ModuleBoard
    table="mobileye"
    title="Mobileye"
    description="Sensores y alertas por bus Volvo"
    columns={[
      {
        label: 'Bus',
        render: (row: Database['public']['Tables']['mobileye']['Row']) => (
          <div>
            <p className="font-semibold">{row.bus_ppu}</p>
            <p className="text-xs text-slate-400">{row.terminal}</p>
          </div>
        ),
      },
      {
        label: 'Alertas',
        render: (row) => {
          const ok =
            row.alerta_der &&
            row.alerta_izq &&
            row.consola &&
            row.sensor_der &&
            row.sensor_izq &&
            row.sensor_frontal
          return <Badge variant={ok ? 'success' : 'danger'}>{ok ? 'OK' : 'Falla'}</Badge>
        },
      },
      {
        label: 'Observación',
        render: (row) => row.observacion ?? '—',
      },
      {
        label: 'Actualizado',
        render: (row) => dayjs(row.created_at).format('DD MMM HH:mm'),
      },
    ]}
  />
)
