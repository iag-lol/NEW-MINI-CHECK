import { NavLink, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { SIDEBAR_ITEMS } from '@/constants/navigation'
import { useAuthStore } from '@/store/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export const Sidebar = () => {
  const { user, logout } = useAuthStore()
  const location = useLocation()

  if (!user) return null

  const filteredNav = SIDEBAR_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.cargo)
  )

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden min-h-screen w-[var(--sidebar-width)] flex-col border-r border-slate-200/60 bg-white/95 px-6 pb-6 pt-8 backdrop-blur md:flex dark:border-slate-800 dark:bg-slate-950/90">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-500">
          Mini-Check
        </p>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          New Mini-Check
        </h1>
        <p className="text-sm text-slate-500">
          Control inteligente de flota · {user.terminal}
        </p>
      </div>

      <nav className="mt-8 flex-1 space-y-1">
        {filteredNav.map((item) => {
          const isActive = location.pathname.startsWith(item.path)
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition',
                isActive
                  ? 'bg-slate-900 text-white shadow-lg'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            {user.foto_url ? (
              <AvatarImage src={user.foto_url} alt={user.nombre} />
            ) : (
              <AvatarFallback>{user.nombre.slice(0, 1)}</AvatarFallback>
            )}
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {user.nombre}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {user.cargo}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-4 w-full justify-center gap-2 rounded-xl border border-transparent text-sm font-semibold text-slate-500 hover:border-slate-200 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  )
}
