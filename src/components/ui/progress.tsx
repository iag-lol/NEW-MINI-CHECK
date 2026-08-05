import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  className?: string
}

export const Progress = ({ value, className }: ProgressProps) => (
  <div
    className={cn(
      'h-2 w-full overflow-hidden rounded-full bg-slate-200/60 shadow-inner dark:bg-slate-800/70',
      className
    )}
  >
    <div
      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 shadow-[0_0_12px_color-mix(in_srgb,var(--color-brand-500)_55%,transparent)] transition-[width]"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
)
