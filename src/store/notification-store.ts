import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import dayjs from '@/lib/dayjs'
import { playNotificationTone, vibrar, type TonoNotificacion } from '@/lib/sound'
import { actualizarBadge, getServiceWorkerRegistration } from '@/lib/pwa'

export interface SystemNotification {
  id: string
  title: string
  body: string
  createdAt: string
  read: boolean
  type?: TonoNotificacion
  /** Ruta a la que navegar al pulsar la notificación */
  url?: string
  /** Agrupa notificaciones del sistema: una nueva reemplaza a la anterior del mismo tag */
  tag?: string
  metadata?: Record<string, unknown>
}

export type PermisoNotificacion = 'default' | 'granted' | 'denied' | 'unsupported'

interface NotificationState {
  notifications: SystemNotification[]
  unread: number
  permiso: PermisoNotificacion
  browserNotificationsEnabled: boolean
  /** El usuario apagó los avisos a mano: no se vuelven a encender solos */
  silenciado: boolean
  soundEnabled: boolean
  vibrationEnabled: boolean
  push: (notification: Omit<SystemNotification, 'createdAt' | 'read'>) => void
  markAsRead: (id: string) => void
  markAll: () => void
  remove: (id: string) => void
  requestPermission: () => Promise<boolean>
  syncPermiso: () => void
  setBrowserNotificationsEnabled: (enabled: boolean) => void
  setSoundEnabled: (enabled: boolean) => void
  setVibrationEnabled: (enabled: boolean) => void
  clear: () => void
}

const soportaNotificaciones = () =>
  typeof window !== 'undefined' && 'Notification' in window

const leerPermiso = (): PermisoNotificacion => {
  if (!soportaNotificaciones()) return 'unsupported'
  return Notification.permission as PermisoNotificacion
}

/**
 * Muestra la notificación del sistema operativo.
 *
 * En Android/Chrome `new Notification()` lanza una excepción: hay que pasar
 * por el service worker. En escritorio el worker también funciona, así que se
 * prioriza y `new Notification()` queda sólo como plan B (Safari de escritorio,
 * navegadores sin SW registrado).
 */
