import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bus, ChevronDown, ClipboardList } from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { SIDEBAR_ITEMS } from '@/constants/navigation'
import { useAuthStore } from '@/store/auth-store'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationCenter } from '@/components/notification-center'
import { useLocation } from 'react-router-dom'
import { TrackingStatus } from '@/components/layout/tracking-status'
import { useTracking } from '@/hooks/use-tracking'
import { useInspeccionesEnCurso } from '@/hooks/use-inspeccion-presence'

const tiempoTranscurrido = (startedAt: string) => {
  const seconds = dayjs().diff(dayjs(startedAt), 'second')
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

const primerNombre = (nombre: string) =>
  nombre.split(' ').filter(Boolean).slice(0, 2).join(' ')

export const TopBar = () => {
  const { user } = useAuthStore()
  const location = useLocation()
  const tracking = useTracking()
  const inspeccionesEnCurso = useInspeccionesEnCurso()
  const [listaAbierta, setListaAbierta] = useState(false)
  const alertRef = useRef<HTMLDivElement | null>(null)
  const currentItem =
    SIDEBAR_ITEMS.find((item) => location.pathname.startsWith(item.path)) ?? SIDEBAR_ITEMS[0]
  const CurrentIcon = currentItem.icon

  // Tick para refrescar el tiempo transcurrido de cada alerta
  const [, setTick] = useState(0)
  useEffect(() => {
    if (inspeccionesEnCurso.length === 0) return
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 10_000)
    return () => window.clearInterval(interval)
  }, [inspeccionesEnCurso.length])

  // Cerrar la lista al hacer clic fuera
  useEffect(() => {
    if (!listaAbierta) return
    const handler = (event: MouseEvent) => {
      if (alertRef.current && !alertRef.current.contains(event.target as Node)) {
        setListaAbierta(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [listaAbierta])

  // Las alertas de inspección en curso se muestran a supervisores y jefes
  const puedeVerAlertas = user && user.cargo !== 'INSPECTOR'
  const total = inspeccionesEnCurso.length

  return (
    <header className="sticky top-0 z-20 w-full px-2 pb-1 pt-1.5 sm:px-5 sm:pt-3 md:px-6 lg:px-8">
      <div className="glass-panel-strong flex items-center justify-between gap-1.5 rounded-[var(--app-radius-lg)] px-2.5 py-2 sm:min-h-[4.4rem] sm:gap-4 sm:px-4 sm:py-2.5">
        <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] border border-white/60 bg-white/55 text-brand-600 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-brand-300 sm:h-10 sm:w-10 sm:rounded-[14px] sm:shadow-sm">
            <CurrentIcon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          </span>
          <div className="min-w-0">
            <time className="hidden text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:block">
              {dayjs().format('dddd D MMMM · HH:mm')} hrs
            </time>
            <h2 className="truncate text-[14px] font-extrabold leading-tight tracking-[-0.035em] text-slate-950 dark:text-white sm:text-xl">
              {currentItem.label}
            </h2>
            {user && (
              <p className="truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400 sm:text-xs">
                {user.nombre.split(' ')[0]} · {user.cargo}
                <span className="hidden lg:inline"> · Terminal {user.terminal}</span>
              </p>
            )}
          </div>
        </div>

        {/* Alertas en vivo: una tarjeta por cada colaborador revisando.
            Ocupan el espacio libre del header y se van sumando en grilla. */}
        {puedeVerAlertas && total > 0 && (
          <div className="hidden min-w-0 flex-1 md:block">
            <div className="flex max-h-[6.9rem] flex-wrap items-center justify-center gap-1.5 overflow-y-auto overscroll-contain py-0.5">
              <AnimatePresence initial={false}>
                {inspeccionesEnCurso.map((item) => (
                  <motion.div
                    key={`${item.rut}-${item.ppu}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -6 }}
                    transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                    title={`${item.nombre} se encuentra revisando el bus ${item.ppu}${
                      item.interno ? ` (N° ${item.interno})` : ''
                    } en Terminal ${item.terminal} · hace ${tiempoTranscurrido(item.startedAt)}`}
                    className="relative flex h-[3.15rem] w-[14rem] shrink-0 items-center gap-2 overflow-hidden rounded-2xl border border-amber-200/70 bg-amber-50/65 px-2 shadow-sm backdrop-blur-xl dark:border-amber-500/20 dark:bg-amber-500/10"
                  >
                    <span className="live-halo relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 shadow-sm">
                      <Bus className="h-4 w-4 text-white" />
                      <span className="marker-live-dot absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />
                    </span>

                    <p className="min-w-0 flex-1 text-[10px] leading-[1.22] text-slate-600 dark:text-slate-300">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {item.nombre}
                      </span>{' '}
                      se encuentra revisando el bus{' '}
                      <span className="font-black text-amber-700 dark:text-amber-300">
                        {item.ppu}
                      </span>{' '}
                      en Terminal {item.terminal}{' '}
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        · {tiempoTranscurrido(item.startedAt)}
                      </span>
                    </p>

                    {/* Barra de actividad en curso */}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-amber-100 dark:bg-amber-900/40">
                      <span className="live-sweep-bar block h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* En móvil no hay espacio para la grilla: contador desplegable */}
        {puedeVerAlertas && total > 0 && (
          <div ref={alertRef} className="relative shrink-0 md:hidden">
            <button
              type="button"
              onClick={() => setListaAbierta((prev) => !prev)}
              aria-label={`${total} inspecciones en curso`}
              aria-expanded={listaAbierta}
              className="press-feedback flex items-center gap-1 rounded-[11px] border border-amber-300/60 bg-amber-50/70 px-1.5 py-1 backdrop-blur-xl dark:border-amber-500/20 dark:bg-amber-500/10"
            >
              <span className="marker-live-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <ClipboardList className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-[10.5px] font-black tabular-nums text-amber-800 dark:text-amber-200">
                {total}
              </span>
              <ChevronDown
                className={`h-2.5 w-2.5 shrink-0 text-amber-500 transition-transform ${
                  listaAbierta ? 'rotate-180' : ''
                }`}
              />
            </button>

            <AnimatePresence>
              {listaAbierta && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                  className="glass-panel-strong absolute right-0 top-full z-50 mt-2 w-[min(17rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-amber-50/70 px-3 py-2 dark:border-slate-800 dark:bg-amber-950/30">
                    <span className="marker-live-dot inline-block h-2 w-2 rounded-full bg-amber-500" />
                    <p className="text-[11px] font-black uppercase tracking-wide text-amber-800 dark:text-amber-200">
                      Revisando ahora ({total})
                    </p>
                  </div>
                  <div className="max-h-72 overflow-y-auto overscroll-contain">
                    {inspeccionesEnCurso.map((item) => (
                      <div
                        key={`${item.rut}-${item.ppu}`}
                        className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-slate-800/60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/50">
                          <Bus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                            {primerNombre(item.nombre)}
                          </p>
                          <p className="truncate text-[10px] text-slate-500">
                            <span className="font-bold">{item.ppu}</span> · {item.terminal}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          {tiempoTranscurrido(item.startedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Con inspecciones en curso, las tarjetas tienen prioridad sobre
              el chip de GPS (ese dato también se ve dentro del formulario) */}
          <div className={total > 0 ? 'hidden 2xl:block' : ''}>
            <TrackingStatus {...tracking} />
          </div>
          <ThemeToggle />
          <NotificationCenter />
        </div>
      </div>
    </header>
  )
}
