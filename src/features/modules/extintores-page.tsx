import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { BadgeCheck, CheckCircle2, AlertTriangle, XCircle, Gauge as GaugeIcon } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type ExtintoresRow = Database['public']['Tables']['extintores']['Row']

const extinguisherLabelMap: Record<string, string> = {
  OPTIMO: 'Óptimo',
  BAJA_CARGA: 'Baja carga',
  SOBRECARGA: 'Sobrecarga',
  SIN_LECTURA: 'Sin lectura',
  FUERA_DE_RANGO: 'Fuera de rango',
  VIGENTE: 'Vigente',
  VENCIDA: 'Vencida',
  ABOLLADO: 'Abollado',
  OXIDADO: 'Oxidado',
  TIENE: 'Instalado',
  NO_TIENE: 'Sin porta',
  DANADO: 'Porta dañado',
}

const formatEnumValue = (value?: string | null) => {
  if (!value) return 'Sin dato'
  return extinguisherLabelMap[value] ?? value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const getVariant = (
  value: string | null | undefined,
  { ok = [], warning = [] }: { ok?: string[]; warning?: string[] } = {}
): 'success' | 'warning' | 'danger' | 'outline' => {
  if (!value) return 'outline'
  if (ok.includes(value)) return 'success'
  if (warning.includes(value)) return 'warning'
  return 'danger'
}

export const ExtintoresModulePage = () => {
  return (
    <ModuleLayout
      table="extintores"
      title="Extintores"
      description="Control de vencimientos, certificaciones y estado físico"
      icon={BadgeCheck}
      searchFields={['bus_ppu', 'terminal']}
      getStats={(data: ExtintoresRow[]) => {
        const total = data.length
        const vigentes = data.filter(r => r.certificacion === 'VIGENTE').length
        const vencidos = data.filter(r => r.certificacion === 'VENCIDA').length
        const presionOptima = data.filter(r => r.presion === 'OPTIMO').length
        const tasaVigencia = total > 0 ? Math.round((vigentes / total) * 100) : 0

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Extintores revisados',
            icon: BadgeCheck,
            variant: 'default' as const,
          },
          {
            title: 'Vigentes',
            value: vigentes,
            description: `${tasaVigencia}% del total`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Vencidos',
            value: vencidos,
            description: 'Requieren renovación',
            icon: AlertTriangle,
            variant: vencidos > 0 ? 'danger' as const : 'success' as const,
          },
          {
            title: 'Presión Óptima',
            value: presionOptima,
            description: `${total > 0 ? Math.round((presionOptima / total) * 100) : 0}% del total`,
            icon: GaugeIcon,
            variant: presionOptima === total ? 'success' as const : 'warning' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'certificacion',
          label: 'Certificación',
          type: 'select',
          options: [
            { label: 'Vigente', value: 'VIGENTE' },
            { label: 'Vencida', value: 'VENCIDA' },
          ],
        },
        {
          key: 'presion',
          label: 'Presión',
          type: 'select',
          options: [
            { label: 'Óptimo', value: 'OPTIMO' },
            { label: 'Baja Carga', value: 'BAJA_CARGA' },
            { label: 'Sobrecarga', value: 'SOBRECARGA' },
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
        const certificacionData = [
          { estado: 'Vigente', cantidad: rows.filter((r) => r.certificacion === 'VIGENTE').length },
          { estado: 'Vencida', cantidad: rows.filter((r) => r.certificacion === 'VENCIDA').length },
          { estado: 'Sin dato', cantidad: rows.filter((r) => !r.certificacion).length },
        ]
        const presionDataRaw = [
          { name: 'Óptimo', value: rows.filter((r) => r.presion === 'OPTIMO').length, color: '#10b981' },
          { name: 'Baja carga', value: rows.filter((r) => r.presion === 'BAJA_CARGA').length, color: '#f59e0b' },
          { name: 'Sobrecarga', value: rows.filter((r) => r.presion === 'SOBRECARGA').length, color: '#ef4444' },
          { name: 'Sin dato', value: rows.filter((r) => !r.presion).length, color: '#cbd5f5' },
        ]
        const presionData = presionDataRaw.filter((item) => item.value > 0)
        if (presionData.length === 0) presionData.push({ name: 'Sin registros', value: 1, color: '#e2e8f0' })
        return [
          {
            title: 'Estado de certificaciones',
            component: (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={certificacionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Bar dataKey="cantidad" fill="#0ea5e9" name="Cantidad" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ),
          },
          {
            title: 'Distribución de carga en manómetro',
            component: (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={presionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) => `${entry.name}: ${entry.value}`}
                    outerRadius={90}
                    dataKey="value"
                  >
                    {presionData.map((entry, index) => (
                      <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} />
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
          className: 'min-w-[160px]',
          render: (row: ExtintoresRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Instalación',
          className: 'min-w-[150px]',
          render: (row) => (
            <div className="space-y-1">
              <Badge variant={row.tiene ? 'success' : 'danger'}>
                {row.tiene ? 'Instalado' : 'Sin extintor'}
              </Badge>
              <p className="text-xs text-slate-500 dark:text-slate-400">Terminal {row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Certificación y vencimiento',
          className: 'min-w-[200px]',
          render: (row) => {
            const tieneFecha = row.vencimiento_mes != null && row.vencimiento_anio != null
            const fechaVencimiento = tieneFecha
              ? new Date(row.vencimiento_anio!, row.vencimiento_mes! - 1)
              : null
            const estaVencido = fechaVencimiento ? fechaVencimiento < new Date() : false
            return (
              <div className="space-y-1">
                <Badge variant={getVariant(row.certificacion, { ok: ['VIGENTE'] })}>
                  {formatEnumValue(row.certificacion)}
                </Badge>
                <p
                  className={`text-xs ${
                    estaVencido ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tieneFecha ? `Vence ${row.vencimiento_mes}/${row.vencimiento_anio}` : 'Sin fecha registrada'}
                </p>
              </div>
            )
          },
        },
        {
          label: 'Diagnóstico técnico',
          className: 'min-w-[260px]',
          render: (row) => {
            const items = [
              { label: 'Sonda', value: row.sonda, ok: ['OK'] },
              { label: 'Manómetro', value: row.manometro, ok: ['OK'] },
              { label: 'Carga', value: row.presion, ok: ['OPTIMO'], warning: ['BAJA_CARGA'] },
            ]
            return (
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <Badge
                    key={item.label}
                    variant={getVariant(item.value, { ok: item.ok, warning: item.warning ?? [] })}
                  >
                    {item.label}: {formatEnumValue(item.value)}
                  </Badge>
                ))}
              </div>
            )
          },
        },
        {
          label: 'Estado físico',
          className: 'min-w-[220px]',
          render: (row) => (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                {row.cilindro === 'OK' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Cilindro:
                </span>
                <span className="text-slate-600 dark:text-slate-400">{formatEnumValue(row.cilindro)}</span>
              </div>
              <div className="flex items-center gap-2">
                {row.porta === 'TIENE' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="font-semibold text-slate-700 dark:text-slate-200">Porta:</span>
                <span className="text-slate-600 dark:text-slate-400">{formatEnumValue(row.porta)}</span>
              </div>
            </div>
          ),
        },
        {
          label: 'Observación',
          className: 'min-w-[220px]',
          render: (row) => (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {row.observacion || 'Sin observaciones'}
            </span>
          ),
        },
        {
          label: 'Fecha',
          className: 'min-w-[110px]',
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
