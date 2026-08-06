import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, ChevronDown, Search, ShieldCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { SIDEBAR_GROUPS } from '@/constants/navigation'
import { useAuthStore } from '@/store/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'

export const Sidebar = () => {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(SIDEBAR_GROUPS.filter(g => g.defaultOpen).map(g => g.label))
  )
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        window.matchMedia('(min-width: 1024px)').matches &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('')
        searchInputRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  if (!user) return null

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  const filteredGroups = SIDEBAR_GROUPS.filter(
    (group) => !group.roles || group.roles.includes(user.cargo)
  ).map(group => ({
    ...group,
    items: group.items.filter(item => !item.roles || item.roles.includes(user.cargo))
  }))

  // Búsqueda inteligente
  const allItems = filteredGroups.flatMap(g => g.items)
  const searchResults = searchQuery.trim()
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  return (
    <aside className="glass-panel fixed inset-y-3 left-3 z-30 hidden w-[calc(var(--sidebar-width)-1.5rem)] flex-col overflow-hidden rounded-[28px] lg:flex">
      {/* Header con glassmorphism */}
      <div className="relative overflow-hidden border-b border-white/60 bg-gradient-to-br from-white/45 via-brand-50/25 to-violet-100/20 px-5 pb-5 pt-6 dark:border-white/5 dark:from-white/[0.06] dark:via-brand-500/[0.05] dark:to-violet-500/[0.06]">
        <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-brand-400/15 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-[15px] border border-white/30 bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-[0_12px_26px_-12px_var(--color-brand-600)]">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400 dark:border-slate-900" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-extrabold tracking-[-0.035em] text-slate-950 dark:text-white">
                Mini-Check
              </h1>
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Operaciones · {user.terminal}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Búsqueda inteligente */}
      <div className="relative border-b border-white/60 px-4 py-3.5 dark:border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchInputRef}
            aria-label="Buscar un módulo"
            placeholder="Buscar módulo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-xl pl-10 pr-14 text-sm placeholder:text-slate-400"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-slate-200/70 bg-white/55 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-400 shadow-sm dark:border-white/10 dark:bg-white/5">
            ⌘K
          </kbd>
        </div>

        {/* Resultados de búsqueda */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-panel-strong absolute inset-x-0 top-full z-50 mt-2 space-y-1 overflow-hidden rounded-2xl p-2"
            >
              {searchResults.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path)
                      setSearchQuery('')
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/70 dark:hover:bg-white/10"
                  >
                    <Icon className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navegación con grupos colapsables */}
      <ScrollArea className="flex-1 px-3.5 py-3">
        <nav className="space-y-2">
          {filteredGroups.map((group) => {
            const isOpen = openGroups.has(group.label)
            const GroupIcon = group.icon
            const hasActiveItem = group.items.some(item =>
              location.pathname.startsWith(item.path)
            )

            return (
              <div key={group.label} className="space-y-1">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isOpen}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-[0.13em] transition-colors',
                    hasActiveItem
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GroupIcon className="h-4 w-4" />
                    <span>{group.label}</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform duration-200',
                      isOpen ? 'rotate-180' : ''
                    )}
                  />
                </button>

                {/* Group items */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-1 overflow-hidden"
                    >
                      {group.items.map((item) => {
                        const isActive = location.pathname.startsWith(item.path)
                        const Icon = item.icon
                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            className={cn(
                              'group relative flex items-center gap-3 overflow-hidden rounded-[14px] border px-3.5 py-2.5 text-[13px] font-semibold transition-all',
                              isActive
                                ? 'border-white/20 bg-gradient-to-r from-brand-500 to-violet-600 text-white shadow-[0_10px_24px_-14px_var(--color-brand-600)]'
                                : 'border-transparent text-slate-600 hover:border-white/60 hover:bg-white/55 hover:text-slate-950 dark:text-slate-400 dark:hover:border-white/5 dark:hover:bg-white/[0.07] dark:hover:text-white'
                            )}
                          >
                            <Icon className={cn(
                              'h-4 w-4 transition-transform group-hover:scale-110',
                              isActive && 'drop-shadow-lg'
                            )} />
                            <span>{item.label}</span>
                            {item.badge && (
                              <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                                {item.badge}
                              </span>
                            )}
                          </NavLink>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </nav>
      </ScrollArea>

      {/* User profile con glassmorphism mejorado */}
      <div className="flex flex-col gap-2.5 border-t border-white/60 p-3.5 dark:border-white/5">
        <div className="group relative overflow-hidden rounded-[20px] border border-white/60 bg-white/40 p-3.5 shadow-sm backdrop-blur-xl transition-all hover:bg-white/60 hover:shadow-lg dark:border-white/[0.07] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-purple-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="relative flex items-center gap-3">
            <Avatar className="h-11 w-11 ring-2 ring-white/70 shadow-lg dark:ring-white/10">
              {user.foto_url ? (
                <AvatarImage src={user.foto_url} alt={user.nombre} />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-brand-500 to-purple-600 text-white font-bold">
                  {user.nombre.slice(0, 1)}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {user.nombre}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                {user.cargo}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="relative mt-3 w-full justify-center gap-2 rounded-xl text-sm font-semibold"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>

        <div className="text-center">
          <a
            href="https://www.zyteron.cl"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-slate-400 transition-colors hover:text-brand-500 dark:text-slate-500 dark:hover:text-brand-400"
          >
            Desarrollado por Zyteron
          </a>
        </div>
      </div>
    </aside>
  )
}
