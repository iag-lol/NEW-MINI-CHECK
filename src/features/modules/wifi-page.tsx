import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import { GraficoBarras, GraficoDona, PALETA } from '@/components/charts/graficos-modulo'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Wifi, CheckCircle2, WifiOff } from 'lucide-react'

type WifiRow = Database['public']['Tables']['wifi']['Row']

export const WifiModulePage = () => {
  return (
    <ModuleLayout
      table="wifi"
      title="WiFi"
      description="Control y seguimiento de conexión WiFi por bus"
      icon={Wifi}
      searchFields={['bus_ppu', 'terminal']}
      getStats={(data: WifiRow[]) => {
        const total = data.length
        const ppuVisible = data.filter(r => r.ppu_visible === true).length
        const tieneInternet = data.filter(r => r.tiene_internet === true).length
        const sinInternet = data.filter(r => r.tiene_internet === false).length
        const tasaConectividad = total > 0 ? Math.round((tieneInternet / total) * 100) : 0

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Buses revisados',
            icon: Wifi,
            variant: 'default' as const,
          },
          {
            title: 'PPU Visible',
            value: ppuVisible,
            description: `${total > 0 ? Math.round((ppuVisible / total) * 100) : 0}% del total`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Con Internet',
            value: tieneInternet,
            description: `${tasaConectividad}% del total`,
            icon: Wifi,
            variant: 'success' as const,
          },
          {
            title: 'Sin Internet',
            value: sinInternet,
            description: 'Requieren atención',
            icon: WifiOff,
            variant: sinInternet > 0 ? 'danger' as const : 'success' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'ppu_visible',
          label: 'PPU Visible',
          type: 'select',
          options: [
            { label: 'Sí', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        {
          key: 'tiene_internet',
          label: 'Conexión Internet',
          type: 'select',
          options: [
            { label: 'Con internet', value: 'true' },
            { label: 'Sin internet', value: 'false' },
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
            title: 'Conexión a internet',
            component: (
              <GraficoDona
                etiquetaCentro="con dato"
                datos={[
                  { nombre: 'Con internet', valor: rows.filter((row) => row.tiene_internet === true).length, color: PALETA.ok },
                  { nombre: 'Sin internet', valor: rows.filter((row) => row.tiene_internet === false).length, color: PALETA.falla },
                ]}
              />
            ),
          },
          {
            title: 'Visibilidad de la PPU en la red',
            component: (
              <GraficoBarras
                datos={[
                  { nombre: 'PPU visible', valor: rows.filter((row) => row.ppu_visible === true).length, color: PALETA.ok },
                  { nombre: 'No visible', valor: rows.filter((row) => row.ppu_visible === false).length, color: PALETA.falla },
                  { nombre: 'Sin dato', valor: rows.filter((row) => row.ppu_visible == null).length, color: PALETA.neutro },
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
          render: (row: WifiRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'PPU Visible',
          render: (row) => {
            if (row.ppu_visible === null) return <span className="text-slate-400">—</span>
            return (
              <Badge variant={row.ppu_visible ? 'success' : 'danger'}>
                {row.ppu_visible ? 'Sí' : 'No'}
              </Badge>
            )
          },
        },
        {
          label: 'Bus Encendido',
          render: (row) => {
            if (row.bus_encendido === null) return <span className="text-slate-400">—</span>
            return (
              <Badge variant={row.bus_encendido ? 'success' : 'danger'}>
                {row.bus_encendido ? 'Sí' : 'No'}
              </Badge>
            )
          },
        },
        {
          label: 'Internet',
          render: (row) => {
            if (row.tiene_internet === null) return <span className="text-slate-400">—</span>
            return (
              <Badge variant={row.tiene_internet ? 'success' : 'danger'}>
                {row.tiene_internet ? (
                  <span className="flex items-center gap-1">
                    <Wifi className="h-3 w-3" /> Conectado
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <WifiOff className="h-3 w-3" /> Sin conexión
                  </span>
                )}
              </Badge>
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
