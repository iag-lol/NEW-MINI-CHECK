import { useId } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Kit de gráficos de los módulos de inspección.
 *
 * Antes cada página armaba sus Recharts a mano con el tooltip y la leyenda
 * por defecto: fondo blanco con borde gris, tipografía de 12 px sin pulir y
 * cada módulo con un estilo distinto. Este kit fija una sola voz visual
 * —tooltip oscuro, leyenda de fichas con porcentaje, ejes sin adornos— y las
 * páginas sólo aportan los datos.
 */

/* ------------------------------------------------------------------ Estilo */

export const PALETA = {
  ok: '#10b981',
  atencion: '#f59e0b',
  falla: '#ef4444',
  neutro: '#94a3b8',
  marca: '#6366f1',
  info: '#0ea5e9',
} as const

/** Tooltip oscuro compartido: se lee igual sobre claro y oscuro */
const TOOLTIP = {
  borderRadius: 12,
  border: 'none',
  fontSize: 12,
  padding: '8px 12px',
  background: 'rgba(15,23,42,0.92)',
  color: '#fff',
  boxShadow: '0 10px 24px -12px rgba(15,23,42,.6)',
} as const

const CURSOR_SUAVE = { fill: 'rgba(148,163,184,0.10)' } as const

const EJE = {
  tick: { fontSize: 10.5, fill: '#94a3b8' },
  axisLine: false,
  tickLine: false,
} as const

export interface DatoGrafico {
  nombre: string
  valor: number
  color?: string
  // Recharts 3 exige que sus datos sean indexables
  [clave: string]: string | number | undefined
}

/** Estado vacío honesto: un aro gris con "0" engaña menos que un gráfico falso */
const SinDatos = ({ alto }: { alto: number }) => (
  <div
    style={{ height: alto }}
    className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--app-radius-sm)] border border-dashed border-slate-200/80 dark:border-slate-800"
  >
    <p className="text-[12px] font-semibold text-slate-400">Sin registros en el período</p>
    <p className="text-[10.5px] text-slate-400/70">
      Los datos aparecen al instante con cada revisión
    </p>
  </div>
)

/** Leyenda propia: fichas con punto de color, valor y porcentaje */
const Leyenda = ({ datos, total }: { datos: DatoGrafico[]; total: number }) => (
  <div className="mt-2.5 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
    {datos.map((dato) => (
      <span key={dato.nombre} className="inline-flex items-center gap-1.5 text-[11px]">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ background: dato.color ?? PALETA.marca }}
        />
        <span className="font-semibold text-slate-600 dark:text-slate-300">{dato.nombre}</span>
        <span className="font-bold tabular-nums text-slate-900 dark:text-white">
          {dato.valor.toLocaleString('es-CL')}
        </span>
        {total > 0 && (
          <span className="tabular-nums text-slate-400">
            {Math.round((dato.valor / total) * 100)}%
          </span>
        )}
      </span>
    ))}
  </div>
)

/* -------------------------------------------------------------------- Dona */

interface GraficoDonaProps {
  datos: DatoGrafico[]
  /** Qué representa el total del centro, p. ej. "revisiones" */
  etiquetaCentro?: string
  alto?: number
}

/**
 * Dona con el total en el centro.
 *
 * El centro responde la primera pregunta ("¿sobre cuántos?") sin tener que
 * sumar porciones de cabeza, y la leyenda de abajo lleva valor y porcentaje
 * para no depender del tooltip.
 */
