import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { AnimatePresence, motion } from 'framer-motion'
import type { Tables } from '@/types/database'

type Revision = Tables<'revisiones'>

interface NotificationData {
  id: string
  inspector: string
  bus: string
  terminal: string
  estadoBus: 'OPERATIVO' | 'EN_PANNE'
  timestamp: Date
}

export function RealtimeNotifications() {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<NotificationData[]>([])

  useEffect(() => {
    // Solo supervisores y jefes de terminal reciben notificaciones
    if (!user || (user.cargo !== 'SUPERVISOR' && user.cargo !== 'JEFE DE TERMINAL')) return

    // Suscribirse a cambios en la tabla revisiones
    const channel = supabase
      .channel('revision-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'revisiones',
        },
        (payload) => {
          const nuevaRevision = payload.new as Revision

          // Crear notificación
          const notif: NotificationData = {
            id: nuevaRevision.id,
            inspector: nuevaRevision.inspector_nombre,
            bus: `${nuevaRevision.bus_ppu} (${nuevaRevision.bus_interno})`,
            terminal: nuevaRevision.terminal_reportado,
            estadoBus: nuevaRevision.estado_bus,
            timestamp: new Date(nuevaRevision.created_at),
          }

          setNotifications((prev) => [notif, ...prev])

          // Auto-remover después de 10 segundos
          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
          }, 10000)
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [user])

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  if (!user || (user.cargo !== 'SUPERVISOR' && user.cargo !== 'JEFE DE TERMINAL')) return null

  return (
    <div aria-live="polite" className="pointer-events-none fixed left-3 right-3 top-24 z-50 flex flex-col gap-3 sm:left-auto sm:right-5 sm:w-96">
      <AnimatePresence>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.8 }}
            className="pointer-events-auto"
            role="status"
          >
            <div
              className={`glass-panel-strong relative rounded-[20px] border p-4 shadow-2xl ${
                notif.estadoBus === 'EN_PANNE'
                  ? 'border-red-300/70 bg-red-50/80 dark:border-red-500/25 dark:bg-red-950/75'
                  : 'border-emerald-300/70 bg-emerald-50/80 dark:border-emerald-500/25 dark:bg-emerald-950/75'
              }`}
            >
              <button
                type="button"
                onClick={() => removeNotification(notif.id)}
                className="absolute right-2 top-2 rounded-full p-1 hover:bg-white/50 dark:hover:bg-slate-800"
                aria-label="Cerrar notificación"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-3">
                <div
                  className={`rounded-full p-2 ${
                    notif.estadoBus === 'EN_PANNE'
                      ? 'bg-red-200 dark:bg-red-900'
                      : 'bg-emerald-200 dark:bg-emerald-900'
                  }`}
                >
                  <Bell
                    className={`h-5 w-5 ${
                      notif.estadoBus === 'EN_PANNE'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                  />
                </div>
                <div className="flex-1 pr-6">
                  <p
                    className={`font-bold ${
                      notif.estadoBus === 'EN_PANNE'
                        ? 'text-red-900 dark:text-red-200'
                        : 'text-emerald-900 dark:text-emerald-200'
                    }`}
                  >
                    {notif.estadoBus === 'EN_PANNE' ? '⚠️ Bus en Panne' : '✅ Nueva Inspección'}
                  </p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-300">
                    <span className="font-bold">{notif.inspector}</span> revisó{' '}
                    <span className="font-bold">{notif.bus}</span>
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-400">
                    📍 Terminal: {notif.terminal}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-500">
                    🕒{' '}
                    {notif.timestamp.toLocaleTimeString('es-CL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
