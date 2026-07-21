import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ClipboardList } from 'lucide-react'
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
  return `${Math.floor(seconds / 60)} min`
}

export const TopBar = () => {
  const { user } = useAuthStore()
  const location = useLocation()
  const tracking = useTracking()
  const inspeccionesEnCurso = useInspeccionesEnCurso()
  const currentItem =
    SIDEBAR_ITEMS.find((item) => location.pathname.startsWith(item.path)) ?? SIDEBAR_ITEMS[0]

  // Tick para refrescar el tiempo transcurrido de cada alerta
  const [, setTick] = useState(0)
  useEffect(() => {
    if (inspeccionesEnCurso.length === 0) return
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 10_000)
    return () => window.clearInterval(interval)
  }, [inspeccionesEnCurso.length])

  // Las alertas de inspección en curso se muestran a supervisores y jefes
  const puedeVerAlertas = user && user.cargo !== 'INSPECTOR'

  return (
    <header className="sticky top-0 z-20 w-full border-b border-transparent px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-slate-950/70">
      <div className="flex items-center justify-between gap-4">
        <div className="shrink-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {dayjs().format('dddd D MMMM · HH:mm')} hrs
          </p>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            {currentItem.label}
          </h2>
          {user && (
            <p className="text-sm text-slate-500">
              Bienvenido, {user.nombre.split(' ')[0]} · {user.cargo} · Terminal {user.terminal}
            </p>
          )}
        </div>

        {/* Alertas en vivo: inspecciones en curso */}
        {puedeVerAlertas && (
          <div className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
            <div className="flex max-w-full items-center gap-2 overflow-x-auto py-1">
              <AnimatePresence>
                {inspeccionesEnCurso.map((item) => (
                  <motion.div
                    key={`${item.rut}-${item.ppu}`}
                    initial={{ opacity: 0, y: -12, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.9 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                    className="flex shrink-0 items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-1.5 shadow-sm dark:border-amber-700/50 dark:bg-amber-950/40"
                  >
                    <span className="marker-live-dot inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <ClipboardList className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="whitespace-nowrap text-xs text-amber-800 dark:text-amber-200">
                      <span className="font-bold">
                        {item.nombre.split(' ').filter(Boolean).slice(0, 2).join(' ')}
                      </span>{' '}
                      revisando{' '}
                      <span className="font-bold">
                        {item.ppu}
                        {item.interno ? ` (${item.interno})` : ''}
                      </span>
                      <span className="ml-1 opacity-70">
                        · {item.terminal} · hace {tiempoTranscurrido(item.startedAt)}
                      </span>
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <TrackingStatus {...tracking} />
          <ThemeToggle />
          <NotificationCenter />
        </div>
      </div>
    </header>
  )
}
