import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import { GraficoBarras, GraficoDona, PALETA } from '@/components/charts/graficos-modulo'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { BadgeCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

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
      disableWeekFilter={false}
      queryLimit={null}
      getStats={(data: ExtintoresRow[]) => {
        const total = data.length
        const conExtintor = data.filter(r => r.tiene).length
        const sinExtintor = data.filter(r => !r.tiene).length
        const problemasExistentes = data.filter(r =>
          !r.tiene ||
          r.certificacion === 'VENCIDA' ||
          r.presion !== 'OPTIMO' ||
          r.cilindro !== 'OK' ||
          r.sonda !== 'OK' ||
          r.manometro !== 'OK' ||
          r.porta !== 'TIENE'
        ).length

        const tasaConExtintor = total > 0 ? Math.round((conExtintor / total) * 100) : 0

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Extintores revisados',
            icon: BadgeCheck,
            variant: 'default' as const,
          },
          {
            title: 'Con Extintor',
            value: conExtintor,
            description: `${tasaConExtintor}% del total`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Sin Extintor',
            value: sinExtintor,
            description: 'Requieren instalación',
            icon: XCircle,
            variant: sinExtintor > 0 ? 'danger' as const : 'success' as const,
          },
          {
            title: 'Problemas Detectados',
            value: problemasExistentes,
            description: `${total > 0 ? Math.round((problemasExistentes / total) * 100) : 0}% del total`,
            icon: AlertTriangle,
            variant: problemasExistentes > 5 ? 'danger' as const : problemasExistentes > 0 ? 'warning' as const : 'success' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'tiene',
          label: 'Estado de Instalación',
          type: 'select',
          options: [
            { label: 'Instalado', value: 'true' },
            { label: 'Sin extintor', value: 'false' },
          ],
        },
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
            { label: 'Los Agricultores', value: 'Los Agricultores' },
          ],
        },
      ]}
      getCharts={(rows) => {
        return [
          {
            title: 'Estado de instalación',
            component: (
              <GraficoDona
                etiquetaCentro="revisiones"
                datos={[
                  { nombre: 'Con extintor', valor: rows.filter((row) => row.tiene).length, color: PALETA.ok },
                  { nombre: 'Sin extintor', valor: rows.filter((row) => !row.tiene).length, color: PALETA.falla },
                ]}
              />
            ),
          },
          {
            title: 'Certificaciones',
            component: (
              <GraficoDona
                etiquetaCentro="extintores"
                datos={[
                  { nombre: 'Vigente', valor: rows.filter((row) => row.certificacion === 'VIGENTE').length, color: PALETA.ok },
                  { nombre: 'Vencida', valor: rows.filter((row) => row.certificacion === 'VENCIDA').length, color: PALETA.falla },
                  { nombre: 'Sin dato', valor: rows.filter((row) => !row.certificacion).length, color: PALETA.neutro },
                ]}
              />
            ),
          },
          {
            title: 'Carga del manómetro',
            component: (
              <GraficoBarras
                datos={[
                  { nombre: 'Óptimo', valor: rows.filter((row) => row.presion === 'OPTIMO').length, color: PALETA.ok },
                  { nombre: 'Baja carga', valor: rows.filter((row) => row.presion === 'BAJA_CARGA').length, color: PALETA.atencion },
                  { nombre: 'Sobrecarga', valor: rows.filter((row) => row.presion === 'SOBRECARGA').length, color: PALETA.falla },
                  { nombre: 'Sin dato', valor: rows.filter((row) => !row.presion).length, color: PALETA.neutro },
                ]}
              />
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
                  className={`text-xs ${estaVencido ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
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
