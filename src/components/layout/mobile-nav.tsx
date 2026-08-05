import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, Menu, Search, ShieldCheck } from 'lucide-react'
import { MOBILE_ITEMS, SIDEBAR_GROUPS } from '@/constants/navigation'
import { useUIStore } from '@/store/ui-store'
import { useAuthStore } from '@/store/auth-store'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

export const MobileNav = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { setMobileRoute } = useUIStore()
  const { user, logout } = useAuthStore()
  const [moreOpen, setMoreOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        window.matchMedia('(max-width: 1023px)').matches &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault()
        setMoreOpen(true)
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const visibleItems = MOBILE_ITEMS.filter(
    (item) => !item.roles || (user && item.roles.includes(user.cargo))
  )

  const mobileGroups = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('es')

    return SIDEBAR_GROUPS.filter(
      (group) => !group.roles || (user && group.roles.includes(user.cargo))
    )
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            (!item.roles || (user && item.roles.includes(user.cargo))) &&
            (!query || item.label.toLocaleLowerCase('es').includes(query))
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [searchQuery, user])

  const navigateTo = (path: string) => {
    navigate(path)
    setMoreOpen(false)
    setSearchQuery('')
  }

  const hasPrimaryMatch = visibleItems.some((item) =>
    location.pathname.startsWith(item.path)
  )

  return (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <nav
        aria-label="Navegación principal móvil"
        className="mobile-dock glass-panel fixed bottom-2 left-2 right-2 z-40 grid min-h-[4.4rem] grid-flow-col auto-cols-fr items-end gap-0.5 rounded-[26px] px-1.5 pt-1.5 lg:hidden"
      >
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname.startsWith(item.path)
          return (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-1 text-[9px] font-semibold tracking-[-0.01em] transition',
                isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
              )}
              onClick={() => {
                setMobileRoute(item.key)
                navigate(item.path)
              }}
            >
              <span
                className={cn(
                  'relative flex h-9 w-11 items-center justify-center rounded-[14px] border transition-all',
                  isActive
                    ? 'border-white/30 bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-[0_9px_20px_-10px_var(--color-brand-600)]'
                    : 'border-transparent bg-transparent text-slate-500 group-active:bg-white/50 dark:text-slate-400 dark:group-active:bg-white/10'
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="w-full truncate">{item.label}</span>
            </button>
          )
        })}

        <button
          type="button"
          aria-label="Ver todos los módulos"
          aria-expanded={moreOpen}
          className={cn(
            'group flex min-w-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-1 text-[9px] font-semibold transition',
            moreOpen || !hasPrimaryMatch
              ? 'text-brand-600 dark:text-brand-300'
              : 'text-slate-500 dark:text-slate-400'
          )}
          onClick={() => setMoreOpen(true)}
        >
          <span
            className={cn(
              'flex h-9 w-11 items-center justify-center rounded-[14px] border transition-all',
              moreOpen || !hasPrimaryMatch
                ? 'border-white/30 bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-[0_9px_20px_-10px_var(--color-brand-600)]'
                : 'border-transparent text-slate-500 group-active:bg-white/50 dark:text-slate-400 dark:group-active:bg-white/10'
            )}
          >
            <Menu className="h-[18px] w-[18px]" />
          </span>
          <span>Más</span>
        </button>
      </nav>

      <SheetContent className="max-w-[min(92vw,26rem)]">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-950 dark:text-white">
              Centro de operaciones
            </h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Todos tus módulos en un lugar
            </p>
          </div>
        </div>

        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar módulo..."
            aria-label="Buscar en todos los módulos"
            className="pl-10"
          />
        </div>

        <div className="space-y-5">
          {mobileGroups.map((group) => {
            const GroupIcon = group.icon
            const groupId = `mobile-group-${group.label
              .toLocaleLowerCase('es')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\s+/g, '-')}`
            return (
              <section key={group.label} aria-labelledby={groupId}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <GroupIcon className="h-3.5 w-3.5 text-brand-500" />
                  <h3
                    id={groupId}
                    className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400"
                  >
                    {group.label}
                  </h3>
                </div>
                <div className="space-y-1 rounded-[20px] border border-white/60 bg-white/35 p-1.5 dark:border-white/[0.06] dark:bg-white/[0.035]">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname.startsWith(item.path)
                    return (
                      <button
                        key={item.path}
                        type="button"
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => navigateTo(item.path)}
                        className={cn(
                          'flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left transition',
                          isActive
                            ? 'bg-brand-500 text-white shadow-md'
                            : 'text-slate-700 hover:bg-white/65 dark:text-slate-200 dark:hover:bg-white/[0.07]'
                        )}
                      >
                        <span className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                          isActive ? 'bg-white/15' : 'bg-white/60 text-brand-600 dark:bg-white/[0.07] dark:text-brand-300'
                        )}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {item.label}
                        </span>
                        <ChevronRight className="h-4 w-4 opacity-55" />
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {mobileGroups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300/70 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
              No encontramos módulos con esa búsqueda.
            </div>
          )}
        </div>

        {user && (
          <div className="mt-6 rounded-[22px] border border-white/60 bg-white/40 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11">
                {user.foto_url ? (
                  <AvatarImage src={user.foto_url} alt={user.nombre} />
                ) : (
                  <AvatarFallback className="bg-brand-500 text-white">
                    {user.nombre.slice(0, 1)}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  {user.nombre}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {user.cargo} · {user.terminal}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="mt-3 w-full gap-2"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
