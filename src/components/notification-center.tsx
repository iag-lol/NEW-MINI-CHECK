import { Bell, CheckCircle2, AlertCircle, Info, CheckCheck } from 'lucide-react'
import { useMemo, useEffect } from 'react'
import dayjs from '@/lib/dayjs'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useNotificationStore } from '@/store/notification-store'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/store/auth-store'

const NotificationIcon = ({ type }: { type?: string }) => {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-amber-500" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />
    default:
      return <Info className="h-4 w-4 text-blue-500" />
  }
}

export const NotificationCenter = () => {
  const { notifications, unread, markAll, requestPermission, permissionGranted } = useNotificationStore()
  const { user } = useAuthStore()

  // Request notification permission for supervisors and jefes de terminal
  useEffect(() => {
    if ((user?.cargo === 'SUPERVISOR' || user?.cargo === 'JEFE DE TERMINAL') && !permissionGranted) {
      requestPermission()
    }
  }, [user, permissionGranted, requestPermission])

  const grouped = useMemo(() => {
    const groups: Record<string, typeof notifications> = {}
    notifications.forEach((notification) => {
      const day = dayjs(notification.createdAt).format('DD MMM')
      groups[day] = groups[day] ? [...groups[day], notification] : [notification]
    })
    return groups
  }, [notifications])

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="relative rounded-full border border-transparent text-slate-500 hover:border-slate-200 hover:bg-white/80 dark:text-slate-200 dark:hover:bg-slate-900"
          aria-label="Abrir notificaciones"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Notificaciones
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Eventos en tiempo real del sistema
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAll}
            disabled={!unread}
            className="text-xs font-semibold text-brand-600"
          >
            Marcar todo leído
          </Button>
        </div>
        <ScrollArea className="mt-6 h-[calc(100vh-200px)] pr-4">
          {notifications.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200/70 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
              Aún no hay notificaciones. Cuando se envíe una revisión, los supervisores
              verán las alertas aquí.
            </div>
          )}
          <div className="space-y-6">
            {Object.entries(grouped).map(([day, items]) => (
              <div key={day} className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">{day}</p>
                <div className="space-y-3">
                  {items.map((notification) => (
                    <div
                      key={notification.id}
                      className="group rounded-2xl border border-slate-100/80 bg-slate-50/60 p-4 text-sm shadow-sm transition-all hover:border-slate-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          <NotificationIcon type={notification.type} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {notification.title}
                            </p>
                            {!notification.read ? (
                              <Badge variant="warning" className="shrink-0">Nuevo</Badge>
                            ) : (
                              <CheckCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                            )}
                          </div>
                          <p className="mt-1 text-slate-500 dark:text-slate-400">
                            {notification.body}
                          </p>
                          <p className="mt-2 text-xs text-slate-400">
                            {dayjs(notification.createdAt).format('HH:mm')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
