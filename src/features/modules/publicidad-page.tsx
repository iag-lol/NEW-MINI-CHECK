import { Badge } from '@/components/ui/badge'
import { ModuleLayout } from '@/components/layout/module-layout'
import { GraficoBarrasDobles, GraficoDona, PALETA } from '@/components/charts/graficos-modulo'
import dayjs from '@/lib/dayjs'
import type { Database } from '@/types/database'
import { Megaphone, CheckCircle2, XCircle, AlertTriangle, Tag } from 'lucide-react'

type PublicidadRow = Database['public']['Tables']['publicidad']['Row']
const lateralAreas = [
  { key: 'izquierda', label: 'Lateral izquierdo' },
  { key: 'derecha', label: 'Lateral derecho' },
  { key: 'luneta', label: 'Luneta' },
] as const
type LateralKey = (typeof lateralAreas)[number]['key']

export const PublicidadModulePage = () => {
  return (
    <ModuleLayout
      table="publicidad"
      title="Publicidad"
      description="Control de campañas publicitarias y hallazgos"
      icon={Megaphone}
      queryLimit={null}
      searchFields={['bus_ppu', 'terminal', 'nombre_publicidad']}
      tableScrollClassName="max-h-[75vh]"
      getStats={(data: PublicidadRow[]) => {
        const total = data.length
        const conPublicidad = data.filter(r => r.tiene).length
        const conDanio = data.filter(r => r.danio).length
        const conResiduos = data.filter(r => r.residuos).length
        const tasaInstalacion = total > 0 ? Math.round((conPublicidad / total) * 100) : 0

        return [
          {
            title: 'Total Revisiones',
            value: total,
            description: 'Buses revisados',
            icon: Megaphone,
            variant: 'default' as const,
          },
          {
            title: 'Con Publicidad',
            value: conPublicidad,
            description: `${tasaInstalacion}% del total`,
            icon: CheckCircle2,
            variant: 'success' as const,
          },
          {
            title: 'Con Daños',
            value: conDanio,
            description: 'Requieren reparación',
            icon: AlertTriangle,
            variant: conDanio > 0 ? 'warning' as const : 'success' as const,
          },
          {
            title: 'Con Residuos',
            value: conResiduos,
            description: 'Requieren limpieza',
            icon: XCircle,
            variant: conResiduos > 0 ? 'danger' as const : 'success' as const,
          },
        ]
      }}
      filters={[
        {
          key: 'tiene',
          label: 'Estado',
          type: 'select',
          options: [
            { label: 'Con publicidad', value: 'true' },
            { label: 'Sin publicidad', value: 'false' },
          ],
        },
        {
          key: 'danio',
          label: 'Daños',
          type: 'select',
          options: [
            { label: 'Con daños', value: 'true' },
            { label: 'Sin daños', value: 'false' },
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
            title: 'Instalación por lateral',
            component: (
              <GraficoBarrasDobles
                apilado
                datos={lateralAreas.map((area) => {
                  let con = 0
                  let sin = 0
                  rows.forEach((row) => {
                    const detalle = row.detalle_lados as Record<LateralKey, { tiene: boolean }> | null
                    if (detalle?.[area.key]?.tiene) con += 1
                    else sin += 1
                  })
                  return { nombre: area.label, a: con, b: sin }
                })}
                serieA={{ nombre: 'Con publicidad', color: PALETA.marca }}
                serieB={{ nombre: 'Sin publicidad', color: '#cbd5e1' }}
              />
            ),
          },
          {
            title: 'Hallazgos en campañas',
            component: (
              <GraficoDona
                etiquetaCentro="buses"
                datos={[
                  { nombre: 'Limpios', valor: rows.filter((row) => row.danio === false && row.residuos === false).length, color: PALETA.ok },
                  { nombre: 'Sólo daño', valor: rows.filter((row) => row.danio && !row.residuos).length, color: '#f97316' },
                  { nombre: 'Sólo residuos', valor: rows.filter((row) => !row.danio && row.residuos).length, color: PALETA.atencion },
                  { nombre: 'Daño + residuos', valor: rows.filter((row) => row.danio && row.residuos).length, color: PALETA.falla },
                  { nombre: 'Sin dato', valor: rows.filter((row) => row.danio == null && row.residuos == null).length, color: PALETA.neutro },
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
          render: (row: PublicidadRow) => (
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{row.bus_ppu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Estado general',
          className: 'min-w-[160px]',
          render: (row) => (
            <div className="space-y-1">
              <Badge variant={row.tiene ? 'success' : 'default'}>
                {row.tiene ? 'Con publicidad' : 'Sin publicidad'}
              </Badge>
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.terminal}</p>
            </div>
          ),
        },
        {
          label: 'Campaña',
          className: 'min-w-[200px]',
          render: (row) => (
            <div className="flex items-center gap-2">
              {row.nombre_publicidad ? (
                <>
                  <Tag className="h-3 w-3 text-brand-500" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {row.nombre_publicidad}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          ),
        },
        {
          label: 'Hallazgos',
          className: 'min-w-[220px]',
          render: (row) => (
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                {row.danio ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-semibold text-amber-600 dark:text-amber-400">Con daño</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Sin daño</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {row.residuos ? (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    <span className="font-semibold text-red-600 dark:text-red-400">Con residuos</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Limpio</span>
                  </>
                )}
              </div>
            </div>
          ),
        },
        {
          label: 'Detalle Lados',
          className: 'min-w-[320px]',
          render: (row) => {
            const detalle = (row.detalle_lados as Record<string, unknown> | null) ?? {}
            return (
              <div className="grid gap-3 md:grid-cols-2">
                {lateralAreas.map((area) => {
                  const lateral = (detalle?.[area.key] as {
                    tiene?: boolean
                    danio?: boolean | null
                    residuos?: boolean | null
                    observacion?: string | null
                  }) ?? {}
                  return (
                    <div
                      key={area.key}
                      className="rounded-xl border border-slate-100/70 p-3 dark:border-slate-800/80"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                        <span>{area.label}</span>
                        <Badge variant={lateral.tiene ? 'success' : 'outline'}>
                          {lateral.tiene ? 'Instalada' : 'Sin publicidad'}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <Badge
                          variant={
                            lateral.danio == null ? 'outline' : lateral.danio ? 'danger' : 'success'
                          }
                        >
                          {lateral.danio == null ? 'Sin dato' : lateral.danio ? 'Con daño' : 'Sin daño'}
                        </Badge>
                        <Badge
                          variant={
                            lateral.residuos == null ? 'outline' : lateral.residuos ? 'warning' : 'success'
                          }
                        >
                          {lateral.residuos == null ? 'Sin dato' : lateral.residuos ? 'Residuos' : 'Limpio'}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {lateral.observacion?.trim() ? lateral.observacion : 'Sin observaciones'}
                      </p>
                    </div>
                  )
                })}
              </div>
            )
          },
        },
        {
          label: 'Observación',
          className: 'min-w-[220px]',
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
