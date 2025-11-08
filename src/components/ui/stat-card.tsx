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

const variantStyles = {
  default: {
    bg: 'bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900 dark:to-slate-800/50',
    border: 'border-slate-200/60 dark:border-slate-700',
    icon: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    value: 'text-slate-900 dark:text-white',
  },
  success: {
    bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20',
    border: 'border-emerald-200/60 dark:border-emerald-800/40',
    icon: 'bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300',
    value: 'text-emerald-900 dark:text-emerald-100',
  },
  warning: {
    bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20',
    border: 'border-amber-200/60 dark:border-amber-800/40',
    icon: 'bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300',
    value: 'text-amber-900 dark:text-amber-100',
  },
  danger: {
    bg: 'bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20',
    border: 'border-red-200/60 dark:border-red-800/40',
    icon: 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300',
    value: 'text-red-900 dark:text-red-100',
  },
  info: {
    bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20',
    border: 'border-blue-200/60 dark:border-blue-800/40',
    icon: 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300',
    value: 'text-blue-900 dark:text-blue-100',
  },
}

/**
 * StatCard - Professional statistics card component
 * Displays key metrics with optional icon, trend, and description
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-all',
        styles.bg,
        styles.border,
        onClick && 'cursor-pointer hover:shadow-md',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</p>
          <motion.p
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className={cn('mt-2 text-3xl font-bold tabular-nums', styles.value)}
          >
            {value}
          </motion.p>
          {description && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          )}
          {trend && (
            <div className="mt-3 flex items-center gap-1">
              <span
                className={cn(
                  'text-xs font-semibold',
                  trend.value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                {trend.value > 0 ? '+' : ''}
                {trend.value}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{trend.label}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-xl p-3 transition-transform group-hover:scale-110', styles.icon)}>
            <Icon className="h-6 w-6" strokeWidth={2.5} />
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
 * MiniStat - Compact statistics display
 */
export const MiniStat = ({ label, value, icon, className }: MiniStatProps) => {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-950/40',
        className
      )}
    >
      {icon && <div className="text-slate-400">{icon}</div>}
      <div className="flex-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  )
}
