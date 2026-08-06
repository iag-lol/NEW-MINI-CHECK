import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Info, Loader2 } from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Card, CardEyebrow, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MODULOS, type ModuloClave } from '@/constants/modulos'
import { useModulosConfig, useModulosVigentes } from '@/hooks/use-modulos-config'
import { describirProgramacion } from '@/lib/programacion'

interface ModulosActivosProps {
  /** Ventana de la semana seleccionada en el dashboard */
  desde: string
  hasta: string
  /** Revisiones de esa ventana, para saber sobre cuántas se mide el avance */
  totalRevisiones: number
}

/**
 * Estado de la revisión activa.
 *
 * El dashboard contaba siempre los mismos módulos, estuvieran o no en el
 * formulario. Si el supervisor apaga WiFi, seguir mostrando "0 % de WiFi
 * revisado" es ruido: no es que nadie lo revise, es que ya no se pide. Aquí
 * sólo aparece lo que está vigente hoy, con su nombre y para qué sirve.
 */
export const ModulosActivos = ({
  desde,
  hasta,
  totalRevisiones,
}: ModulosActivosProps) => {
  const { clavesActivas, disponible } = useModulosVigentes()
  const { porClave } = useModulosConfig()

  const modulosMedibles = MODULOS.filter(
    (modulo) => modulo.tabla !== null && clavesActivas.has(modulo.clave)
  )

  const { data: conteos, isLoading } = useQuery({
    queryKey: ['modulos-avance', desde, hasta, [...clavesActivas].sort().join(',')],
    enabled: modulosMedibles.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const resultado: Partial<Record<ModuloClave, number>> = {}

      // Un `count` por módulo: son consultas de cabecera, sin traer filas.
      await Promise.all(
        modulosMedibles.map(async (modulo) => {
          const { count, error } = await supabase
            .from(modulo.tabla as 'tags')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', desde)
            .lte('created_at', hasta)

          if (error) {
            console.warn(`No se pudo contar ${modulo.tabla}`, error.message)
            resultado[modulo.clave] = 0
            return
          }
          resultado[modulo.clave] = count ?? 0
        })
      )

      return resultado
    },
  })

  if (modulosMedibles.length === 0) {
    return (
      <Card className="space-y-1.5">
        <CardEyebrow>Revisión activa</CardEyebrow>
        <CardTitle>No hay módulos activos</CardTitle>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          Todos los módulos están apagados o fuera de su programación para hoy.
          Actívalos desde Configuración → Qué se revisa y cuándo.
        </p>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardEyebrow>Revisión activa</CardEyebrow>
          <CardTitle>Qué se está revisando hoy</CardTitle>
          <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
            Avance de cada módulo vigente sobre las {totalRevisiones} revisiones de la
            semana seleccionada.
          </p>
        </div>
        <Badge variant="default" className="shrink-0">
          {modulosMedibles.length} módulos
        </Badge>
      </div>

      {!disponible && (
        <p className="flex items-start gap-1.5 rounded-[var(--app-radius-sm)] bg-amber-500/10 p-2 text-[10.5px] leading-snug text-amber-700 dark:text-amber-300">
          <Info className="mt-px h-3 w-3 shrink-0" />
          Sin la tabla de configuración se muestran todos los módulos. Ejecuta{' '}
          <span className="font-mono">sql-scripts/modulos-configurables.sql</span>.
        </p>
      )}

      {isLoading ? (
        <div className="flex min-h-20 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
        </div>
      ) : (
        /* Rejilla en pantallas anchas: nueve módulos apilados a una columna
           eran una torre de scroll; en dos o tres columnas se leen de una vez */
        <div className="grid gap-1.5 md:grid-cols-2 2xl:grid-cols-3">
          {modulosMedibles.map((modulo) => {
            const hechas = conteos?.[modulo.clave] ?? 0
            const pct =
              totalRevisiones > 0
                ? Math.min(100, Math.round((hechas / totalRevisiones) * 100))
                : 0
            const Icono = modulo.icono
            const programacion = porClave.get(modulo.clave)

            return (
              <div
                key={modulo.clave}
                className="rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.035]"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br text-white shadow-sm',
                      modulo.acento
                    )}
                  >
                    <Icono className="h-3.5 w-3.5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[12.5px] font-extrabold text-slate-900 dark:text-white">
                        {modulo.nombre}
                      </p>
                      <p className="shrink-0 text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                        {hechas}
                        <span className="font-normal text-slate-400">
                          /{totalRevisiones}
                        </span>
                      </p>
                    </div>

                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-slate-500 dark:text-slate-400">
                      {modulo.funcion}
                    </p>

                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800/70">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-500',
                          pct >= 90
                            ? 'bg-emerald-500'
                            : pct >= 60
                              ? 'bg-brand-500'
                              : 'bg-amber-500'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {programacion && programacion.tipo === 'programado' && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-brand-600 dark:text-brand-400">
                        <CalendarClock className="h-2.5 w-2.5 shrink-0" />
                        {describirProgramacion(programacion)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[10px] leading-snug text-slate-400">
        Actualizado al {dayjs().format('DD MMM HH:mm')} hrs. Los módulos apagados no
        aparecen aquí ni se piden en el formulario.
      </p>
    </Card>
  )
}
