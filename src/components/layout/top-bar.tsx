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

        {/* Alertas en vivo: una tarjeta por cada colaborador revisando.
            Ocupan el espacio libre del header y se van sumando en grilla. */}
        {puedeVerAlertas && total > 0 && (
          <div className="hidden min-w-0 flex-1 md:block">
            <div className="flex max-h-[5.5rem] flex-wrap items-center justify-center gap-1.5 overflow-y-auto overscroll-contain py-0.5">
              <AnimatePresence initial={false}>
                {inspeccionesEnCurso.map((item) => (
                  <motion.div
                    key={`${item.rut}-${item.ppu}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -6 }}
                    transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                    title={`${item.nombre} · ${item.ppu}${
                      item.interno ? ` (${item.interno})` : ''
                    } · ${item.terminal} · hace ${tiempoTranscurrido(item.startedAt)}`}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 py-1.5 pl-2 pr-2.5 shadow-sm dark:border-amber-700/50 dark:bg-amber-950/40"
                  >
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
                      <Bus className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                      <span className="marker-live-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-[11px] font-bold text-amber-900 dark:text-amber-100">
                        {primerNombre(item.nombre)}
                      </p>
                      <p className="truncate text-[10px] text-amber-700/90 dark:text-amber-300/90">
                        <span className="font-bold">{item.ppu}</span> ·{' '}
                        {tiempoTranscurrido(item.startedAt)}
                      </p>
                    </div>
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
              className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 dark:border-amber-700/50 dark:bg-amber-950/40"
            >
              <span className="marker-live-dot inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <ClipboardList className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-200">
                {total}
              </span>
              <ChevronDown
                className={`h-3 w-3 shrink-0 text-amber-500 transition-transform ${
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
                  className="absolute right-0 top-full z-50 mt-2 w-[17rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
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
          <TrackingStatus {...tracking} />
          <ThemeToggle />
          <NotificationCenter />
        </div>
      </div>
    </header>
  )
}
