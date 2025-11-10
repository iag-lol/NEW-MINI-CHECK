import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { BadgeCheck, CheckCircle2, AlertTriangle, XCircle, Gauge as GaugeIcon } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type ExtintoresRow = Database['public']['Tables']['extintores']['Row']

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
      charts={[
        {
          title: 'Estado de Certificaciones',
          component: (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="estado" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="cantidad" fill="#6366f1" name="Cantidad" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ),
        },
        {
          title: 'Distribución de Presión',
          component: (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={[]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.name} ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ),
        },
      ]}
      columns={[
        {
          label: 'Bus',
          render: (row: ExtintoresRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
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
          label: 'Certificación',
          render: (row) => (
            <Badge variant={row.certificacion === 'VIGENTE' ? 'success' : 'danger'}>
              {row.certificacion ?? '—'}
            </Badge>
          ),
        },
        {
          label: 'Vencimiento',
          render: (row) => {
            if (!row.vencimiento_mes || !row.vencimiento_anio) return <span className="text-slate-400">—</span>
            const fechaVencimiento = new Date(row.vencimiento_anio, row.vencimiento_mes - 1)
            const hoy = new Date()
            const estaVencido = fechaVencimiento < hoy
            return (
              <span className={`font-semibold ${estaVencido ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                {row.vencimiento_mes}/{row.vencimiento_anio}
              </span>
            )
          },
        },
        {
          label: 'Presión',
          render: (row) => (
            <Badge
              variant={
                row.presion === 'OPTIMO' ? 'success' :
                row.presion === 'BAJA_CARGA' ? 'warning' :
                row.presion === 'SOBRECARGA' ? 'danger' : 'default'
              }
            >
              {row.presion ?? '—'}
            </Badge>
          ),
        },
        {
          label: 'Estado Físico',
          render: (row) => (
            <div className="space-y-1">
              <div className="flex gap-2 text-xs">
                {row.cilindro === 'OK' ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Cilindro
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Cilindro
                  </span>
                )}
                {row.porta === 'TIENE' ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Porta
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Porta
                  </span>
                )}
              </div>
            </div>
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