export const GraficoDona = ({ datos, etiquetaCentro = 'registros', alto = 210 }: GraficoDonaProps) => {
  const visibles = datos.filter((dato) => dato.valor > 0)
  const total = datos.reduce((suma, dato) => suma + dato.valor, 0)

  if (total === 0) return <SinDatos alto={alto + 34} />

  return (
    <div>
      <div className="relative" style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visibles}
              dataKey="valor"
              nameKey="nombre"
              innerRadius="68%"
              outerRadius="94%"
              paddingAngle={2.5}
              cornerRadius={5}
              stroke="none"
            >
              {visibles.map((dato) => (
                <Cell key={dato.nombre} fill={dato.color ?? PALETA.marca} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP}
              formatter={(valor: number, nombre: string) => [
                `${valor.toLocaleString('es-CL')} · ${Math.round((valor / total) * 100)}%`,
                nombre,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* El centro es un div y no un <text> de SVG: hereda el modo oscuro */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">
            {total.toLocaleString('es-CL')}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {etiquetaCentro}
          </p>
        </div>
      </div>
      <Leyenda datos={visibles} total={total} />
    </div>
  )
}

/* ------------------------------------------------------------------ Barras */

interface GraficoBarrasProps {
  datos: DatoGrafico[]
  /** Color de la serie cuando los datos no traen uno propio */
  color?: string
  alto?: number
}

/** Barras verticales finas con degradado y el valor encima de cada barra */
export const GraficoBarras = ({ datos, color = PALETA.marca, alto = 240 }: GraficoBarrasProps) => {
  const idGradiente = useId()
  const total = datos.reduce((suma, dato) => suma + dato.valor, 0)

  if (total === 0) return <SinDatos alto={alto} />

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} margin={{ top: 18, right: 4, left: -18, bottom: 0 }} barCategoryGap="32%">
        <defs>
          {/* Un degradado por color distinto presente en los datos */}
          {[...new Set(datos.map((dato) => dato.color ?? color))].map((tono) => (
            <linearGradient key={tono} id={`${idGradiente}-${tono.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tono} stopOpacity={0.95} />
              <stop offset="100%" stopColor={tono} stopOpacity={0.55} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.16} vertical={false} />
        <XAxis dataKey="nombre" {...EJE} interval={0} />
        <YAxis {...EJE} allowDecimals={false} width={40} />
        <Tooltip contentStyle={TOOLTIP} cursor={CURSOR_SUAVE} formatter={(valor: number) => [valor.toLocaleString('es-CL'), 'Registros']} />
        <Bar dataKey="valor" maxBarSize={34} radius={[7, 7, 0, 0]}>
          <LabelList
            dataKey="valor"
            position="top"
            className="fill-slate-500 dark:fill-slate-400"
            style={{ fontSize: 10.5, fontWeight: 700 }}
          />
          {datos.map((dato) => (
            <Cell
              key={dato.nombre}
              fill={`url(#${idGradiente}-${(dato.color ?? color).replace('#', '')})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ----------------------------------------------------------- Barras dobles */

export interface DatoDoble {
  nombre: string
  a: number
  b: number
  [clave: string]: string | number | undefined
}

interface GraficoBarrasDoblesProps {
  datos: DatoDoble[]
  serieA: { nombre: string; color?: string }
  serieB: { nombre: string; color?: string }
  /** Apiladas en vez de agrupadas: mejor cuando importa el total por categoría */
  apilado?: boolean
  alto?: number
}

/** Dos series comparadas (OK/Falla, Con/Sin), con leyenda de fichas propia */
export const GraficoBarrasDobles = ({
  datos,
  serieA,
  serieB,
  apilado = false,
  alto = 240,
}: GraficoBarrasDoblesProps) => {
  const colorA = serieA.color ?? PALETA.ok
  const colorB = serieB.color ?? PALETA.falla
  const totalA = datos.reduce((suma, dato) => suma + dato.a, 0)
  const totalB = datos.reduce((suma, dato) => suma + dato.b, 0)

  if (totalA + totalB === 0) return <SinDatos alto={alto} />

  // Las etiquetas largas ("Sensor izquierdo") se giran para no solaparse
  const etiquetasLargas = datos.some((dato) => dato.nombre.length > 9)

  return (
    <div>
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart
          data={datos}
          margin={{ top: 6, right: 4, left: -18, bottom: etiquetasLargas ? 14 : 0 }}
          barCategoryGap="28%"
          barGap={3}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.16} vertical={false} />
          <XAxis
            dataKey="nombre"
            {...EJE}
            interval={0}
            angle={etiquetasLargas ? -22 : 0}
            textAnchor={etiquetasLargas ? 'end' : 'middle'}
            height={etiquetasLargas ? 52 : 30}
            tick={{ fontSize: 9.5, fill: '#94a3b8' }}
          />
          <YAxis {...EJE} allowDecimals={false} width={40} />
          <Tooltip contentStyle={TOOLTIP} cursor={CURSOR_SUAVE} />
          <Bar
            dataKey="a"
            name={serieA.nombre}
            stackId={apilado ? 'pila' : undefined}
            fill={colorA}
            maxBarSize={22}
            radius={apilado ? 0 : [6, 6, 0, 0]}
          />
          <Bar
            dataKey="b"
            name={serieB.nombre}
            stackId={apilado ? 'pila' : undefined}
            fill={colorB}
            maxBarSize={22}
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <Leyenda
        datos={[
          { nombre: serieA.nombre, valor: totalA, color: colorA },
          { nombre: serieB.nombre, valor: totalB, color: colorB },
        ]}
        total={totalA + totalB}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- Área */

interface GraficoAreaProps {
  datos: Array<{ nombre: string; valor: number }>
  color?: string
  alto?: number
  /** Formato del valor en tooltip y eje, p. ej. km */
  sufijo?: string
  nombreSerie?: string
}

/** Tendencia como área con degradado: más legible que una línea suelta */
export const GraficoArea = ({
  datos,
  color = PALETA.marca,
  alto = 240,
  sufijo = '',
  nombreSerie = 'Valor',
}: GraficoAreaProps) => {
  const idGradiente = useId()

  if (datos.length === 0) return <SinDatos alto={alto} />

  const compacto = (valor: number) =>
    valor >= 1000 ? `${Math.round(valor / 1000)}k` : String(valor)

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={datos} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.16} vertical={false} />
        <XAxis dataKey="nombre" {...EJE} minTickGap={18} />
        <YAxis {...EJE} width={46} domain={['auto', 'auto']} tickFormatter={compacto} />
        <Tooltip
          contentStyle={TOOLTIP}
          formatter={(valor: number) => [
            `${valor.toLocaleString('es-CL')}${sufijo}`,
            nombreSerie,
          ]}
        />
        <Area
          type="monotone"
          dataKey="valor"
          stroke={color}
          strokeWidth={2.2}
          fill={`url(#${idGradiente})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
