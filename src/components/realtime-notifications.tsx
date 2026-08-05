import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Bus, Info, Ticket, X, CheckCircle2 } from 'lucide-react'
import { useNotificationStore, type SystemNotification } from '@/store/notification-store'
import { cn } from '@/lib/utils'

const DURACION_MS = 7000

const estilos = {
  success: {
    icon: CheckCircle2,
    ring: 'border-emerald-300/60 dark:border-emerald-500/25',
    chip: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
    barra: 'bg-emerald-500',
  },
  warning: {
    icon: AlertTriangle,
    ring: 'border-amber-300/60 dark:border-amber-500/25',
    chip: 'bg-gradient-to-br from-amber-400 to-amber-600',
    barra: 'bg-amber-500',
  },
  error: {
    icon: AlertTriangle,
    ring: 'border-red-300/60 dark:border-red-500/25',
    chip: 'bg-gradient-to-br from-red-400 to-red-600',
    barra: 'bg-red-500',
  },
  info: {
    icon: Info,
    ring: 'border-white/70 dark:border-white/[0.09]',
    chip: 'bg-gradient-to-br from-brand-500 to-violet-600',
    barra: 'bg-brand-500',
  },
} as const

const iconoPorTag = { revision: Bus, ticket: Ticket } as const

/**
 * Avisos flotantes dentro de la app.
 *
 * Se alimenta del store de notificaciones en vez de abrir su propio canal
 * realtime: así el toast, el historial y la notificación del sistema operativo
 * cuentan siempre la misma historia.
 */
export function RealtimeNotifications() {
  const navigate = useNavigate()
  const notifications = useNotificationStore((state) => state.notifications)
  const markAsRead = useNotificationStore((state) => state.markAsRead)
  const [visibles, setVisibles] = useState<SystemNotification[]>([])
  const vistasRef = useRef<Set<string>>(new Set())
  const iniciadoRef = useRef(false)

  useEffect(() => {
    // Al montar, marcar el historial existente como ya visto: sólo interesan
    // los eventos que llegan mientras la sesión está abierta.
    if (!iniciadoRef.current) {
      notifications.forEach((n) => vistasRef.current.add(n.id))
      iniciadoRef.current = true
      return
    }

    const nuevas = notifications.filter((n) => !vistasRef.current.has(n.id))
    if (nuevas.length === 0) return

    nuevas.forEach((n) => vistasRef.current.add(n.id))
    setVisibles((prev) => [...nuevas, ...prev].slice(0, 4))
  }, [notifications])

  const descartar = (id: string) =>
    setVisibles((prev) => prev.filter((n) => n.id !== id))

  useEffect(() => {
    if (visibles.length === 0) return
    const temporizadores = visibles.map((n) =>
      window.setTimeout(() => descartar(n.id), DURACION_MS)
    )
    return () => temporizadores.forEach(window.clearTimeout)
  }, [visibles])

  return (
    <div
      aria-live="polite"
      className="floating-top pointer-events-none fixed inset-x-2.5 z-50 flex flex-col gap-1.5 sm:inset-x-auto sm:right-4 sm:w-[21rem]"
    >
      <AnimatePresence initial={false}>
        {visibles.map((notif) => {
          const estilo = estilos[notif.type ?? 'info']
          const Icon =
            iconoPorTag[notif.tag as keyof typeof iconoPorTag] ?? estilo.icon
          return (
            <motion.div
              key={notif.id}
              layout
              initial={{ opacity: 0, y: -14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.94 }}
              transition={{ type: 'spring', damping: 26, stiffness: 340 }}
              className="pointer-events-auto"
              role="status"
            >
              <div
                className={cn(
                  'glass-panel-strong relative overflow-hidden rounded-[18px] border pr-7',
                  estilo.ring
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    markAsRead(notif.id)
                    if (notif.url) navigate(notif.url)
                    descartar(notif.id)
                  }}
                  className="flex w-full items-center gap-2.5 p-2.5 text-left transition active:scale-[0.985]"
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] text-white shadow-sm',
                      estilo.chip
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold leading-tight text-slate-900 dark:text-white">
                      {notif.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-600 line-clamp-2 dark:text-slate-400">
                      {notif.body}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => descartar(notif.id)}
                  aria-label="Cerrar aviso"
                  className="absolute right-1 top-1 rounded-full p-1 text-slate-400 transition hover:bg-white/60 hover:text-slate-700 dark:hover:bg-white/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                {/* Cuenta atrás del auto-cierre */}
                <motion.span
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: DURACION_MS / 1000, ease: 'linear' }}
                  style={{ transformOrigin: 'left' }}
                  className={cn(
                    'absolute inset-x-0 bottom-0 h-[2px] opacity-70',
                    estilo.barra
                  )}
                />
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