const mostrarNotificacionSistema = async (n: SystemNotification) => {
  if (!soportaNotificaciones() || Notification.permission !== 'granted') return

  const options: NotificationOptions & {
    vibrate?: number[]
    renotify?: boolean
    badge?: string
  } = {
    body: n.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: n.tag ?? n.id,
    renotify: Boolean(n.tag),
    // Con la pestaña en segundo plano el audio de la app puede estar
    // suspendido: ahí el sonido lo tiene que poner el sistema operativo.
    silent: false,
    vibrate: [18, 40, 18],
    data: { url: n.url ?? '/app/dashboard', type: n.type },
  }

  // `serviceWorker.ready` no resuelve nunca si no hay ningún registro en
  // marcha —por ejemplo servido por HTTP, donde los SW están prohibidos—.
  // Sin este límite la notificación se quedaba esperando para siempre y no
  // aparecía nada, ni por el worker ni por la vía clásica.
  const conLimite = <T,>(promesa: Promise<T>, ms: number) =>
    Promise.race([
      promesa,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
    ])

  const registration =
    getServiceWorkerRegistration() ??
    (navigator.serviceWorker
      ? await conLimite(navigator.serviceWorker.ready, 1500).catch(() => null)
      : null)

  if (registration) {
    try {
      await registration.showNotification(n.title, options)
      return
    } catch (error) {
      console.warn('showNotification falló, se intenta la API clásica', error)
    }
  }

  try {
    const notification = new Notification(n.title, options)
    notification.onclick = () => {
      window.focus()
      if (n.url) window.location.assign(n.url)
      notification.close()
    }
    window.setTimeout(() => notification.close(), 8000)
  } catch (error) {
    console.warn('No se pudo mostrar la notificación del sistema', error)
  }
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unread: 0,
      permiso: leerPermiso(),
      // Si el navegador ya tiene el permiso concedido, los avisos deben salir
      // desde el primer momento. Arrancar en `false` dejaba a quien ya había
      // autorizado las notificaciones sin recibir ninguna y sin ninguna pista
      // de por qué: el interruptor estaba escondido tras los ajustes.
      browserNotificationsEnabled: leerPermiso() === 'granted',
      silenciado: false,
      soundEnabled: true,
      vibrationEnabled: true,

      push: (entrada) => {
        const {
          permiso,
          browserNotificationsEnabled,
          soundEnabled,
          vibrationEnabled,
          notifications,
        } = get()

        // Los canales realtime pueden informar el mismo evento más de una vez.
        if (notifications.some((notification) => notification.id === entrada.id)) return

        const payload: SystemNotification = {
          type: 'info',
          ...entrada,
          createdAt: dayjs().toISOString(),
          read: false,
        }

        const enPrimerPlano =
          typeof document === 'undefined' || document.visibilityState === 'visible'

        if (permiso === 'granted' && browserNotificationsEnabled) {
          void mostrarNotificacionSistema(payload)
        }

        // Sólo sonamos nosotros cuando el usuario está mirando la app; si no,
        // el tono ya lo pone la notificación del sistema y sonaría dos veces.
        if (soundEnabled && enPrimerPlano) playNotificationTone(payload.type)
        if (vibrationEnabled && enPrimerPlano) vibrar()

        set((state) => {
          const unread = state.unread + 1
          actualizarBadge(unread)
          return {
            notifications: [payload, ...state.notifications].slice(0, 80),
            unread,
          }
        })
      },

      markAsRead: (id) =>
        set((state) => {
          const notification = state.notifications.find((n) => n.id === id)
          if (!notification || notification.read) return state

          const unread = Math.max(0, state.unread - 1)
          actualizarBadge(unread)
          return {
            notifications: state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unread,
          }
        }),

      markAll: () => {
        actualizarBadge(0)
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            read: true,
          })),
          unread: 0,
        }))
      },

      remove: (id) =>
        set((state) => {
          const notification = state.notifications.find((n) => n.id === id)
          const unread =
            notification && !notification.read
              ? Math.max(0, state.unread - 1)
              : state.unread
          actualizarBadge(unread)
          return {
            notifications: state.notifications.filter((n) => n.id !== id),
            unread,
          }
        }),

      requestPermission: async () => {
        if (!soportaNotificaciones()) {
          set({ permiso: 'unsupported', browserNotificationsEnabled: false })
          return false
        }

        let permission = Notification.permission
        if (permission === 'default') {
          permission = await Notification.requestPermission()
        }

        const granted = permission === 'granted'
        set({
          permiso: permission as PermisoNotificacion,
          browserNotificationsEnabled: granted,
        })
        return granted
      },

      syncPermiso: () => {
        const permiso = leerPermiso()
        set((state) => ({
          permiso,
          // Con el permiso concedido los avisos van activos, salvo que el
          // usuario los haya apagado él mismo desde los ajustes.
          browserNotificationsEnabled: permiso === 'granted' && !state.silenciado,
        }))
      },

      setBrowserNotificationsEnabled: (enabled) =>
        set((state) => ({
          browserNotificationsEnabled: enabled && state.permiso === 'granted',
          silenciado: !enabled,
        })),

      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setVibrationEnabled: (enabled) => set({ vibrationEnabled: enabled }),

      clear: () => {
        actualizarBadge(0)
        set({ notifications: [], unread: 0 })
      },
    }),
    {
      name: 'mini-check-notifications',
      version: 3,
      // Sin `migrate`, zustand descarta el estado guardado al subir de versión
      // y todo el mundo volvía a arrancar con los avisos apagados.
      migrate: (estado) => {
        const previo = (estado ?? {}) as Partial<NotificationState>
        return {
          ...previo,
          silenciado: previo.silenciado ?? false,
          vibrationEnabled: previo.vibrationEnabled ?? true,
          soundEnabled: previo.soundEnabled ?? true,
        } as NotificationState
      },
      partialize: (state) => ({
        notifications: state.notifications,
        unread: state.unread,
        browserNotificationsEnabled: state.browserNotificationsEnabled,
        silenciado: state.silenciado,
        soundEnabled: state.soundEnabled,
        vibrationEnabled: state.vibrationEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        // El permiso vive en el navegador, no en el storage: siempre releerlo.
        state?.syncPermiso()
        if (state?.unread) actualizarBadge(state.unread)
      },
    }
  )
)
