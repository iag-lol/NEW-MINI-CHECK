import { Badge } from '@/components/ui/badge'
import { ModuleBoard } from '@/features/modules/module-board'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'

export const ExtintoresModulePage = () => (
  <ModuleBoard
    table="extintores"
    title="Extintores"
    description="Vencimientos y estado físico"
    columns={[
      {
        label: 'Bus',
        render: (row: Database['public']['Tables']['extintores']['Row']) => (
          <div>
            <p className="font-semibold">{row.bus_ppu}</p>
            <p className="text-xs text-slate-400">{row.terminal}</p>
          </div>
        ),
      },
      {
        label: 'Certificación',
        render: (row) => (
          <Badge variant={row.certificacion === 'VIGENTE' ? 'success' : 'danger'}>
            {row.certificacion ?? '—'}
          </Badge>
        ),
      },
      {
        label: 'Vencimiento',
        render: (row) =>
          row.vencimiento_mes && row.vencimiento_anio
            ? `${row.vencimiento_mes}/${row.vencimiento_anio}`
            : '—',
      },
      {
        label: 'Presión',
        render: (row) => row.presion ?? '—',
      },
      {
        label: 'Actualizado',
        render: (row) => dayjs(row.created_at).format('DD MMM HH:mm'),
      },
    ]}
  />
)
