import {
  BatteryCharging,
  BatteryWarning,
  CheckCircle2,
  HelpCircle,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'

type Mas15Row = Database['public']['Tables']['mas15']['Row']

const COLORES = ['#16a34a', '#dc2626', '#94a3b8']

export const Mas15ModulePage = () => {
  return (
    <ModuleLayout
      table="mas15"
      title="+15"
      description="Alimentación permanente del equipo embarcado sin corta corriente"
      icon={BatteryCharging}
      searchFields={['bus_ppu', 'terminal']}
      getStats={(data: Mas15Row[]) => {
        const total = data.length
        const con = data.filter((fila) => fila.tiene_mas15 === true).length
        const sin = data.filter((fila) => fila.tiene_mas15 === false).length
        // Sin encendido previo no hay resultado válido que contar
        const sinEvaluar = data.filter((fila) => fila.tiene_mas15 === null).length
        const cobertura = total > 0 ? Math.round((con / total) * 100) : 0

        return [
          {
            title: 'Buses revisados',
            value: total,
            description: 'Con prueba de +15',
            icon: BatteryCharging,
            variant: 'default' as const,
          },
          {
            title: 'Con +15',
            value: con,
            description: `${cobertura}% de la flota revisada`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Sin +15',
            value: sin,
            description: 'El equipo se apaga sin corriente',
            icon: XCircle,
            variant: sin > 0 ? ('danger' as const) : ('success' as const),
          },
          {
            title: 'No evaluados',
            value: sinEvaluar,
            description: 'El bus no llegó a encender',
            icon: HelpCircle,
            variant: sinEvaluar > 0 ? ('warning' as const) : ('default' as const),
          },
        ]
      }}
      filters={[
        {
          key: 'tiene_mas15',
          label: 'Resultado',
          type: 'select',
          options: [
            { label: 'Cuenta con +15', value: 'true' },
            { label: 'No cuenta con +15', value: 'false' },
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
      getCharts={(data: Mas15Row[]) => {
        const resumen = [
          { nombre: 'Con +15', valor: data.filter((f) => f.tiene_mas15 === true).length },
          { nombre: 'Sin +15', valor: data.filter((f) => f.tiene_mas15 === false).length },
          {
            nombre: 'No evaluado',
            valor: data.filter((f) => f.tiene_mas15 === null).length,
          },
        ].filter((item) => item.valor > 0)

        const porTerminal = Object.entries(
          data.reduce<Record<string, { con: number; sin: number }>>((acc, fila) => {
            const clave = fila.terminal || 'Sin terminal'
            if (!acc[clave]) acc[clave] = { con: 0, sin: 0 }
            if (fila.tiene_mas15 === true) acc[clave].con += 1
            else if (fila.tiene_mas15 === false) acc[clave].sin += 1
            return acc
          }, {})
        ).map(([terminal, valores]) => ({ terminal, ...valores }))

        return [
          {
            title: 'Resultado de la prueba',
            component: (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={resumen}
                    dataKey="valor"
                    nameKey="nombre"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {resumen.map((entrada, indice) => (
                      <Cell key={entrada.nombre} fill={COLORES[indice % COLORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ),
          },
          {
            title: 'Por terminal',
            component: (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={porTerminal}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="terminal" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="con" name="Con +15" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sin" name="Sin +15" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
        ]
      }}
      columns={[
        {
          label: 'Bus',
          render: (fila: Mas15Row) => (
            <span className="font-semibold text-slate-900 dark:text-white">
              {fila.bus_ppu}
            </span>
          ),
        },
        {
          label: 'Resultado',
          render: (fila: Mas15Row) =>
            fila.tiene_mas15 === null ? (
              <Badge variant="warning">No evaluado</Badge>
            ) : fila.tiene_mas15 ? (
              <Badge variant="success">Con +15</Badge>
            ) : (
              <Badge variant="danger">Sin +15</Badge>
            ),
        },
        {
          label: 'Consola',
          render: (fila: Mas15Row) =>
            fila.consola_encendida === null ? (
              <span className="text-slate-400">—</span>
            ) : fila.consola_encendida ? (
              <span className="text-emerald-600 dark:text-emerald-400">Encendida</span>
            ) : (
              <span className="text-red-600 dark:text-red-400">Se apagó</span>
            ),
        },
        {
          label: 'Validador',
          render: (fila: Mas15Row) =>
            fila.validador_encendido === null ? (
              <span className="text-slate-400">—</span>
            ) : fila.validador_encendido ? (
              <span className="text-emerald-600 dark:text-emerald-400">Encendido</span>
            ) : (
              <span className="text-red-600 dark:text-red-400">Se apagó</span>
            ),
        },
        {
          label: 'Encendido previo',
          render: (fila: Mas15Row) =>
            fila.arranque_ok ? (
              <span className="text-slate-600 dark:text-slate-300">Correcto</span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <BatteryWarning className="h-3.5 w-3.5" />
                No se logró
              </span>
            ),
        },
        {
          label: 'Terminal',
          render: (fila: Mas15Row) => fila.terminal,
        },
        {
          label: 'Fecha',
          render: (fila: Mas15Row) => dayjs(fila.created_at).format('DD MMM · HH:mm'),
        },
        {
          label: 'Observación',
          render: (fila: Mas15Row) => (
            <span className="text-slate-500">{fila.observacion || '—'}</span>
          ),
        },
      ]}
    />
  )
}
