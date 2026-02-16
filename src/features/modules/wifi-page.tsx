import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Wifi, CheckCircle2, XCircle, AlertCircle, WifiOff } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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
        const ppuNoVisible = data.filter(r => r.ppu_visible === false).length
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
            { label: 'El Descanso', value: 'El Descanso' },
          ],
        },
      ]}
      getCharts={(rows) => {
        const ppuData = [
          { estado: 'PPU Visible', cantidad: rows.filter((row) => row.ppu_visible === true).length },
          { estado: 'PPU No Visible', cantidad: rows.filter((row) => row.ppu_visible === false).length },
        ]
        const totalPpu = ppuData.reduce((sum, item) => sum + item.cantidad, 0)
        
        const internetData = [
          { estado: 'Con Internet', cantidad: rows.filter((row) => row.tiene_internet === true).length },
          { estado: 'Sin Internet', cantidad: rows.filter((row) => row.tiene_internet === false).length },
        ]
        const totalInternet = internetData.reduce((sum, item) => sum + item.cantidad, 0)

        const terminalCounts = rows.reduce<Record<string, number>>((acc, row) => {
          acc[row.terminal] = (acc[row.terminal] ?? 0) + 1
          return acc
        }, {})
        const terminalData = Object.entries(terminalCounts).map(([terminal, value]) => ({
          name: terminal,
          value,
        }))
        if (terminalData.length === 0) {
          terminalData.push({ name: 'Sin datos', value: 1 })
        }

        return [
          {
            title: 'Visibilidad de PPU',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={
                    totalPpu > 0 ? ppuData : [{ estado: 'Sin datos', cantidad: 0 }]
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cantidad" fill="#6366f1" name="Cantidad" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
          {
            title: 'Conexión a Internet',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={
                    totalInternet > 0 ? internetData : [{ estado: 'Sin datos', cantidad: 0 }]
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cantidad" fill="#10b981" name="Cantidad" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
          {
            title: 'Distribución por Terminal',
            component: (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={terminalData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                    outerRadius={90}
                    dataKey="value"
                  >
                    {terminalData.map((entry, index) => (
                      <Cell
                        key={`${entry.name}-${index}`}
                        fill={['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#0ea5e9'][index % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ),
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

