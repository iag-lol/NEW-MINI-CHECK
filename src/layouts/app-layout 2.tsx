import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'
import { TopBar } from '@/components/layout/top-bar'
import { RealtimeNotifications } from '@/components/realtime-notifications'
import { useRealtimeSubscriptions } from '@/hooks/use-realtime'
import { useRealtimeLocation } from '@/hooks/use-realtime-location'
import { useTheme } from '@/hooks/use-theme'
import { useAuthStore } from '@/store/auth-store'
import { TrackingProvider } from '@/context/tracking-context'

export const AppLayout = () => {
  useRealtimeSubscriptions()
  useTheme() // Cargar y aplicar tema del usuario
  // Activar tracking GPS automático en toda la app
  const tracking = useRealtimeLocation({ enabled: true, intervalMs: 10000 })
  const location = useLocation()
  const { setLastVisitedPath } = useAuthStore()

  useEffect(() => {
    setLastVisitedPath(location.pathname)
  }, [location.pathname, setLastVisitedPath])

  return (
    <TrackingProvider value={tracking}>
      <div className="flex min-h-screen bg-theme dark:bg-slate-950">
        <Sidebar />
        <div className="flex flex-1 flex-col md:pl-[var(--sidebar-width)]">
          <TopBar />
          <main className="flex-1 px-4 pb-32 pt-6 md:px-8 md:pb-10 transition-colors duration-300">
            <div className="w-full">
              <Outlet />
            </div>
          </main>
        </div>
        <MobileNav />
        <RealtimeNotifications />
      </div>
    </TrackingProvider>
  )
}
