import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, LogOut, Menu, Search, ShieldCheck } from 'lucide-react'
import { MOBILE_ITEMS, SIDEBAR_GROUPS } from '@/constants/navigation'
import { useUIStore } from '@/store/ui-store'
import { useAuthStore } from '@/store/auth-store'
import { cn } from '@/lib/utils'
import { vibrar } from '@/lib/sound'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { InstallAppCard } from '@/components/install-app'

interface DockButtonProps {
  label: string
  icon: ComponentType<{ className?: string }>
  active: boolean
  expanded?: boolean
  onSelect: () => void
}

/**
 * Pestaña del dock. El fondo activo es un único elemento compartido
 * (`layoutId`) que se desliza entre pestañas en vez de aparecer y
 * desaparecer: es lo que da la sensación de barra nativa.
 */
const DockButton = ({ label, icon: Icon, active, expanded, onSelect }: DockButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-current={active && expanded === undefined ? 'page' : undefined}
    aria-expanded={expanded}
    onClick={onSelect}
    className={cn(
      'relative flex min-w-0 flex-col items-center justify-center gap-[3px] rounded-[15px] px-0.5 py-1.5 transition-colors',
      active ? 'text-white' : 'text-slate-500 dark:text-slate-400'
    )}
  >
    {active && (
      <motion.span
        layoutId="dock-activo"
        transition={{ type: 'spring', damping: 30, stiffness: 420 }}
        className="absolute inset-0 rounded-[15px] bg-gradient-to-br from-brand-500 to-violet-600 shadow-[0_6px_16px_-8px_var(--color-brand-600)]"
      />
    )}
    <Icon className="relative h-[17px] w-[17px]" />
    <span className="relative w-full truncate text-[8.5px] font-bold tracking-[0.01em]">
      {label}
    </span>
  </button>
)

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
        // Apoyada en el borde y de lado a lado, con las esquinas redondeadas
        // sólo arriba: la píldora flotante dejaba una rendija por la que se
        // veía pasar el contenido al hacer scroll.
        className="mobile-dock glass-panel fixed inset-x-0 z-40 grid grid-flow-col auto-cols-fr items-stretch gap-0.5 rounded-t-[22px] px-1.5 pt-1 lg:hidden"
      >
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname.startsWith(item.path)
          return (
            <DockButton
              key={item.key}
              label={item.label}
              icon={Icon}
              active={isActive}
              onSelect={() => {
                if (!isActive) vibrar(8)
                setMobileRoute(item.key)
                navigate(item.path)
              }}
            />
          )
        })}

        <DockButton
          label="Más"
          icon={Menu}
          // El indicador deslizante es único: nunca puede haber dos pestañas
          // activas a la vez, aunque el panel esté abierto sobre otra sección.
          active={!hasPrimaryMatch}
          expanded={moreOpen}
          onSelect={() => {
            vibrar(8)
            setMoreOpen(true)
          }}
        />
      </nav>

      <SheetContent className="sm:max-w-[26rem]">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-md">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold leading-tight tracking-[-0.025em] text-slate-950 dark:text-white">
              Centro de operaciones
            </h2>
            <p className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
              Todos tus módulos en un lugar
            </p>
          </div>
        </div>

        <div className="relative mb-3.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar módulo..."
            aria-label="Buscar en todos los módulos"
            className="h-10 pl-9"
          />
        </div>

        <div className="space-y-3.5">
          {mobileGroups.map((group) => {
            const GroupIcon = group.icon
            const groupId = `mobile-group-${group.label
              .toLocaleLowerCase('es')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/\s+/g, '-')}`
            return (
              <section key={group.label} aria-labelledby={groupId}>
                <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
                  <GroupIcon className="h-3 w-3 text-brand-500" />
                  <h3
                    id={groupId}
                    className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"
                  >
                    {group.label}
                  </h3>
                  <span className="h-px flex-1 bg-slate-300/40 dark:bg-white/[0.07]" />
                </div>
                {/* Rejilla tipo lanzador: dos columnas caben en cualquier
                    teléfono y evitan una lista interminable de filas */}
                <div className="grid grid-cols-2 gap-1.5">
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
                          'press-feedback flex min-h-[3rem] items-center gap-2 rounded-[14px] border px-2 py-1.5 text-left',
                          isActive
                            ? 'border-brand-400/40 bg-brand-500 text-white shadow-[0_8px_18px_-12px_var(--color-brand-600)]'
                            : 'border-white/60 bg-white/40 text-slate-700 dark:border-white/[0.06] dark:bg-white/[0.035] dark:text-slate-200'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px]',
                            isActive
                              ? 'bg-white/20'
                              : 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 text-[11.5px] font-bold leading-tight">
                          {item.label}
                        </span>
                        <ChevronRight
                          className={cn(
                            'h-3 w-3 shrink-0',
                            isActive ? 'opacity-70' : 'opacity-30'
                          )}
                        />
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {mobileGroups.length === 0 && (
            <div className="rounded-[16px] border border-dashed border-slate-300/70 px-4 py-7 text-center text-[12.5px] text-slate-500 dark:border-slate-700">
              No encontramos módulos con esa búsqueda.
            </div>
          )}
        </div>

        <InstallAppCard className="mt-3.5" compact />

        {user && (
          <div className="mt-3 flex items-center gap-2.5 rounded-[18px] border border-white/60 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => navigateTo('/app/perfil')}
              className="press-feedback flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <Avatar className="h-9 w-9">
                {user.foto_url ? (
                  <AvatarImage src={user.foto_url} alt={user.nombre} />
                ) : (
                  <AvatarFallback className="bg-brand-500 text-[12px] text-white">
                    {user.nombre.slice(0, 1)}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold leading-tight text-slate-900 dark:text-white">
                  {user.nombre}
                </p>
                <p className="truncate text-[10.5px] leading-tight text-slate-500 dark:text-slate-400">
                  {user.cargo} · {user.terminal}
                </p>
              </div>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar sesión"
              className="shrink-0 text-red-500 hover:bg-red-500/10"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
