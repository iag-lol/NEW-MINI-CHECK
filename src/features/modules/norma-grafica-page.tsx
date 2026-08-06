import { AlertTriangle, CheckCircle2, Hash, XCircle } from 'lucide-react'
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
import type { Database, EstadoNorma } from '@/types/database'

type NormaGraficaRow = Database['public']['Tables']['norma_grafica']['Row']

/** Los seis elementos del levantamiento, en el orden en que se revisan */
const ELEMENTOS = [
  { columna: 'interno_delantero', label: 'N° interno delantero' },
  { columna: 'interno_trasero', label: 'N° interno trasero' },
  { columna: 'ppu_lateral_derecho', label: 'PPU lateral derecho' },
  { columna: 'ppu_trasera', label: 'PPU trasera' },
  { columna: 'patente_delantera', label: 'Patente delantera' },
  { columna: 'patente_trasera', label: 'Patente trasera' },
] as const satisfies ReadonlyArray<{ columna: keyof NormaGraficaRow; label: string }>

const COLORES = ['#0d9488', '#f59e0b', '#dc2626']

const EstadoChip = ({ estado }: { estado: EstadoNorma }) => {
  if (estado === 'OK') return <Badge variant="success">Conforme</Badge>
  if (estado === 'DETERIORADO') return <Badge variant="warning">Deteriorado</Badge>
  return <Badge variant="danger">Falta</Badge>
}

/**
 * Norma gráfica: estado de la rotulación obligatoria del bus.
 *
 * El gráfico por elemento es el que decide el trabajo: dice si el problema está
 * repartido por toda la flota o concentrado en una pieza concreta (casi siempre
 * la PPU trasera), que es lo que permite pedir un lote de vinilos en vez de ir
 * bus por bus.
 */
export const NormaGraficaModulePage = () => {
  return (
    <ModuleLayout
      table="norma_grafica"
      title="Norma gráfica"
      description="Números internos, PPU normada y placas patentes"
      icon={Hash}
      searchFields={['bus_ppu', 'terminal']}
      getStats={(data: NormaGraficaRow[]) => {
        const total = data.length
        const cumplen = data.filter((fila) => fila.cumple).length
        const conFalta = data.filter((fila) =>
          ELEMENTOS.some((elemento) => fila[elemento.columna] === 'FALTA')
        ).length
        const soloDeterioro = data.filter(
          (fila) =>
            !fila.cumple &&
            !ELEMENTOS.some((elemento) => fila[elemento.columna] === 'FALTA')
        ).length
        const cobertura = total > 0 ? Math.round((cumplen / total) * 100) : 0

        return [
          {
            title: 'Buses revisados',
            value: total,
            description: 'Con levantamiento de norma gráfica',
            icon: Hash,
            variant: 'default' as const,
          },
          {
            title: 'Cumplen la norma',
            value: cumplen,
            description: `${cobertura}% de lo revisado`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Con elementos faltantes',
            value: conFalta,
            description: 'Requieren instalación',
            icon: XCircle,
            variant: conFalta > 0 ? ('danger' as const) : ('success' as const),
          },
          {
            title: 'Sólo deterioro',
            value: soloDeterioro,
            description: 'Están, pero hay que renovarlos',
            icon: AlertTriangle,
            variant: soloDeterioro > 0 ? ('warning' as const) : ('default' as const),
          },
        ]
      }}
      filters={[
        {
          key: 'cumple',
          label: 'Cumplimiento',
          type: 'select',
          options: [
            { label: 'Cumple la norma', value: 'true' },
            { label: 'No cumple', value: 'false' },
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
      getCharts={(data: NormaGraficaRow[]) => {
        // Cuántos buses fallan en cada elemento: separa reponer de repintar
        const porElemento = ELEMENTOS.map((elemento) => ({
          elemento: elemento.label,
          deteriorado: data.filter((fila) => fila[elemento.columna] === 'DETERIORADO').length,
          falta: data.filter((fila) => fila[elemento.columna] === 'FALTA').length,
        }))

        const resumen = [
          { nombre: 'Cumple', valor: data.filter((fila) => fila.cumple).length },
          {
            nombre: 'Sólo deterioro',
            valor: data.filter(
              (fila) =>
                !fila.cumple &&
                !ELEMENTOS.some((elemento) => fila[elemento.columna] === 'FALTA')
            ).length,
          },
          {
            nombre: 'Con faltantes',
            valor: data.filter((fila) =>
              ELEMENTOS.some((elemento) => fila[elemento.columna] === 'FALTA')
            ).length,
          },
        ].filter((item) => item.valor > 0)

        return [
          {
            title: 'Cumplimiento general',
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
            title: 'Hallazgos por elemento',
            component: (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={porElemento} margin={{ bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis
                    dataKey="elemento"
                    tick={{ fontSize: 9 }}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={54}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="deteriorado"
                    name="Deteriorado"
                    stackId="hallazgos"
                    fill="#f59e0b"
                  />
                  <Bar
                    dataKey="falta"
                    name="Falta"
                    stackId="hallazgos"
                    fill="#dc2626"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
        ]
      }}
      columns={[
        {
          label: 'Bus',
          render: (fila: NormaGraficaRow) => (
            <span className="font-semibold text-slate-900 dark:text-white">{fila.bus_ppu}</span>
          ),
        },
        {
          label: 'Resultado',
          render: (fila: NormaGraficaRow) =>
            fila.cumple ? (
              <Badge variant="success">Cumple</Badge>
            ) : (
              <Badge variant="danger">
                {ELEMENTOS.filter((elemento) => fila[elemento.columna] !== 'OK').length} no
                conformes
              </Badge>
            ),
        },
        ...ELEMENTOS.map((elemento) => ({
          label: elemento.label,
          render: (fila: NormaGraficaRow) => <EstadoChip estado={fila[elemento.columna]} />,
        })),
        {
          label: 'Terminal',
          render: (fila: NormaGraficaRow) => fila.terminal,
        },
        {
          label: 'Fecha',
          render: (fila: NormaGraficaRow) => dayjs(fila.created_at).format('DD MMM · HH:mm'),
        },
        {
          label: 'Observación',
          render: (fila: NormaGraficaRow) => (
            <span className="text-slate-500">{fila.observacion || '—'}</span>
          ),
        },
      ]}
    />
  )
}
