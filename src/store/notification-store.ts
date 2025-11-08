import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import dayjs from '@/lib/dayjs'
import { playNotificationTone } from '@/lib/sound'

export interface SystemNotification {
  id: string
  title: string
  body: string
  createdAt: string
  read: boolean
  type?: 'info' | 'success' | 'warning' | 'error'
  metadata?: Record<string, unknown>
}

interface NotificationState {
  notifications: SystemNotification[]
  unread: number
  permissionGranted: boolean
  push: (notification: Omit<SystemNotification, 'createdAt' | 'read'>) => void
  markAsRead: (id: string) => void
  markAll: () => void
  requestPermission: () => Promise<boolean>
  clear: () => void
}

/**
 * Request browser notification permission
 */
const requestBrowserPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  return false
}

/**
 * Show native browser notification
 */
const showBrowserNotification = (title: string, body: string, type?: string) => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return
  }

  if (Notification.permission !== 'granted') {
    return
  }

  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'new-mini-check-notification',
    requireInteraction: false,
    silent: false,
    data: { type },
  })

  // Auto-close after 5 seconds
  setTimeout(() => {
    notification.close()
  }, 5000)

  // Click handler to bring app to focus
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unread: 0,
      permissionGranted: false,

      push: ({ id, title, body, type = 'info', metadata }) => {
        const { permissionGranted } = get()

        // Show browser notification
        if (permissionGranted) {
          showBrowserNotification(title, body, type)
        }

        // Play sound
        playNotificationTone()

        const payload: SystemNotification = {
          id,
          title,
          body,
          type,
          metadata,
          createdAt: dayjs().toISOString(),
          read: false,
        }

        set((state) => ({
          notifications: [payload, ...state.notifications].slice(0, 50),
          unread: state.unread + 1,
        }))
      },

      markAsRead: (id) =>
        set((state) => {
          const notification = state.notifications.find((n) => n.id === id)
          if (!notification || notification.read) return state

          return {
            notifications: state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unread: Math.max(0, state.unread - 1),
          }
        }),

      markAll: () =>
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            read: true,
          })),
          unread: 0,
        })),

      requestPermission: async () => {
        const granted = await requestBrowserPermission()
        set({ permissionGranted: granted })
        return granted
      },

      clear: () =>
        set({
          notifications: [],
          unread: 0,
        }),
    }),
    {
      name: 'mini-check-notifications',
      partialize: (state) => ({
        notifications: state.notifications,
        unread: state.unread,
      }),
    }
  )
)
