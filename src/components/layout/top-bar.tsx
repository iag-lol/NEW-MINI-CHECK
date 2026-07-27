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
import { useTracking } from '@/context/tracking-context'
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
  const primera = inspeccionesEnCurso[0]

  return (
    <header className="sticky top-0 z-20 w-full border-b border-transparent px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-slate-950/70 sm:px-4 sm:py-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="min-w-0 shrink">
          <p className="hidden text-sm font-semibold uppercase tracking-wide text-slate-400 sm:block">
            {dayjs().format('dddd D MMMM · HH:mm')} hrs
          </p>
          <h2 className="truncate text-lg font-black text-slate-900 dark:text-white sm:text-2xl">
            {currentItem.label}
          </h2>
          {user && (
            <p className="truncate text-xs text-slate-500 sm:text-sm">
              Bienvenido, {user.nombre.split(' ')[0]} · {user.cargo}
              <span className="hidden sm:inline"> · Terminal {user.terminal}</span>
            </p>
          )}
        </div>

        {/* Alertas en vivo: TODAS las inspecciones en curso */}
        {puedeVerAlertas && total > 0 && (
          <div ref={alertRef} className="relative shrink-0">
            <motion.button
              type="button"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setListaAbierta((prev) => !prev)}
              className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm transition hover:border-amber-300 hover:shadow dark:border-amber-700/50 dark:bg-amber-950/40"
            >
              <span className="marker-live-dot inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <ClipboardList className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="whitespace-nowrap text-xs font-bold text-amber-800 dark:text-amber-200">
                {total === 1 ? (
                  <>
                    <span className="hidden lg:inline">
                      {primerNombre(primera.nombre)} revisando {primera.ppu}
                    </span>
                    <span className="lg:hidden">1 revisando</span>
                  </>
                ) : (
                  <>{total} revisando ahora</>
                )}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-amber-500 transition-transform ${
                  listaAbierta ? 'rotate-180' : ''
                }`}
              />
            </motion.button>

            {/* Lista desplegable con TODOS los colaboradores trabajando */}
            <AnimatePresence>
              {listaAbierta && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                  className="absolute right-0 top-full z-50 mt-2 w-[19rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:w-80"
                >
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-amber-50/70 px-4 py-2.5 dark:border-slate-800 dark:bg-amber-950/30">
                    <span className="marker-live-dot inline-block h-2 w-2 rounded-full bg-amber-500" />
                    <p className="text-xs font-black uppercase tracking-wide text-amber-800 dark:text-amber-200">
                      Inspecciones en curso ({total})
                    </p>
                  </div>
                  <div className="max-h-80 overflow-y-auto overscroll-contain">
                    {inspeccionesEnCurso.map((item) => (
                      <div
                        key={`${item.rut}-${item.ppu}`}
                        className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800/60"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50">
                          <Bus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                            {primerNombre(item.nombre)}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">
                            Revisando{' '}
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              {item.ppu}
                              {item.interno ? ` (${item.interno})` : ''}
                            </span>{' '}
                            · {item.terminal}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
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
          <TrackingStatus {...tracking} />
          <ThemeToggle />
          <NotificationCenter />
        </div>
      </div>
    </header>
  )
}
