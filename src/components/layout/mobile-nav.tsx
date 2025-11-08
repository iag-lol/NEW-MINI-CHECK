import { useLocation, useNavigate } from 'react-router-dom'
import { MOBILE_ITEMS } from '@/constants/navigation'
import { useUIStore } from '@/store/ui-store'
import { cn } from '@/lib/utils'

export const MobileNav = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { setMobileRoute } = useUIStore()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-slate-200/60 bg-white/95 px-4 shadow-2xl backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/90">
      {MOBILE_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = location.pathname.startsWith(item.path)
        return (
          <button
            key={item.key}
            type="button"
            className={cn(
              'flex flex-col items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition',
              isActive ? 'text-brand-600' : 'text-slate-400'
            )}
            onClick={() => {
              setMobileRoute(item.key)
              navigate(item.path)
            }}
          >
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border text-slate-500',
                isActive
                  ? 'border-brand-200 bg-brand-50 text-brand-600'
                  : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
