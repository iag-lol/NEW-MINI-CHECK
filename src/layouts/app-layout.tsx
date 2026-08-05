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
      <div className="app-shell flex min-h-[100dvh] bg-transparent">
        <a
          href="#main-content"
          className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xl transition-transform focus:translate-y-0"
        >
          Saltar al contenido
        </a>
        <div aria-hidden="true" className="app-ambient app-ambient--one" />
        <div aria-hidden="true" className="app-ambient app-ambient--two" />
        <Sidebar />
        {/* min-w-0: sin esto el flex item hereda el ancho intrínseco del contenido
            (tablas, steppers, mapas) y toda la app se desborda en móviles */}
        <div className="relative z-0 flex min-w-0 flex-1 flex-col lg:pl-[var(--sidebar-width)]">
          <TopBar />
          <main
            id="main-content"
            tabIndex={-1}
            className="safe-bottom flex-1 px-3 pt-2 outline-none sm:px-5 sm:pt-3 md:px-6 md:pb-8 lg:px-8"
          >
            <div className="app-content">
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
