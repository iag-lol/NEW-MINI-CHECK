import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: {
    value: number
    label: string
  }
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
  onClick?: () => void
}

/**
 * Paletas planas y de bajo contraste: el color identifica la métrica, no
 * compite con ella. Los degradados fuertes anteriores hacían que seis
 * tarjetas juntas en un móvil parecieran un semáforo.
 */
const variantStyles = {
  default: {
    bg: 'bg-white/55 dark:bg-white/[0.05]',
    border: 'border-white/70 dark:border-white/[0.07]',
    icon: 'bg-slate-500/10 text-slate-500 dark:text-slate-300',
    value: 'text-slate-900 dark:text-white',
    accent: 'bg-slate-400/50',
  },
  success: {
    bg: 'bg-emerald-50/55 dark:bg-emerald-500/[0.07]',
    border: 'border-emerald-200/50 dark:border-emerald-500/15',
    icon: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
    value: 'text-emerald-700 dark:text-emerald-200',
    accent: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-50/55 dark:bg-amber-500/[0.07]',
    border: 'border-amber-200/50 dark:border-amber-500/15',
    icon: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
    value: 'text-amber-700 dark:text-amber-200',
    accent: 'bg-amber-500',
  },
  danger: {
    bg: 'bg-red-50/55 dark:bg-red-500/[0.07]',
    border: 'border-red-200/50 dark:border-red-500/15',
    icon: 'bg-red-500/12 text-red-600 dark:text-red-300',
    value: 'text-red-700 dark:text-red-200',
    accent: 'bg-red-500',
  },
  info: {
    bg: 'bg-brand-50/50 dark:bg-brand-500/[0.08]',
    border: 'border-brand-200/50 dark:border-brand-500/15',
    icon: 'bg-brand-500/12 text-brand-600 dark:text-brand-300',
    value: 'text-brand-700 dark:text-brand-200',
    accent: 'bg-brand-500',
  },
}

/**
 * StatCard - tarjeta de métrica.
 * Compacta en móvil, con más aire a partir de tablet.
 */
export const StatCard = ({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = 'default',
  className,
  onClick,
}: StatCardProps) => {
  const styles = variantStyles[variant]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      whileTap={onClick ? { scale: 0.975 } : undefined}
      className={cn(
        'group relative overflow-hidden rounded-[var(--app-radius)] border p-2.5 backdrop-blur-md transition-all sm:p-4',
        styles.bg,
        styles.border,
        onClick &&
          'cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--glass-shadow-soft)]',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {/* Filete de color: identifica la métrica sin teñir toda la tarjeta */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-2.5 h-[calc(100%-1.25rem)] w-[2.5px] rounded-full opacity-70',
          styles.accent
        )}
      />

      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400 sm:text-[10.5px]">
            {title}
          </p>
          <p
            className={cn(
              'mt-1 text-[22px] font-extrabold leading-none tracking-[-0.045em] tabular-nums sm:mt-1.5 sm:text-[28px]',
              styles.value
            )}
          >
            {value}
          </p>
          {description && (
            <p className="mt-1 truncate text-[10.5px] leading-tight text-slate-500 dark:text-slate-400 sm:text-[11.5px]">
              {description}
            </p>
          )}
          {trend && (
            <div className="mt-1.5 flex items-center gap-1">
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums',
                  trend.value > 0
                    ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/12 text-red-600 dark:text-red-400'
                )}
              >
                {trend.value > 0 ? '+' : ''}
                {trend.value}%
              </span>
              <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                {trend.label}
              </span>
            </div>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              'shrink-0 rounded-[10px] p-1.5 transition-transform group-hover:scale-105 sm:rounded-xl sm:p-2',
              styles.icon
            )}
          >
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.4} />
          </div>
        )}
      </div>
    </motion.div>
  )
}

interface MiniStatProps {
  label: string
  value: string | number
  icon?: ReactNode
  className?: string
}

/**
 * MiniStat - dato suelto dentro de una tarjeta mayor.
 */
export const MiniStat = ({ label, value, icon, className }: MiniStatProps) => {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-2 dark:border-white/[0.06] dark:bg-white/[0.035] sm:gap-2.5 sm:p-2.5',
        className
      )}
    >
      {icon && <div className="shrink-0 text-slate-400">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="text-[15px] font-bold tabular-nums text-slate-900 dark:text-white sm:text-base">
          {value}
        </p>
      </div>
    </div>
  )
}
