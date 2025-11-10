import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, ChevronDown, Search, Command } from 'lucide-react'
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
    <aside className="fixed inset-y-0 left-0 z-30 hidden min-h-screen w-[var(--sidebar-width)] flex-col border-r border-slate-200/60 bg-gradient-to-b from-white/95 via-white/95 to-slate-50/95 backdrop-blur-xl md:flex dark:border-slate-800 dark:from-slate-950/95 dark:via-slate-950/95 dark:to-slate-900/95">
      {/* Header con glassmorphism */}
      <div className="relative overflow-hidden border-b border-slate-200/60 bg-gradient-to-r from-brand-50/50 to-purple-50/30 px-6 pb-6 pt-8 dark:border-slate-800 dark:from-brand-950/30 dark:to-purple-950/20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDk5LDEwMiwyNDEsMC4wNSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 text-white shadow-lg shadow-brand-500/20">
              <Command className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white">
                Mini-Check
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {user.terminal}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Búsqueda inteligente */}
      <div className="border-b border-slate-200/60 px-4 py-4 dark:border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar... (Cmd+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-xl border-slate-200/60 bg-white/60 pl-10 pr-4 text-sm placeholder:text-slate-400 dark:border-slate-800 dark:bg-slate-900/40"
          />
        </div>

        {/* Resultados de búsqueda */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-1 overflow-hidden rounded-xl border border-slate-200/60 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900"
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
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
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
      <ScrollArea className="flex-1 px-4 py-4">
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
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors',
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
                              'group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                              isActive
                                ? 'bg-gradient-to-r from-brand-500 to-purple-600 text-white shadow-lg shadow-brand-500/20'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-white'
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
      <div className="border-t border-slate-200/60 p-4 dark:border-slate-800">
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white/80 to-slate-50/60 p-4 backdrop-blur-sm transition-all hover:shadow-lg dark:border-slate-700/50 dark:from-slate-800/80 dark:to-slate-900/60">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-purple-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="relative flex items-center gap-3">
            <Avatar className="h-12 w-12 ring-2 ring-white shadow-lg dark:ring-slate-800">
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
            className="relative mt-3 w-full justify-center gap-2 rounded-xl border border-slate-200/60 bg-white/60 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </aside>
  )
}
