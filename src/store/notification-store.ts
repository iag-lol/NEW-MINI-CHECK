import { create } from 'zustand'
import dayjs from '@/lib/dayjs'
import { playNotificationTone } from '@/lib/sound'

export interface SystemNotification {
  id: string
  title: string
  body: string
  createdAt: string
  read: boolean
}

interface NotificationState {
  notifications: SystemNotification[]
  unread: number
  push: (notification: Omit<SystemNotification, 'createdAt' | 'read'>) => void
  markAsRead: (id: string) => void
  markAll: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unread: 0,
  push: ({ id, title, body }) => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }
    playNotificationTone()
    const payload: SystemNotification = {
      id,
      title,
      body,
      createdAt: dayjs().toISOString(),
      read: false,
    }
    set((state) => ({
      notifications: [payload, ...state.notifications].slice(0, 25),
      unread: state.unread + 1,
    }))
  },
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      ),
      unread: Math.max(0, state.unread - 1),
    })),
  markAll: () =>
    set((state) => ({
      notifications: state.notifications.map((notification) => ({
        ...notification,
        read: true,
      })),
      unread: 0,
    })),
}))
