import { Badge } from '@/components/ui/badge'
import { ModuleBoard } from '@/features/modules/module-board'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'

export const TagModulePage = () => (
  <ModuleBoard
    table="tags"
    title="TAG"
    description="Control en línea de TAG por bus"
    columns={[
      {
        label: 'Bus',
        render: (row: Database['public']['Tables']['tags']['Row']) => (
          <div>
            <p className="font-semibold">{row.bus_ppu}</p>
            <p className="text-xs text-slate-400">{row.terminal}</p>
          </div>
        ),
      },
      {
        label: 'Tiene',
        render: (row) => (
          <Badge variant={row.tiene ? 'success' : 'danger'}>
            {row.tiene ? 'Instalado' : 'No tiene'}
          </Badge>
        ),
      },
      {
        label: 'Serie',
        render: (row) => row.serie ?? '—',
      },
      {
        label: 'Última actualización',
        render: (row) => dayjs(row.created_at).format('DD MMM HH:mm'),
      },
    ]}
  />
)
