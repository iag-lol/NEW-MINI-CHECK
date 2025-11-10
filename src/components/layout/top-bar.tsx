import dayjs from '@/lib/dayjs'
import { SIDEBAR_ITEMS } from '@/constants/navigation'
import { useAuthStore } from '@/store/auth-store'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationCenter } from '@/components/notification-center'
import { useLocation } from 'react-router-dom'
import { TrackingStatus } from '@/components/layout/tracking-status'
import type { TrackingSnapshot } from '@/hooks/use-realtime-location'

interface TopBarProps {
  tracking: TrackingSnapshot
}

export const TopBar = ({ tracking }: TopBarProps) => {
  const { user } = useAuthStore()
  const location = useLocation()
  const currentItem =
    SIDEBAR_ITEMS.find((item) => location.pathname.startsWith(item.path)) ?? SIDEBAR_ITEMS[0]

  return (
    <header className="sticky top-0 z-20 w-full border-b border-transparent px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-slate-950/70">
      <div className="flex items-center justify-between gap-4">
        <div>
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
        <div className="flex items-center gap-2">
          <TrackingStatus {...tracking} />
          <ThemeToggle />
          <NotificationCenter />
        </div>
      </div>
    </header>
  )
}
