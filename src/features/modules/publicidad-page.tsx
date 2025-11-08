import { Badge } from '@/components/ui/badge'
import { ModuleBoard } from '@/features/modules/module-board'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'

export const PublicidadModulePage = () => (
  <ModuleBoard
    table="publicidad"
    title="Publicidad"
    description="Control de campañas y hallazgos"
    columns={[
      {
        label: 'Bus',
        render: (row: Database['public']['Tables']['publicidad']['Row']) => (
          <div>
            <p className="font-semibold">{row.bus_ppu}</p>
            <p className="text-xs text-slate-400">{row.terminal}</p>
          </div>
        ),
      },
      {
        label: 'Tiene',
        render: (row) => (
          <Badge variant={row.tiene ? 'success' : 'warning'}>
            {row.tiene ? 'Con publicidad' : 'Sin publicidad'}
          </Badge>
        ),
      },
      {
        label: 'Hallazgos',
        render: (row) => (
          <div className="text-xs">
            Daño: {row.danio ? 'Sí' : 'No'} · Residuos: {row.residuos ? 'Sí' : 'No'}
          </div>
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
